import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import {
  AskStreamError,
  streamAsk,
  type AskStreamCallbacks,
} from "./ask-stream";
import { askBrowserTimeoutMs, maxAskStreamBytes, type AskSource } from "@/lib/ask.contract";
import type { ConversationMode } from "./use-conversation";

const encoder = new TextEncoder();

/**
 * Creates a successful event-stream response from byte chunks.
 *
 * @param chunks - Encoded response chunks to enqueue.
 * @param close - Whether to close the response after enqueueing.
 * @returns A successful event-stream response.
 */
function eventStreamResponse(chunks: readonly Uint8Array[], close = true): Response {
  return new Response(new ReadableStream<Uint8Array>({
    /**
     * Enqueues fixture chunks and optionally closes the response.
     *
     * @param controller - Stream controller receiving fixture chunks.
     */
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      if (close) {
        controller.close();
      }
    },
  }), { headers: { "content-type": "text/event-stream; charset=utf-8" } });
}

/** Ignores a streamed text delta for tests that only observe completion. */
function ignoreDelta(): void {}

/** Ignores stream metadata for tests that only observe completion. */
function ignoreMetadata(): void {}

const noopCallbacks: AskStreamCallbacks = {
  onDelta: ignoreDelta,
  onMetadata: ignoreMetadata,
};

/**
 * Creates callbacks that record accepted transport events.
 *
 * @param deltas - Destination for accepted answer fragments.
 * @param modes - Destination for accepted response modes.
 * @returns Stream callbacks bound to the destinations.
 */
function recordingCallbacks(
  deltas: string[],
  modes: ConversationMode[],
): AskStreamCallbacks {
  return {
    /**
     * Records one accepted answer fragment.
     *
     * @param text - Accepted answer fragment.
     */
    onDelta(text) {
      deltas.push(text);
    },
    /**
     * Records one accepted response mode.
     *
     * @param mode - Accepted response mode.
     */
    onMetadata(mode) {
      modes.push(mode);
    },
  };
}

/**
 * Encodes an SSE payload as one response chunk.
 *
 * @param payload - Complete SSE text to encode.
 * @param close - Whether to close the response after enqueueing.
 * @returns A successful event-stream response.
 */
function sseResponse(payload: string, close = true): Response {
  const livePayload = payload
    .replaceAll('{"mode":"mock"}', '{"mode":"live"}')
    .replaceAll('{"sources":[]}', '{"sources":[],"followUps":[]}');
  return eventStreamResponse([encoder.encode(livePayload)], close);
}

/**
 * Installs a fetch mock that returns one response.
 *
 * @param t - Active test context.
 * @param response - Response returned by the fetch mock.
 */
function mockFetch(t: TestContext, response: Response): void {
  t.mock.method(globalThis, "fetch", () => Promise.resolve(response));
}

/**
 * Invokes the stream transport with callbacks that record public events.
 *
 * @param t - Active test context.
 * @param payload - SSE payload returned by the fetch mock.
 * @returns Accepted deltas, modes, and terminal sources.
 */
async function readStream(t: TestContext, payload: string): Promise<{
  deltas: string[];
  modes: ConversationMode[];
  sources: AskSource[];
}> {
  mockFetch(t, sseResponse(payload));
  const deltas: string[] = [];
  const modes: ConversationMode[] = [];
  const result = await streamAsk(
    { messages: [{ content: "Question", role: "user" }] },
    new AbortController().signal,
    recordingCallbacks(deltas, modes),
  );
  return { deltas, modes, sources: result.sources };
}

/**
 * Asserts that a stream rejects without leaking raw markup or stack-like details.
 *
 * @param run - Pending stream operation expected to reject.
 */
async function rejectsSafely(run: Promise<unknown>): Promise<void> {
  await assert.rejects(run, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.doesNotMatch(error.message, /<html|stack trace|SECRET/i);
    return true;
  });
}

/**
 * Asserts that a stream failure includes safe public problem detail.
 *
 * @param run - Pending stream operation expected to reject.
 * @param detail - Pattern expected in the categorized problem detail.
 * @param message - Optional pattern expected in the recovery guidance.
 */
async function rejectsWithDetail(
  run: Promise<unknown>,
  detail: RegExp,
  message?: RegExp,
): Promise<void> {
  await assert.rejects(run, (error: unknown) => {
    assert.ok(error instanceof AskStreamError);
    if (message) assert.match(error.message, message);
    assert.match(error.detail, detail);
    assert.doesNotMatch(error.detail, /<html|stack trace|SECRET/i);
    return true;
  });
}

test("streamAsk posts the JSON request to the ask endpoint", async (t) => {
  let capturedInput: RequestInfo | URL | undefined;
  let capturedInit: RequestInit | undefined;
  t.mock.method(globalThis, "fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    capturedInput = input;
    capturedInit = init;
    return Promise.resolve(sseResponse(
      "event: metadata\ndata: {\"mode\":\"mock\"}\n\n" +
      "event: delta\ndata: {\"text\":\"Answer\"}\n\n" +
      "event: done\ndata: {\"sources\":[]}\n\n",
    ));
  });
  const request = { messages: [{ content: "Question", role: "user" as const }] };

  await streamAsk(request, new AbortController().signal, noopCallbacks);

  assert.equal(capturedInput, "/api/ask");
  assert.ok(capturedInit);
  assert.equal(capturedInit.method, "POST");
  assert.equal(capturedInit.body, JSON.stringify(request));
  assert.match(new Headers(capturedInit.headers).get("content-type") ?? "", /^application\/json\b/);
});

test("streamAsk decodes a non-ASCII response split at every UTF-8 byte", async (t) => {
  const payload =
    "event: metadata\r\ndata: {\"mode\":\"live\"}\r\n\r\n" +
    "event: delta\r\ndata: {\"text\":\"Привіт 世界 🙂\"}\r\n\r\n" +
    "event: done\r\ndata: {\"sources\":[],\"followUps\":[]}\r\n\r\n";
  const bytes = encoder.encode(payload);
  mockFetch(t, eventStreamResponse(Array.from(bytes, (byte) => Uint8Array.of(byte))));
  const deltas: string[] = [];
  const modes: ConversationMode[] = [];

  const result = await streamAsk(
    { messages: [{ content: "Question", role: "user" }] },
    new AbortController().signal,
    recordingCallbacks(deltas, modes),
  );

  assert.deepEqual(modes, ["live"]);
  assert.deepEqual(deltas, ["Привіт 世界 🙂"]);
  assert.deepEqual(result, { sources: [], followUps: [] });
});

test("streamAsk accepts comments, multiline data, LF frames, and coalesced frames", async (t) => {
  const result = await readStream(t,
    ": heartbeat\n" +
    "event: metadata\ndata: {\"mode\":\ndata: \"live\"}\n\n" +
    "event: delta\ndata: {\"text\":\"One\"}\n\n" +
    ": another comment\nevent: delta\ndata: {\"text\":\"Two\"}\n\n" +
    "event: done\ndata: {\"sources\":[]}\n\n");

  assert.deepEqual(result, { deltas: ["One", "Two"], modes: ["live"], sources: [] });
});

test("streamAsk resolves at done without waiting for response EOF", async (t) => {
  let cancelled = false;
  const payload = encoder.encode(
    "event: metadata\ndata: {\"mode\":\"live\"}\n\n" +
    "event: delta\ndata: {\"text\":\"Answer\"}\n\n" +
    "event: done\ndata: {\"sources\":[],\"followUps\":[]}\n\n",
  );
  const body = new ReadableStream<Uint8Array>({
    /** Records early reader cancellation after the terminal event. */
    cancel() {
      cancelled = true;
    },
    /**
     * Enqueues a terminal stream while intentionally leaving the body open.
     *
     * @param controller - Stream controller receiving the terminal payload.
     */
    start(controller) {
      controller.enqueue(payload);
    },
  });
  mockFetch(t, new Response(body, { headers: { "content-type": "text/event-stream" } }));

  const result = await streamAsk(
    { messages: [{ content: "Question", role: "user" }] },
    new AbortController().signal,
    noopCallbacks,
  );

  assert.deepEqual(result, { sources: [], followUps: [] });
  assert.equal(cancelled, true);
});

test("streamAsk returns validated same-site sources and follow-ups", async (t) => {
  mockFetch(t, sseResponse(
    "event: metadata\ndata: {\"mode\":\"live\"}\n\n" +
    "event: delta\ndata: {\"text\":\"Answer\"}\n\n" +
    "event: done\ndata: {\"sources\":[{\"id\":\"project:fixture\",\"title\":\"Fixture\",\"href\":\"/projects/fixture\"}],\"followUps\":[{\"label\":\"Show evidence\",\"question\":\"Where did Nikita use this skill?\"}]}\n\n",
  ));

  const result = await streamAsk(
    { messages: [{ content: "Question", role: "user" }] },
    new AbortController().signal,
    noopCallbacks,
  );

  assert.deepEqual(result, {
    sources: [{ id: "project:fixture", title: "Fixture", href: "/projects/fixture" }],
    followUps: [{ label: "Show evidence", question: "Where did Nikita use this skill?" }],
  });
});

test("streamAsk rejects unsafe source links and invalid two-label combinations", async (t) => {
  await rejectsSafely(readStream(t,
    "event: metadata\ndata: {\"mode\":\"live\"}\n\n" +
    "event: delta\ndata: {\"text\":\"Answer\"}\n\n" +
    "event: done\ndata: {\"sources\":[{\"id\":\"bad\",\"title\":\"Bad\",\"href\":\"https://example.com\"}],\"followUps\":[]}\n\n"));
  await rejectsSafely(readStream(t,
    "event: metadata\ndata: {\"mode\":\"live\"}\n\n" +
    "event: delta\ndata: {\"text\":\"Answer\"}\n\n" +
    `event: done\ndata: ${JSON.stringify({
      sources: [],
      followUps: [
        { label: "x".repeat(25), question: "First?" },
        { label: "Second", question: "Second?" },
      ],
    })}\n\n`));
});

test("streamAsk rejects an unknown metadata mode", async (t) => {
  await rejectsSafely(readStream(t,
    "event: metadata\ndata: {\"mode\":\"preview\"}\n\n" +
    "event: delta\ndata: {\"text\":\"Answer\"}\n\n" +
    "event: done\ndata: {\"sources\":[]}\n\n"));
});

test("streamAsk rejects duplicate metadata", async (t) => {
  await rejectsSafely(readStream(t,
    "event: metadata\ndata: {\"mode\":\"mock\"}\n\n" +
    "event: metadata\ndata: {\"mode\":\"mock\"}\n\n"));
});

test("streamAsk rejects malformed event JSON", async (t) => {
  await rejectsWithDetail(
    readStream(t, "event: metadata\ndata: {\n\n"),
    /response.*could not read/i,
  );
});

test("streamAsk rejects invalid event data shapes", async (t) => {
  await rejectsSafely(readStream(t,
    "event: metadata\ndata: {\"mode\":\"mock\"}\n\n" +
    "event: delta\ndata: {\"text\":42}\n\n"));
});

test("streamAsk rejects events received out of protocol order", async (t) => {
  await rejectsSafely(readStream(t,
    "event: delta\ndata: {\"text\":\"Early\"}\n\n" +
    "event: metadata\ndata: {\"mode\":\"mock\"}\n\n"));
});

test("streamAsk rejects unsupported event names", async (t) => {
  await rejectsSafely(readStream(t,
    "event: metadata\ndata: {\"mode\":\"mock\"}\n\n" +
    "event: progress\ndata: {\"value\":1}\n\n"));
});

test("streamAsk rejects non-empty terminal sources", async (t) => {
  await rejectsSafely(readStream(t,
    "event: metadata\ndata: {\"mode\":\"mock\"}\n\n" +
    "event: delta\ndata: {\"text\":\"Answer\"}\n\n" +
    "event: done\ndata: {\"sources\":[{\"url\":\"https://example.com\"}]}\n\n"));
});

test("streamAsk rejects a successful response with the wrong content type", async (t) => {
  mockFetch(t, new Response("plain text", { headers: { "content-type": "text/plain" } }));

  await rejectsWithDetail(streamAsk(
    { messages: [{ content: "Question", role: "user" }] },
    new AbortController().signal,
    noopCallbacks,
  ), /response.*could not read/i);
});

test("streamAsk rejects a successful response without a body", async (t) => {
  mockFetch(t, new Response(null, { headers: { "content-type": "text/event-stream" } }));

  await rejectsSafely(streamAsk(
    { messages: [{ content: "Question", role: "user" }] },
    new AbortController().signal,
    noopCallbacks,
  ));
});

test("streamAsk exposes a safe useful message for a 400 input error", async (t) => {
  mockFetch(t, Response.json({ error: "Question must be 400 characters or fewer." }, { status: 400 }));

  const pending = streamAsk(
    { messages: [{ content: "x".repeat(401), role: "user" }] },
    new AbortController().signal,
    noopCallbacks,
  );

  await rejectsWithDetail(pending, /HTTP 400.*invalid/i, /question.*try again/i);
});

test("streamAsk hides raw markup from server failures", async (t) => {
  mockFetch(t, new Response("<html>SECRET stack trace</html>", {
    headers: { "content-type": "text/html" },
    status: 500,
  }));

  await rejectsWithDetail(streamAsk(
    { messages: [{ content: "Question", role: "user" }] },
    new AbortController().signal,
    noopCallbacks,
  ), /HTTP 500/i);
});

test("streamAsk maps network failures to a display-safe retryable error", async (t) => {
  t.mock.method(globalThis, "fetch", () => Promise.reject(new TypeError("Failed to fetch")));

  await rejectsWithDetail(streamAsk(
    { messages: [{ content: "Question", role: "user" }] },
    new AbortController().signal,
    noopCallbacks,
  ), /connection.*failed/i);
});

test("streamAsk rejects a server error event without exposing its raw message", async (t) => {
  mockFetch(t, sseResponse(
    "event: metadata\ndata: {\"mode\":\"mock\"}\n\n" +
    "event: error\ndata: {\"message\":\"SECRET provider detail\"}\n\n",
  ));

  await rejectsWithDetail(streamAsk(
    { messages: [{ content: "Question", role: "user" }] },
    new AbortController().signal,
    noopCallbacks,
  ), /service reported a failure.*reply/i);
});

test("streamAsk rejects a done event when the answer is empty", async (t) => {
  await rejectsSafely(readStream(t,
    "event: metadata\ndata: {\"mode\":\"mock\"}\n\n" +
    "event: done\ndata: {\"sources\":[]}\n\n"));
});

test("streamAsk rejects a done event when the answer contains only whitespace", async (t) => {
  await rejectsSafely(readStream(t,
    "event: metadata\ndata: {\"mode\":\"mock\"}\n\n" +
    "event: delta\ndata: {\"text\":\" \\n\\t\"}\n\n" +
    "event: done\ndata: {\"sources\":[]}\n\n"));
});

test("streamAsk rejects EOF before a done event", async (t) => {
  await rejectsSafely(readStream(t,
    "event: metadata\ndata: {\"mode\":\"mock\"}\n\n" +
    "event: delta\ndata: {\"text\":\"Partial\"}\n\n"));
});

test("streamAsk enforces the cumulative byte cap across many small frames", async (t) => {
  const frames = ["event: metadata\ndata: {\"mode\":\"live\"}\n\n"];
  const paddingFrame = `: ${"x".repeat(500)}\n\n`;
  let bytes = encoder.encode(frames[0] ?? "").byteLength;
  while (bytes <= maxAskStreamBytes + 1_000) {
    frames.push(paddingFrame);
    bytes += encoder.encode(paddingFrame).byteLength;
  }
  mockFetch(t, eventStreamResponse(frames.map((frame) => encoder.encode(frame))));

  await rejectsSafely(streamAsk(
    { messages: [{ content: "Question", role: "user" }] },
    new AbortController().signal,
    noopCallbacks,
  ));
});

test("streamAsk enforces the pending-frame byte cap independently", async (t) => {
  const body = new ReadableStream<Uint8Array>({
    /**
     * Enqueues an oversized frame without closing the response.
     *
     * @param controller - Stream controller receiving oversized data.
     */
    start(controller) {
      controller.enqueue(encoder.encode("x".repeat(maxAskStreamBytes + 1)));
    },
  });
  mockFetch(t, new Response(body, { headers: { "content-type": "text/event-stream" } }));
  let settled = false;
  const pending = streamAsk(
    { messages: [{ content: "Question", role: "user" }] },
    new AbortController().signal,
    noopCallbacks,
  );
  void pending.then(
    () => { settled = true; },
    () => { settled = true; },
  );

  await new Promise<void>((resolveDone) => { setImmediate(resolveDone); });

  assert.equal(settled, true, "oversized unframed data must fail before EOF or the deadline");
  await rejectsSafely(pending);
});

test("streamAsk aborts an active response when its caller aborts", async (t) => {
  const caller = new AbortController();
  let fetchSignal: AbortSignal | undefined;
  t.mock.method(globalThis, "fetch", (_input: RequestInfo | URL, init?: RequestInit) => {
    fetchSignal = init?.signal instanceof AbortSignal ? init.signal : undefined;
    const body = new ReadableStream<Uint8Array>({
      /**
       * Fails the stalled response when the transport signal aborts.
       *
       * @param controller - Stream controller failed on cancellation.
       */
      start(controller) {
        fetchSignal?.addEventListener("abort", () => {
          controller.error(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      },
    });
    return Promise.resolve(new Response(body, { headers: { "content-type": "text/event-stream" } }));
  });
  const pending = streamAsk(
    { messages: [{ content: "Question", role: "user" }] },
    caller.signal,
    noopCallbacks,
  );
  await Promise.resolve();

  caller.abort();

  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(fetchSignal?.aborted, true);
});

test("streamAsk aborts a stalled response after the browser deadline", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let fetchSignal: AbortSignal | undefined;
  t.mock.method(globalThis, "fetch", (_input: RequestInfo | URL, init?: RequestInit) => {
    fetchSignal = init?.signal instanceof AbortSignal ? init.signal : undefined;
    const body = new ReadableStream<Uint8Array>({
      /**
       * Fails the stalled response when its deadline aborts the transport.
       *
       * @param controller - Stream controller failed at the deadline.
       */
      start(controller) {
        fetchSignal?.addEventListener("abort", () => {
          controller.error(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      },
    });
    return Promise.resolve(new Response(body, { headers: { "content-type": "text/event-stream" } }));
  });
  const pending = streamAsk(
    { messages: [{ content: "Question", role: "user" }] },
    new AbortController().signal,
    noopCallbacks,
  );
  await Promise.resolve();
  await Promise.resolve();

  t.mock.timers.tick(askBrowserTimeoutMs);

  await rejectsWithDetail(pending, /did not respond within 65 seconds/i);
  assert.equal(fetchSignal?.aborted, true);
});
