import type { AskRequest } from "@/lib/ask.contract";
import { askLimits } from "@/lib/ask.config";
import { hasKeys, parseCompletion, parseFrame } from "./ask-stream-parsing";
import { conversationConfig } from "./conversation.config";
import { AskStreamError } from "./conversation.errors";
import type { AskStreamCallbacks, AskStreamResult, ConversationServiceConfiguration,
  ConversationServiceDependencies, ConversationTurn, StreamState } from "./conversation.models";

const { maxAskAssistantMessageLength, maxAskBodyBytes, maxAskUserMessageLength, maxAskStreamBytes } = askLimits;
const { genericError, connectionFailureDetail, timeoutFailureDetail, serviceFailureDetail } = conversationConfig;

/** Builds bounded history and streams answers without retaining per-request state. */
export class ConversationService {
  private readonly fetcher: typeof fetch;
  private readonly configuration: ConversationServiceConfiguration;

  /** Binds transport dependencies without starting work or retaining request state.
   * @param dependencies - Optional fetch implementation and browser policy.
   */
  constructor(dependencies: ConversationServiceDependencies = {}) {
    this.fetcher = dependencies.fetcher ?? ((...args) => fetch(...args));
    this.configuration = dependencies.configuration ?? conversationConfig;
  }

  /** Reads cancellation state after an asynchronous boundary.
   * @param signal - Signal whose state may have changed while awaiting.
   * @returns Whether cancellation has been requested.
   */
  private static isAborted(signal: AbortSignal): boolean {
    return signal.aborted;
  }

  /** Validates event order and dispatches accepted metadata and text deltas.
   * @param parsed - Parsed SSE event.
   * @param state - Mutable protocol state for this stream.
   * @param callbacks - Accepted metadata and delta consumers.
   * @throws When shape, order, mode, event name, or terminal sources are invalid.
   */
  private static acceptEvent(
    parsed: { event: string; data: unknown },
    state: StreamState,
    callbacks: AskStreamCallbacks,
  ): void {
    if (state.done) throw new AskStreamError();
    if (parsed.event === "metadata") {
      if (state.metadata || !hasKeys(parsed.data, ["mode"])) throw new AskStreamError();
      const mode = parsed.data.mode;
      if (mode !== "live") throw new AskStreamError();
      state.metadata = true;
      callbacks.onMetadata(mode);
      return;
    }
    if (!state.metadata) throw new AskStreamError();
    if (parsed.event === "delta") {
      if (!hasKeys(parsed.data, ["text"]) || typeof parsed.data.text !== "string") throw new AskStreamError();
      if (parsed.data.text) {
        state.answerLength += parsed.data.text.length;
        if (state.answerLength > maxAskAssistantMessageLength) throw new AskStreamError();
        state.answered ||= Boolean(parsed.data.text.trim());
        callbacks.onDelta(parsed.data.text);
      }
      return;
    }
    if (parsed.event === "done") {
      const completion = parseCompletion(parsed.data);
      if (!state.answered || !completion) throw new AskStreamError();
      state.completion = completion;
      state.done = true;
      return;
    }
    if (parsed.event === "error") {
      if (!hasKeys(parsed.data, ["message"]) || typeof parsed.data.message !== "string") throw new AskStreamError();
      throw new AskStreamError(genericError, serviceFailureDetail);
    }
    throw new AskStreamError();
  }

  /** Maps known request-validation responses without exposing response markup or internals.
   * @param response - Non-success endpoint response.
   * @returns Public recovery guidance.
   */
  private static httpFailure(response: Response): Error {
    if (response.status === 413) {
      return new AskStreamError(...conversationConfig.httpFailures[413]);
    }
    if (response.status === 400) {
      return new AskStreamError(...conversationConfig.httpFailures[400]);
    }
    if (response.status === 415) {
      return new AskStreamError(...conversationConfig.httpFailures[415]);
    }
    if (response.status === 503) {
      return new AskStreamError(...conversationConfig.httpFailures[503]);
    }
    return new AskStreamError(genericError, `The answer service returned HTTP ${String(response.status)}.`);
  }

  /** Returns an AbortError for caller-driven cancellation across browser implementations.
   * @param signal - Aborted caller signal.
   * @returns The caller's error reason or a normalized AbortError.
   */
  private static abortFailure(signal: AbortSignal): Error {
    return signal.reason instanceof Error
      ? signal.reason
      : new DOMException(conversationConfig.cancelledError, "AbortError");
  }

  /** Measures the exact UTF-8 size sent by fetch after JSON serialization.
   * @param request - Candidate request payload.
   * @returns Serialized UTF-8 byte length.
   */
  private static requestBytes(request: AskRequest): number {
    return new TextEncoder().encode(JSON.stringify(request)).byteLength;
  }

  /** Builds bounded history from completed exchanges preceding the selected turn.
   * @param turns - Ordered displayed transcript.
   * @param turnId - Selected current turn.
   * @returns Bounded preceding complete pairs and the current question.
   * @throws When the selected turn is absent or its question violates composer limits.
   */
  buildRequest(
    turns: readonly ConversationTurn[],
    turnId: string,
  ): AskRequest {
    const selectedIndex = turns.findIndex((turn) => turn.id === turnId);
    if (selectedIndex < 0) throw new Error(conversationConfig.missingTurnError);

    const selected = turns[selectedIndex];
    if (!selected) throw new Error(conversationConfig.missingTurnError);
    if (!selected.question.trim() || selected.question.length > maxAskUserMessageLength) {
      throw new Error(conversationConfig.invalidQuestionError);
    }
    const pairs = turns
      .slice(0, selectedIndex)
      .filter((turn) => turn.status === "complete"
        && turn.question.length <= maxAskUserMessageLength
        && turn.text.length <= maxAskAssistantMessageLength)
      .slice(-this.configuration.maxHistoryPairs)
      .map((turn) => [
        { role: "user" as const, content: turn.question },
        { role: "assistant" as const, content: turn.text },
      ]);

    for (;;) {
      const request: AskRequest = {
        messages: [...pairs.flat(), { role: "user", content: selected.question }],
        ...(selected.context ? { context: selected.context } : {}),
      };
      if (ConversationService.requestBytes(request) <= maxAskBodyBytes) return request;
      if (pairs.length === 0) {
        throw new Error(conversationConfig.oversizedQuestionError);
      }
      pairs.shift();
    }
  }

  /** Streams a bounded SSE answer and resolves only after a valid terminal event.
   * @param request - Bounded conversation request.
   * @param signal - Caller-owned lifecycle signal.
   * @param callbacks - Metadata and answer-delta consumers.
   * @returns Validated sources and follow-ups after a terminal event.
   * @throws Display-safe transport failures or caller cancellation.
   */
  async stream(
    request: AskRequest,
    signal: AbortSignal,
    callbacks: AskStreamCallbacks,
  ): Promise<AskStreamResult> {
    if (signal.aborted) throw ConversationService.abortFailure(signal);
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
    }, this.configuration.askBrowserTimeoutMs);
    let complete = false;

    try {
      const response = await this.fetcher("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: cancellation.signal,
      });
      if (ConversationService.isAborted(cancellation.signal)) throw cancellation.signal.reason;
      if (!response.ok) {
        void response.body?.cancel().catch(() => undefined);
        throw ConversationService.httpFailure(response);
      }
      if (response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "text/event-stream") {
        void response.body?.cancel().catch(() => undefined);
        throw new AskStreamError();
      }
      if (!response.body) throw new AskStreamError();

      reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: true });
      const encoder = new TextEncoder();
      const state: StreamState = { metadata: false, answered: false, answerLength: 0, done: false };
      let buffer = "";
      let cumulativeBytes = 0;
      for (;;) {
        const chunk = await reader.read();
        if (ConversationService.isAborted(cancellation.signal)) throw cancellation.signal.reason;
        if (chunk.done) {
          buffer += decoder.decode();
          if (buffer || !state.done) throw new AskStreamError();
          complete = true;
          if (!state.completion) throw new AskStreamError();
          return state.completion;
        }
        cumulativeBytes += chunk.value.byteLength;
        if (cumulativeBytes > maxAskStreamBytes) throw new AskStreamError();
        buffer += decoder.decode(chunk.value, { stream: true });
        if (encoder.encode(buffer).byteLength > maxAskStreamBytes) throw new AskStreamError();

        for (;;) {
          const boundary = /\r?\n\r?\n/u.exec(buffer);
          if (!boundary) break;
          const frame = buffer.slice(0, boundary.index);
          buffer = buffer.slice(boundary.index + boundary[0].length);
          const parsed = parseFrame(frame);
          if (parsed) ConversationService.acceptEvent(parsed, state, callbacks);
          if (state.done) {
            if (buffer) throw new AskStreamError();
            void reader.cancel().catch(() => undefined);
            complete = true;
            if (!state.completion) throw new AskStreamError();
            return state.completion;
          }
        }
      }
    } catch (error) {
      if (lifecycle.timedOut) {
        throw new AskStreamError(conversationConfig.timeoutError, timeoutFailureDetail);
      }
      if (ConversationService.isAborted(signal)) throw ConversationService.abortFailure(signal);
      if (error instanceof AskStreamError) throw error;
      throw new AskStreamError(genericError, connectionFailureDetail);
    } finally {
      clearTimeout(deadline);
      signal.removeEventListener("abort", abort);
      if (reader && !complete) void reader.cancel().catch(() => undefined);
      reader?.releaseLock();
    }
  }
}
