import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { askServerTimeoutMs } from "@/lib/ask.contract";

import { handleAsk } from "./ask.service";

interface CapturedProviderRequest {
  body: Record<string, unknown>;
  url: string;
}

interface SyntheticCorpusEntry {
  id: string;
  title: string;
  href: string;
  text: string;
}

type ServerSentEvent = { data: unknown; event: string };

/**
 * Creates one valid JSON request for the Ask endpoint.
 *
 * @param body - Request payload sent to the service.
 * @returns A local JSON POST request.
 */
function createJsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/ask", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

/**
 * Configures a deterministic provider endpoint and restores prior values after the test.
 *
 * @param t - Active Node test context.
 */
function configureProvider(t: TestContext): void {
  const names = ["ASK_API_KEY", "ASK_API_BASE_URL", "ASK_MODEL"] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  t.after(() => {
    for (const name of names) {
      const value = previous[name];
      if (value === undefined) Reflect.deleteProperty(process.env, name);
      else process.env[name] = value;
    }
  });
  process.env.ASK_API_KEY = "fixture-key";
  process.env.ASK_API_BASE_URL = "https://provider.fixture/v1";
  process.env.ASK_MODEL = "fixture-model";
}

/**
 * Serializes OpenAI-compatible chat completion chunks as an SSE response.
 *
 * @param fragments - Structured answer fragments emitted by the provider.
 * @param finishReason - Terminal provider reason.
 * @returns A streaming HTTP response accepted by the installed OpenAI client.
 */
function providerResponse(fragments: readonly string[], finishReason = "stop"): Response {
  const chunks = [
    ...fragments.map((content, index) => ({
      id: "chatcmpl-fixture",
      object: "chat.completion.chunk",
      created: 1,
      model: "fixture-model",
      choices: [{
        index: 0,
        delta: { ...(index === 0 ? { role: "assistant" } : {}), content },
        finish_reason: null,
      }],
    })),
    {
      id: "chatcmpl-fixture",
      object: "chat.completion.chunk",
      created: 1,
      model: "fixture-model",
      choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
    },
  ];
  return rawProviderResponse(chunks);
}

/**
 * Serializes controlled raw provider chunks as one HTTP event stream.
 *
 * @param chunks - OpenAI-compatible streaming chunk objects.
 * @returns A streaming provider response.
 */
function rawProviderResponse(chunks: readonly Record<string, unknown>[]): Response {
  const body = `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`;
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

/**
 * Parses a complete Ask event stream.
 *
 * @param payload - Serialized SSE payload.
 * @returns Parsed event names and JSON data.
 */
function parseServerSentEvents(payload: string): ServerSentEvent[] {
  return payload.trim().split(/\r?\n\r?\n/u).filter(Boolean).map((block) => {
    const lines = block.split(/\r?\n/u);
    const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
    const data = lines.find((line) => line.startsWith("data:"))?.slice(5).trim();
    assert.ok(event, `missing event name in ${block}`);
    assert.ok(data, `missing event data in ${block}`);
    return { data: JSON.parse(data) as unknown, event };
  });
}

/**
 * Parses the JSON request body passed to the provider transport.
 *
 * @param init - Fetch initialization from the installed OpenAI client.
 * @returns Parsed provider payload.
 */
function parseProviderBody(init?: RequestInit): Record<string, unknown> {
  const body = init?.body;
  if (typeof body !== "string") throw new assert.AssertionError({ message: "expected provider JSON request body" });
  return JSON.parse(body) as Record<string, unknown>;
}

/**
 * Normalizes a Fetch request target to its URL string.
 *
 * @param input - Fetch request target from the installed OpenAI client.
 * @returns Absolute provider URL.
 */
function providerUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

/**
 * Creates a cancellable synthetic corpus loader for provider integration tests.
 *
 * @param entries - Complete source catalog returned to the service.
 * @returns A deterministic corpus loader.
 */
function syntheticCorpus(entries: readonly SyntheticCorpusEntry[]) {
  /**
   * Returns synthetic sources after observing the request lifecycle.
   *
   * @param signal - Ask request cancellation signal.
   * @returns Complete synthetic source catalog.
   */
  async function buildSyntheticCorpus(signal: AbortSignal): Promise<SyntheticCorpusEntry[]> {
    signal.throwIfAborted();
    await Promise.resolve();
    return [...entries];
  }
  return buildSyntheticCorpus;
}

/**
 * Returns the system message content from a captured provider request.
 *
 * @param request - Parsed provider request body.
 * @returns System prompt text.
 */
function systemPrompt(request: Record<string, unknown>): string {
  const messages = request.messages as { content?: unknown; role?: unknown }[];
  const first = messages.at(0);
  assert.ok(first);
  assert.equal(first.role, "system");
  if (typeof first.content !== "string") throw new assert.AssertionError({ message: "expected system prompt text" });
  return first.content;
}

test("handleAsk sends every synthetic corpus family to the provider", async (t) => {
  configureProvider(t);
  const captured: CapturedProviderRequest[] = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    captured.push({
      body: parseProviderBody(init),
      url: providerUrl(input),
    });
    const answer = JSON.stringify({
      answer: "The project evidence answers this question. [1]",
      sourceIds: ["project:alpha"],
      followUps: [],
    });
    await Promise.resolve();
    return providerResponse([answer.slice(0, 25), answer.slice(25)]);
  });
  const sources = [
    { id: "home:about", title: "About", href: "/#about", text: "CURATED_PROFILE_MARKER" },
    { id: "project:alpha", title: "Alpha", href: "/projects/alpha", text: "PROJECT_BODY_MARKER" },
    { id: "article:beta", title: "Beta", href: "/articles/beta", text: "ARTICLE_BODY_MARKER" },
    { id: "home:code", title: "Code", href: "/#code", text: "OPTIONAL_PUBLIC_DATA_MARKER" },
  ];
  const response = await handleAsk(createJsonRequest({
    messages: [{ role: "user", content: "What experience does Nikita have?" }],
  }), {
    buildCorpus: syntheticCorpus(sources),
  });

  const events = parseServerSentEvents(await response.text());
  assert.equal(captured.length, 1);
  const providerRequest = captured.at(0);
  assert.ok(providerRequest);
  assert.equal(providerRequest.url, "https://provider.fixture/v1/chat/completions");
  const prompt = systemPrompt(providerRequest.body);
  for (const source of sources) assert.match(prompt, new RegExp(source.text, "u"));
  assert.deepEqual(events.at(-1), {
    event: "done",
    data: {
      sources: [{ id: "project:alpha", title: "Alpha", href: "/projects/alpha" }],
      followUps: [],
    },
  });
});

test("handleAsk replaces conflicting record hints with canonical route context", async (t) => {
  configureProvider(t);
  let capturedBody: Record<string, unknown> | undefined;
  t.mock.method(globalThis, "fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBody = parseProviderBody(init);
    await Promise.resolve();
    return providerResponse([JSON.stringify({ answer: "Alpha is the visible project.", sourceIds: [], followUps: [] })]);
  });
  const response = await handleAsk(createJsonRequest({
    context: {
      pathname: "/projects/alpha",
      sectionId: "writing",
      record: { kind: "article", slug: "beta" },
    },
    messages: [{ role: "user", content: "What is this project about?" }],
  }), {
    buildCorpus: syntheticCorpus([
      { id: "project:alpha", title: "Alpha", href: "/projects/alpha", text: "Alpha project" },
      { id: "article:beta", title: "Beta", href: "/articles/beta", text: "Beta article" },
    ]),
  });

  assert.equal(parseServerSentEvents(await response.text()).at(-1)?.event, "done");
  assert.match(systemPrompt(capturedBody ?? {}), /VIEW_CONTEXT:\n\{"pathname":"\/projects\/alpha","record":\{"kind":"project","slug":"alpha"\}\}/u);
});

test("handleAsk removes unknown view context before provider generation", async (t) => {
  configureProvider(t);
  let capturedBody: Record<string, unknown> | undefined;
  t.mock.method(globalThis, "fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBody = parseProviderBody(init);
    await Promise.resolve();
    return providerResponse([JSON.stringify({ answer: "Clarify the reference.", sourceIds: [], followUps: [] })]);
  });
  const response = await handleAsk(createJsonRequest({
    context: { pathname: "/missing", sectionId: "projects", record: { kind: "project", slug: "missing" } },
    messages: [{ role: "user", content: "What is this about?" }],
  }), {
    buildCorpus: syntheticCorpus([
      { id: "project:known", title: "Known", href: "/projects/known", text: "Known project" },
    ]),
  });

  assert.equal(parseServerSentEvents(await response.text()).at(-1)?.event, "done");
  assert.match(systemPrompt(capturedBody ?? {}), /VIEW_CONTEXT:\nnull\n/u);
});

test("handleAsk retains matching record hints on collection routes", async (t) => {
  configureProvider(t);
  const capturedBodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBodies.push(parseProviderBody(init));
    await Promise.resolve();
    return providerResponse([JSON.stringify({ answer: "Visible record.", sourceIds: [], followUps: [] })]);
  });
  const sources = [
    { id: "project:alpha", title: "Alpha", href: "/projects/alpha", text: "Alpha project" },
    { id: "article:beta", title: "Beta", href: "/articles/beta", text: "Beta article" },
  ];
  const contexts = [
    { pathname: "/projects", record: { kind: "project" as const, slug: "alpha" } },
    { pathname: "/articles", record: { kind: "article" as const, slug: "beta" } },
  ];
  for (const context of contexts) {
    const response = await handleAsk(createJsonRequest({
      context,
      messages: [{ role: "user", content: "What is this about?" }],
    }), { buildCorpus: syntheticCorpus(sources) });
    assert.equal(parseServerSentEvents(await response.text()).at(-1)?.event, "done");
  }

  assert.equal(capturedBodies.length, contexts.length);
  for (const [index, context] of contexts.entries()) {
    assert.equal(systemPrompt(capturedBodies[index] ?? {}).includes(`VIEW_CONTEXT:\n${JSON.stringify(context)}\n`), true);
  }
});

test("handleAsk removes wrong-family record hints from collection routes", async (t) => {
  configureProvider(t);
  const capturedBodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBodies.push(parseProviderBody(init));
    await Promise.resolve();
    return providerResponse([JSON.stringify({ answer: "Clarify the record.", sourceIds: [], followUps: [] })]);
  });
  const sources = [
    { id: "project:alpha", title: "Alpha", href: "/projects/alpha", text: "Alpha project" },
    { id: "article:beta", title: "Beta", href: "/articles/beta", text: "Beta article" },
  ];
  const contexts = [
    { pathname: "/projects", record: { kind: "article" as const, slug: "beta" } },
    { pathname: "/articles", record: { kind: "project" as const, slug: "alpha" } },
  ];
  for (const context of contexts) {
    const response = await handleAsk(createJsonRequest({
      context,
      messages: [{ role: "user", content: "What is this about?" }],
    }), { buildCorpus: syntheticCorpus(sources) });
    assert.equal(parseServerSentEvents(await response.text()).at(-1)?.event, "done");
  }

  assert.equal(capturedBodies.length, contexts.length);
  for (const [index, context] of contexts.entries()) {
    const prompt = systemPrompt(capturedBodies[index] ?? {});
    assert.equal(prompt.includes(`VIEW_CONTEXT:\n${JSON.stringify({ pathname: context.pathname })}\n`), true);
    assert.equal(prompt.includes(JSON.stringify(context.record)), false);
  }
});

test("handleAsk makes no retry after a provider HTTP failure", async (t) => {
  configureProvider(t);
  const errorLog = t.mock.method(console, "error", () => undefined);
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    await Promise.resolve();
    return Response.json({ error: { message: "sensitive provider detail" } }, { status: 429 });
  });
  const response = await handleAsk(createJsonRequest({
    messages: [{ role: "user", content: "Question" }],
  }), {
    buildCorpus: syntheticCorpus([
      { id: "home:about", title: "About", href: "/#about", text: "Evidence" },
    ]),
  });

  const events = parseServerSentEvents(await response.text());
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(events.at(-1)?.event, "error");
  assert.equal(events.some(({ event }) => event === "done"), false);
  assert.deepEqual(errorLog.mock.calls[0]?.arguments, ["Portfolio Q&A generation failed."]);
});

test("handleAsk keeps provider partial text but ends with error after a broken HTTP stream", async (t) => {
  configureProvider(t);
  const errorLog = t.mock.method(console, "error", () => undefined);
  t.mock.method(globalThis, "fetch", async () => {
    const prefix = '{"answer":"Visible partial';
    const firstEvent = {
      id: "chatcmpl-fixture",
      object: "chat.completion.chunk",
      created: 1,
      model: "fixture-model",
      choices: [{ index: 0, delta: { role: "assistant", content: prefix }, finish_reason: null }],
    };
    let pullCount = 0;
    const body = new ReadableStream<Uint8Array>({
      /**
       * Emits one valid provider event before simulating a broken connection.
       *
       * @param controller - Provider response stream controller.
       */
      pull(controller) {
        if (pullCount === 0) {
          pullCount += 1;
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(firstEvent)}\n\n`));
          return;
        }
        controller.error(new Error("sensitive midstream provider detail"));
      },
    }, { highWaterMark: 0 });
    await Promise.resolve();
    return new Response(body, { headers: { "content-type": "text/event-stream" } });
  });
  const response = await handleAsk(createJsonRequest({
    messages: [{ role: "user", content: "Question" }],
  }), {
    buildCorpus: syntheticCorpus([
      { id: "home:about", title: "About", href: "/#about", text: "Evidence" },
    ]),
  });

  const events = parseServerSentEvents(await response.text());
  assert.equal(events.filter(({ event }) => event === "delta")
    .map(({ data }) => (data as { text: string }).text).join(""), "Visible partial");
  assert.equal(events.at(-1)?.event, "error");
  assert.equal(events.some(({ event }) => event === "done"), false);
  assert.deepEqual(errorLog.mock.calls[0]?.arguments, ["Portfolio Q&A generation failed."]);
});

test("handleAsk aborts the installed provider client when the browser cancels midstream", { timeout: 2_000 }, async (t) => {
  configureProvider(t);
  let providerSignal: AbortSignal | null | undefined;
  let providerBodyCancelled = false;
  t.mock.method(globalThis, "fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    providerSignal = init?.signal;
    const firstEvent = {
      id: "chatcmpl-fixture",
      object: "chat.completion.chunk",
      created: 1,
      model: "fixture-model",
      choices: [{ index: 0, delta: { role: "assistant", content: '{"answer":"Visible' }, finish_reason: null }],
    };
    let sent = false;
    const body = new ReadableStream<Uint8Array>({
      /**
       * Emits one provider event and then keeps the HTTP stream open.
       *
       * @param controller - Provider response stream controller.
       */
      pull(controller) {
        if (sent) return;
        sent = true;
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(firstEvent)}\n\n`));
      },
      /** Records cancellation propagated to the provider response body. */
      cancel() {
        providerBodyCancelled = true;
      },
    }, { highWaterMark: 0 });
    await Promise.resolve();
    return new Response(body, { headers: { "content-type": "text/event-stream" } });
  });
  const response = await handleAsk(createJsonRequest({ messages: [{ role: "user", content: "Question" }] }), {
    buildCorpus: syntheticCorpus([
      { id: "home:about", title: "About", href: "/#about", text: "Evidence" },
    ]),
  });
  assert.ok(response.body);
  const reader = response.body.getReader();
  await reader.read();
  const partial = await reader.read();
  assert.match(new TextDecoder().decode(partial.value), /Visible/u);

  await reader.cancel();
  assert.equal(providerSignal?.aborted, true);
  assert.equal(providerBodyCancelled, true);
});

test("handleAsk aborts a stalled installed provider stream at the server deadline", async (t) => {
  configureProvider(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(console, "error", () => undefined);
  let providerSignal: AbortSignal | undefined;
  let resolveProviderStarted: (() => void) | undefined;
  const providerStarted = new Promise<void>((resolve) => {
    resolveProviderStarted = resolve;
  });
  t.mock.method(globalThis, "fetch", (_input: RequestInfo | URL, init?: RequestInit) => {
    providerSignal = init?.signal instanceof AbortSignal ? init.signal : undefined;
    resolveProviderStarted?.();
    const body = new ReadableStream<Uint8Array>({
      /**
       * Keeps the provider body open until the service deadline aborts it.
       *
       * @param controller - Provider response stream controller.
       */
      start(controller) {
        providerSignal?.addEventListener("abort", () => {
          controller.error(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      },
    });
    return Promise.resolve(new Response(body, { headers: { "content-type": "text/event-stream" } }));
  });
  const response = await handleAsk(createJsonRequest({ messages: [{ role: "user", content: "Question" }] }), {
    buildCorpus: syntheticCorpus([
      { id: "home:about", title: "About", href: "/#about", text: "Evidence" },
    ]),
  });
  const pendingBody = response.text();
  await providerStarted;

  t.mock.timers.tick(askServerTimeoutMs);

  const events = parseServerSentEvents(await pendingBody);
  assert.equal(providerSignal?.aborted, true);
  assert.equal(events.at(-1)?.event, "error");
  assert.equal(events.some(({ event }) => event === "done"), false);
});

test("handleAsk stops stalled corpus preparation at the server deadline before inference", async (t) => {
  configureProvider(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(console, "error", () => undefined);
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    await Promise.resolve();
    return providerResponse([JSON.stringify({ answer: "Unexpected", sourceIds: [], followUps: [] })]);
  });
  let corpusSignal: AbortSignal | undefined;
  let resolveCorpusStarted: (() => void) | undefined;
  const corpusStarted = new Promise<void>((resolve) => {
    resolveCorpusStarted = resolve;
  });
  /**
   * Waits cooperatively until the whole-request deadline aborts corpus preparation.
   *
   * @param signal - Ask request cancellation signal.
   * @returns A promise that rejects when preparation is cancelled.
   */
  function buildStalledCorpus(signal: AbortSignal): Promise<SyntheticCorpusEntry[]> {
    corpusSignal = signal;
    resolveCorpusStarted?.();
    return new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        reject(signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError"));
      }, { once: true });
    });
  }
  const response = await handleAsk(createJsonRequest({ messages: [{ role: "user", content: "Question" }] }), {
    buildCorpus: buildStalledCorpus,
  });
  const pendingBody = response.text();
  await corpusStarted;

  t.mock.timers.tick(askServerTimeoutMs);

  const events = parseServerSentEvents(await pendingBody);
  assert.equal(corpusSignal?.aborted, true);
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.equal(events.at(-1)?.event, "error");
  assert.equal(events.some(({ event }) => event === "done"), false);
});

test("handleAsk keeps a provider refusal sticky when later chunks clear the field", async (t) => {
  configureProvider(t);
  t.mock.method(console, "error", () => undefined);
  t.mock.method(globalThis, "fetch", async () => {
    const answer = JSON.stringify({ answer: "Apparently valid", sourceIds: [], followUps: [] });
    await Promise.resolve();
    return rawProviderResponse([
      { id: "chatcmpl-fixture", object: "chat.completion.chunk", created: 1, model: "fixture-model", choices: [{ index: 0, delta: { role: "assistant", content: answer, refusal: "Refused" }, finish_reason: null }] },
      { id: "chatcmpl-fixture", object: "chat.completion.chunk", created: 1, model: "fixture-model", choices: [{ index: 0, delta: { refusal: null }, finish_reason: null }] },
      { id: "chatcmpl-fixture", object: "chat.completion.chunk", created: 1, model: "fixture-model", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
    ]);
  });
  const response = await handleAsk(createJsonRequest({ messages: [{ role: "user", content: "Question" }] }), {
    buildCorpus: syntheticCorpus([
      { id: "home:about", title: "About", href: "/#about", text: "Evidence" },
    ]),
  });

  const events = parseServerSentEvents(await response.text());
  assert.equal(events.at(-1)?.event, "error");
  assert.equal(events.some(({ event }) => event === "done"), false);
});

test("handleAsk rejects a non-normal finish reason even when a later chunk reports stop", async (t) => {
  configureProvider(t);
  t.mock.method(console, "error", () => undefined);
  t.mock.method(globalThis, "fetch", async () => {
    const answer = JSON.stringify({ answer: "Truncated answer", sourceIds: [], followUps: [] });
    await Promise.resolve();
    return rawProviderResponse([
      { id: "chatcmpl-fixture", object: "chat.completion.chunk", created: 1, model: "fixture-model", choices: [{ index: 0, delta: { role: "assistant", content: answer }, finish_reason: null }] },
      { id: "chatcmpl-fixture", object: "chat.completion.chunk", created: 1, model: "fixture-model", choices: [{ index: 0, delta: {}, finish_reason: "length" }] },
      { id: "chatcmpl-fixture", object: "chat.completion.chunk", created: 1, model: "fixture-model", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
    ]);
  });
  const response = await handleAsk(createJsonRequest({ messages: [{ role: "user", content: "Question" }] }), {
    buildCorpus: syntheticCorpus([
      { id: "home:about", title: "About", href: "/#about", text: "Evidence" },
    ]),
  });

  const events = parseServerSentEvents(await response.text());
  assert.equal(events.at(-1)?.event, "error");
  assert.equal(events.some(({ event }) => event === "done"), false);
});

test("handleAsk rejects provider content emitted after terminal finish metadata", async (t) => {
  configureProvider(t);
  t.mock.method(console, "error", () => undefined);
  t.mock.method(globalThis, "fetch", async () => {
    const answer = JSON.stringify({ answer: "Late content", sourceIds: [], followUps: [] });
    await Promise.resolve();
    return rawProviderResponse([
      { id: "chatcmpl-fixture", object: "chat.completion.chunk", created: 1, model: "fixture-model", choices: [{ index: 0, delta: { role: "assistant", content: answer.slice(0, 15) }, finish_reason: null }] },
      { id: "chatcmpl-fixture", object: "chat.completion.chunk", created: 1, model: "fixture-model", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
      { id: "chatcmpl-fixture", object: "chat.completion.chunk", created: 1, model: "fixture-model", choices: [{ index: 0, delta: { content: answer.slice(15) }, finish_reason: null }] },
    ]);
  });
  const response = await handleAsk(createJsonRequest({ messages: [{ role: "user", content: "Question" }] }), {
    buildCorpus: syntheticCorpus([
      { id: "home:about", title: "About", href: "/#about", text: "Evidence" },
    ]),
  });

  const events = parseServerSentEvents(await response.text());
  assert.equal(events.at(-1)?.event, "error");
  assert.equal(events.some(({ event }) => event === "done"), false);
});
