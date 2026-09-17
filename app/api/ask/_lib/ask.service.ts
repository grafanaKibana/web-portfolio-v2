import "server-only";

import type { AskRequest } from "@/lib/ask.contract";
import { askLimits } from "@/lib/ask.config";
import { askServerConfig, type AskConfiguration } from "./ask.config";
import { AskGenerationError, AskRequestError } from "./ask.errors";
import type { AskDependencies } from "./ask.models";
import { readRequestChunk } from "./abort-helpers";

const { maxAskAssistantMessageLength, maxAskBodyBytes, maxAskContextValueLength, maxAskMessages, maxAskRecordSlugLength, maxAskStreamBytes, maxAskUserMessageLength } = askLimits;
const { askServerTimeoutMs } = askServerConfig;

/** Owns bounded HTTP validation, configuration ordering, SSE framing and request disposal. */
export class AskService {
  /** Shared UTF-8 encoder; encoded data remains invocation-local. */
  private static readonly encoder = new TextEncoder();

  /** Accepted normalized record slug grammar. */
  private static readonly slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  /** Accepted rendered section identifier grammar. */
  private static readonly sectionPattern = /^[A-Za-z][A-Za-z0-9_-]*$/;

  /**
   * Binds request collaborators without starting a timer or reading environment values.
   * @param dependencies - Mandatory configuration resolver and answer-stream operation.
   */
  constructor(private readonly dependencies: AskDependencies) {}

  /**
   * Handles an Ask request from bounded validation through one cancellable live answer stream.
   *
   * @param request - Incoming JSON conversation request.
   * @returns An SSE response, or an uncached JSON error before streaming starts.
   * @throws Unexpected request failures for the route runtime to report.
   */
  async handle(
    request: Request,
  ): Promise<Response> {
    const deadline = new AbortController();
    const deadlineTimer = globalThis.setTimeout(
      () => {
        deadline.abort(new DOMException("Ask request timed out", "TimeoutError"));
      },
      askServerTimeoutMs,
    );
    let input: AskRequest;
    let configuration: AskConfiguration;
    try {
      input = await this.readAskRequest(request, AbortSignal.any([request.signal, deadline.signal]));
      configuration = this.dependencies.resolveConfiguration();
    } catch (error) {
      globalThis.clearTimeout(deadlineTimer);
      if (deadline.signal.aborted) {
        return Response.json({ error: "Ask request timed out." }, {
          status: 408,
          headers: { "Cache-Control": "no-store" },
        });
      }
      if (!(error instanceof AskRequestError)) throw error;
      return Response.json({ error: error.message }, {
        status: error.status,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return this.createAnswerResponse(input, request.signal, deadline, deadlineTimer, configuration);
  }

  /**
   * Narrows an untrusted JSON value to an object with only permitted keys.
   *
   * @param value - Untrusted JSON value.
   * @param keys - Allowed object properties.
   * @returns The validated object.
   * @throws When the value is not an object or has unexpected properties.
   */
  private object(value: unknown, keys: readonly string[]): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).some((key) => !keys.includes(key))) {
      throw new AskRequestError(400, "Request contains an invalid object or unsupported field.");
    }
    return value as Record<string, unknown>;
  }

  /**
   * Validates bounded conversation history and optional portfolio context.
   *
   * @param value - Parsed request body.
   * @returns Normalized messages and context without client-supplied system instructions.
   * @throws When the request does not satisfy the public contract.
   */
  private parseAskRequest(value: unknown): AskRequest {
    const body = this.object(value, ["messages", "context"]);
    if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > maxAskMessages) {
      throw new AskRequestError(400, `Send between 1 and ${String(maxAskMessages)} messages.`);
    }
    const messages = body.messages.map((value: unknown, index): AskRequest["messages"][number] => {
      const message = this.object(value, ["role", "content"]);
      const role = index % 2 === 0 ? "user" : "assistant";
      const limit = role === "user" ? maxAskUserMessageLength : maxAskAssistantMessageLength;
      if (message.role !== role || typeof message.content !== "string"
        || !message.content.trim() || message.content.length > limit) {
        throw new AskRequestError(400, "Messages must alternate user and assistant and stay within their size limits.");
      }
      return { role, content: message.content.trim() };
    });
    if (messages.at(-1)?.role !== "user") {
      throw new AskRequestError(400, "The last message must be a user question.");
    }
    if (body.context === undefined) return { messages };

    const context = this.object(body.context, ["pathname", "sectionId", "record"]);
    if (typeof context.pathname !== "string"
      || context.pathname.length > maxAskContextValueLength
      || !/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/u.test(context.pathname)
      || context.pathname.includes("?")
      || context.pathname.includes("#")) {
      throw new AskRequestError(400, "Context pathname must be a local portfolio path.");
    }
    const normalizedContext: NonNullable<AskRequest["context"]> = { pathname: context.pathname };
    if (context.sectionId !== undefined) {
      if (typeof context.sectionId !== "string"
        || context.sectionId.length > maxAskContextValueLength
        || !AskService.sectionPattern.test(context.sectionId)) {
        throw new AskRequestError(400, "Context sectionId is invalid.");
      }
      normalizedContext.sectionId = context.sectionId;
    }
    if (context.record !== undefined) {
      const record = this.object(context.record, ["kind", "slug"]);
      if ((record.kind !== "project" && record.kind !== "article")
        || typeof record.slug !== "string"
        || record.slug.length > maxAskRecordSlugLength
        || !AskService.slugPattern.test(record.slug)) {
        throw new AskRequestError(400, "Context record must identify a project or article slug.");
      }
      normalizedContext.record = { kind: record.kind, slug: record.slug };
    }
    return { messages, context: normalizedContext };
  }

  /**
   * Reads JSON with an actual-byte limit even when Content-Length is absent or inaccurate.
   *
   * @param request - Incoming HTTP request.
   * @param signal - Combined request and whole-operation deadline signal.
   * @returns The validated question request.
   * @throws When media type, body size, JSON, or request fields are invalid.
   */
  private async readAskRequest(request: Request, signal: AbortSignal): Promise<AskRequest> {
    if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
      throw new AskRequestError(415, "Send the request as application/json.");
    }
    if (Number(request.headers.get("content-length")) > maxAskBodyBytes) {
      throw new AskRequestError(413, "Request body exceeds 64 KiB.");
    }
    if (!request.body) throw new AskRequestError(400, "A JSON request body is required.");

    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const chunk = await readRequestChunk(reader, signal);
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > maxAskBodyBytes) {
          await reader.cancel();
          throw new AskRequestError(413, "Request body exceeds 64 KiB.");
        }
        chunks.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return this.parseAskRequest(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown);
    } catch (error) {
      if (error instanceof AskRequestError) throw error;
      throw new AskRequestError(400, "Request body must contain valid UTF-8 JSON.");
    }
  }

  /**
   * Transports generated text as SSE while preserving backpressure and lifecycle cancellation.
   *
   * @param input - Validated conversation and view context.
   * @param requestSignal - Incoming HTTP request signal.
   * @param deadline - Server deadline controller.
   * @param deadlineTimer - Timer cleared after any terminal state.
   * @param configuration - Request-owned provider configuration.
   * @returns A live SSE response.
   */
  private createAnswerResponse(
    input: AskRequest,
    requestSignal: AbortSignal,
    deadline: AbortController,
    deadlineTimer: ReturnType<typeof globalThis.setTimeout>,
    configuration: AskConfiguration,
  ): Response {
    const cancellation = new AbortController();
    const signal = AbortSignal.any([requestSignal, cancellation.signal, deadline.signal]);
    const iterator = this.dependencies.answerService.stream(input, signal, configuration);
    let started = false;
    let cancelled = false;
    let bytes = 0;

    /**
     * Serializes and bounds one SSE event before enqueueing it.
     *
     * @param controller - Active response stream controller.
     * @param event - SSE event name.
     * @param data - JSON-compatible event payload.
     */
    const enqueue = (controller: ReadableStreamDefaultController<Uint8Array>, event: string, data: unknown) => {
      const chunk = AskService.encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      bytes += chunk.byteLength;
      if (bytes > maxAskStreamBytes) throw new AskGenerationError("Answer stream exceeded its limit");
      controller.enqueue(chunk);
    };
    /**
     * Clears the lifecycle deadline and closes the response stream.
     *
     * @param controller - Active response stream controller.
     */
    const close = (controller: ReadableStreamDefaultController<Uint8Array>) => {
      globalThis.clearTimeout(deadlineTimer);
      controller.close();
    };
    const body = new ReadableStream<Uint8Array>({
      /**
       * Emits one event at a time so client backpressure controls model iteration.
       *
       * @param controller - Response stream controller.
       */
      async pull(controller) {
        if (!started) {
          started = true;
          enqueue(controller, "metadata", { mode: "live" });
          return;
        }
        try {
          const chunk = await iterator.next();
          signal.throwIfAborted();
          if (cancelled) return;
          if (chunk.done) {
            enqueue(controller, "done", chunk.value);
            close(controller);
          } else enqueue(controller, "delta", { text: chunk.value });
        } catch (error) {
          if (cancelled) return;
          await iterator.return(undefined as never).catch(() => undefined);
          const clientEnded = requestSignal.aborted || cancellation.signal.aborted;
          if (!clientEnded) {
            const reason = deadline.signal.aborted
              ? "Request deadline exceeded"
              : error instanceof AskGenerationError ? error.message : undefined;
            console.error("Portfolio Q&A generation failed.", ...(reason ? [reason] : []));
            enqueue(controller, "error", { message: "Unable to finish the answer. Please try again." });
          }
          close(controller);
        }
      },
      /** Stops generation when the browser cancels the response body. */
      async cancel() {
        cancelled = true;
        globalThis.clearTimeout(deadlineTimer);
        cancellation.abort();
        await iterator.return(undefined as never);
      },
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  }
}
