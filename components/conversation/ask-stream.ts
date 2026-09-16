import {
  askBrowserTimeoutMs,
  maxAskAssistantMessageLength,
  maxAskFollowUpQuestionLength,
  maxAskFollowUps,
  maxAskLongFollowUpLabelCodePoints,
  maxAskShortFollowUpLabelCodePoints,
  maxAskSources,
  maxAskStreamBytes,
  type AskCompletion,
  type AskFollowUp,
  type AskRequest,
  type AskSource,
} from "@/lib/ask.contract";
import type { ConversationMode } from "./use-conversation";

const genericError = "Unable to finish the answer. Please try again.";
const protocolFailureDetail = "The answer service returned a response the chat could not read.";
const connectionFailureDetail = "The connection to the answer service failed.";
const timeoutFailureDetail = "The answer service did not respond within 65 seconds.";
const serviceFailureDetail = "The answer service reported a failure while generating this reply.";

/** Carries public recovery guidance and a safe factual failure explanation. */
export class AskStreamError extends Error {
  readonly detail: string;

  /**
   * Creates a display-safe transport error.
   * @param message - Public recovery guidance.
   * @param detail - Public problem detail containing only client-observed facts.
   */
  constructor(message: string, detail: string) {
    super(message);
    this.name = "AskStreamError";
    this.detail = detail;
  }
}

/** Callbacks that receive validated answer-stream events. */
export interface AskStreamCallbacks {
  onMetadata: (mode: ConversationMode) => void;
  onDelta: (text: string) => void;
}

/** Terminal data returned after a complete answer stream. */
export type AskStreamResult = AskCompletion;

interface StreamState {
  metadata: boolean;
  answered: boolean;
  answerLength: number;
  completion?: AskCompletion;
  done: boolean;
}

/** Creates a display-safe transport error.
 * @param message - Public recovery guidance.
 * @param detail - Public problem detail containing only client-observed facts.
 * @returns An identifiable safe error.
 */
function failure(message = genericError, detail = protocolFailureDetail): AskStreamError {
  return new AskStreamError(message, detail);
}

/** Checks that parsed JSON has exactly the expected fields.
 * @param value - Parsed event payload.
 * @param keys - Required and permitted property names.
 * @returns Whether the payload has the exact shape.
 */
function hasKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

/** Validates one same-site source resolved by the server.
 * @param value - Candidate source payload.
 * @returns Whether the source has a safe exact wire shape.
 */
function isSource(value: unknown): value is AskSource {
  if (!hasKeys(value, ["id", "title", "href"])) return false;
  const { href, id, title } = value;
  return typeof id === "string" && Boolean(id.trim()) && id.length <= 200
    && typeof title === "string" && Boolean(title.trim()) && title.length <= 200
    && typeof href === "string" && href.length <= 300
    && /^\/(?:$|#[a-z0-9-]+$|(?:projects|articles)(?:$|\/[a-z0-9]+(?:-[a-z0-9]+)*)$)/u.test(href);
}

/** Validates one generated follow-up action.
 * @param value - Candidate follow-up payload.
 * @returns Whether the suggestion has an exact bounded wire shape.
 */
function isFollowUp(value: unknown): value is AskFollowUp {
  if (!hasKeys(value, ["label", "question"])) return false;
  const { label, question } = value;
  return typeof label === "string" && label === label.trim() && Boolean(label)
    && Array.from(label).length <= maxAskLongFollowUpLabelCodePoints
    && typeof question === "string" && question === question.trim() && Boolean(question)
    && question.length <= maxAskFollowUpQuestionLength;
}

/** Validates terminal sources and follow-up combinations.
 * @param value - Candidate done payload.
 * @returns Valid terminal metadata, or undefined for an invalid payload.
 */
function parseCompletion(value: unknown): AskCompletion | undefined {
  if (!hasKeys(value, ["sources", "followUps"])
    || !Array.isArray(value.sources) || value.sources.length > maxAskSources
    || !value.sources.every(isSource)
    || new Set(value.sources.map((source) => source.id)).size !== value.sources.length
    || !Array.isArray(value.followUps) || value.followUps.length > maxAskFollowUps
    || !value.followUps.every(isFollowUp)) return undefined;

  const followUps = value.followUps;
  if (followUps.length === 2
    && followUps.some(({ label }) => Array.from(label).length > maxAskShortFollowUpLabelCodePoints)) return undefined;
  if (new Set(followUps.map(({ label, question }) => `${label}\u0000${question}`)).size !== followUps.length) return undefined;
  return { sources: value.sources, followUps };
}

/** Reads cancellation state after an asynchronous boundary.
 * @param signal - Signal whose state may have changed while awaiting.
 * @returns Whether cancellation has been requested.
 */
function isAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

/** Parses one complete SSE frame into its event name and JSON payload.
 * @param frame - Complete SSE frame without its blank delimiter.
 * @returns A parsed event, or undefined for a comment-only frame.
 * @throws When the frame lacks a single event or valid JSON data field.
 */
function parseFrame(frame: string): { event: string; data: unknown } | undefined {
  let event = "";
  const data: string[] = [];
  for (const line of frame.split(/\r?\n/u)) {
    if (line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    const field = separator < 0 ? line : line.slice(0, separator);
    let value = separator < 0 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") {
      if (event) throw failure();
      event = value;
    } else if (field === "data") {
      data.push(value);
    }
  }
  if (!event && data.length === 0) return undefined;
  if (!event || data.length === 0) throw failure();
  try {
    return { event, data: JSON.parse(data.join("\n")) as unknown };
  } catch {
    throw failure();
  }
}

/** Validates event order and dispatches accepted metadata and text deltas.
 * @param parsed - Parsed SSE event.
 * @param state - Mutable protocol state for this stream.
 * @param callbacks - Accepted metadata and delta consumers.
 * @throws When shape, order, mode, event name, or terminal sources are invalid.
 */
function acceptEvent(
  parsed: { event: string; data: unknown },
  state: StreamState,
  callbacks: AskStreamCallbacks,
): void {
  if (state.done) throw failure();
  if (parsed.event === "metadata") {
    if (state.metadata || !hasKeys(parsed.data, ["mode"])) throw failure();
    const mode = parsed.data.mode;
    if (mode !== "live") throw failure();
    state.metadata = true;
    callbacks.onMetadata(mode);
    return;
  }
  if (!state.metadata) throw failure();
  if (parsed.event === "delta") {
    if (!hasKeys(parsed.data, ["text"]) || typeof parsed.data.text !== "string") throw failure();
    if (parsed.data.text) {
      state.answerLength += parsed.data.text.length;
      if (state.answerLength > maxAskAssistantMessageLength) throw failure();
      state.answered ||= Boolean(parsed.data.text.trim());
      callbacks.onDelta(parsed.data.text);
    }
    return;
  }
  if (parsed.event === "done") {
    const completion = parseCompletion(parsed.data);
    if (!state.answered || !completion) throw failure();
    state.completion = completion;
    state.done = true;
    return;
  }
  if (parsed.event === "error") {
    if (!hasKeys(parsed.data, ["message"]) || typeof parsed.data.message !== "string") throw failure();
    throw failure(genericError, serviceFailureDetail);
  }
  throw failure();
}

/** Maps known request-validation responses without exposing response markup or internals.
 * @param response - Non-success endpoint response.
 * @returns Public recovery guidance.
 */
function httpFailure(response: Response): Error {
  if (response.status === 413) {
    return failure(
      "This conversation is too long. Start over and try again.",
      "The answer service rejected the request with HTTP 413 because the conversation was too large.",
    );
  }
  if (response.status === 400) {
    return failure(
      "Please check your question and try again.",
      "The answer service rejected the request with HTTP 400 because it was invalid.",
    );
  }
  if (response.status === 415) {
    return failure(
      "The question could not be sent. Please try again.",
      "The answer service rejected the request with HTTP 415 because its format was not accepted.",
    );
  }
  if (response.status === 503) {
    return failure(
      "Answers are unavailable right now. Please try again later.",
      "The answer service returned HTTP 503 because live generation is unavailable.",
    );
  }
  return failure(genericError, `The answer service returned HTTP ${String(response.status)}.`);
}

/** Returns an AbortError for caller-driven cancellation across browser implementations.
 * @param signal - Aborted caller signal.
 * @returns The caller's error reason or a normalized AbortError.
 */
function abortFailure(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The request was cancelled.", "AbortError");
}

/** Streams a bounded SSE answer and resolves only after a valid terminal event.
 * @param request - Bounded conversation request.
 * @param signal - Caller-owned lifecycle signal.
 * @param callbacks - Metadata and answer-delta consumers.
 * @returns Validated sources and follow-ups after a terminal event.
 * @throws Display-safe transport failures or caller cancellation.
 */
export async function streamAsk(
  request: AskRequest,
  signal: AbortSignal,
  callbacks: AskStreamCallbacks,
): Promise<AskStreamResult> {
  if (signal.aborted) throw abortFailure(signal);
  const cancellation = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const lifecycle = { timedOut: false };
  /** Propagates caller cancellation through fetch and any acquired response reader. */
  const abort = () => {
    cancellation.abort(signal.reason);
    void reader?.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", abort, { once: true });
  const deadline = setTimeout(() => {
    lifecycle.timedOut = true;
    cancellation.abort();
    void reader?.cancel().catch(() => undefined);
  }, askBrowserTimeoutMs);
  let complete = false;

  try {
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: cancellation.signal,
    });
    if (isAborted(cancellation.signal)) throw cancellation.signal.reason;
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      throw httpFailure(response);
    }
    if (response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "text/event-stream") {
      void response.body?.cancel().catch(() => undefined);
      throw failure();
    }
    if (!response.body) throw failure();

    reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const encoder = new TextEncoder();
    const state: StreamState = { metadata: false, answered: false, answerLength: 0, done: false };
    let buffer = "";
    let cumulativeBytes = 0;
    for (;;) {
      const chunk = await reader.read();
      if (isAborted(cancellation.signal)) throw cancellation.signal.reason;
      if (chunk.done) {
        buffer += decoder.decode();
        if (buffer || !state.done) throw failure();
        complete = true;
        if (!state.completion) throw failure();
        return state.completion;
      }
      cumulativeBytes += chunk.value.byteLength;
      if (cumulativeBytes > maxAskStreamBytes) throw failure();
      buffer += decoder.decode(chunk.value, { stream: true });
      if (encoder.encode(buffer).byteLength > maxAskStreamBytes) throw failure();

      for (;;) {
        const boundary = /\r?\n\r?\n/u.exec(buffer);
        if (!boundary) break;
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const parsed = parseFrame(frame);
        if (parsed) acceptEvent(parsed, state, callbacks);
        if (state.done) {
          if (buffer) throw failure();
          void reader.cancel().catch(() => undefined);
          complete = true;
          if (!state.completion) throw failure();
          return state.completion;
        }
      }
    }
  } catch (error) {
    if (lifecycle.timedOut) {
      throw failure("The answer took too long. Please try again.", timeoutFailureDetail);
    }
    if (isAborted(signal)) throw abortFailure(signal);
    if (error instanceof AskStreamError) throw error;
    throw failure(genericError, connectionFailureDetail);
  } finally {
    clearTimeout(deadline);
    signal.removeEventListener("abort", abort);
    if (reader && !complete) void reader.cancel().catch(() => undefined);
    reader?.releaseLock();
  }
}
