import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { askServerConfig } from "./ask.config";
import { AskService } from "./ask.service";
import { AskAnswerService } from "./ask-answer.service";
import { AskCorpusService } from "./ask-corpus.service";
import { AskConfiguration } from "./ask.config";
import type { AskCorpusDependencies, AskCorpus } from "./ask.models";

const { askServerTimeoutMs } = askServerConfig;

interface CapturedProviderRequest {
  body: Record<string, unknown>;
  url: string;
}

interface SyntheticCorpusEntry {
  id: string;
  title: string;
  href: string;
  text: string;
  liveText?: string;
}

interface ProviderMessage {
  content?: unknown;
  role?: unknown;
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
 * @param overrides - Optional provider endpoint and model overrides.
 */
function configureProvider(
  t: TestContext,
  overrides: { baseUrl?: string; model?: string } = {},
): void {
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
  process.env.ASK_API_BASE_URL = overrides.baseUrl ?? "https://provider.fixture/v1";
  process.env.ASK_MODEL = overrides.model ?? "fixture-model";
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
 * Combines system and developer message content from a captured provider request.
 *
 * @param request - Parsed provider request body.
 * @returns System prompt text.
 */
function systemPrompt(request: Record<string, unknown>): string {
  return providerMessages(request)
    .filter(({ role }) => role === "system" || role === "developer")
    .map(({ content }) => messageText(content))
    .join("\n");
}

/**
 * Returns the serialized chat messages from a captured provider request.
 *
 * @param request - Parsed provider request body.
 * @returns Provider message records in wire order.
 */
function providerMessages(request: Record<string, unknown>): ProviderMessage[] {
  if (!Array.isArray(request.messages)) {
    throw new assert.AssertionError({ message: "expected provider messages" });
  }
  return request.messages as ProviderMessage[];
}

/**
 * Combines plain or block-based provider message content into readable text.
 *
 * @param content - Serialized provider message content.
 * @returns Concatenated text from the message.
 */
function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) {
    throw new assert.AssertionError({ message: "expected string or text-block message content" });
  }
  return content.map((block) => {
    if (!block || typeof block !== "object" || Array.isArray(block)) {
      throw new assert.AssertionError({ message: "expected provider text block" });
    }
    const text = (block as { text?: unknown }).text;
    if (typeof text !== "string") throw new assert.AssertionError({ message: "expected provider text block" });
    return text;
  }).join("");
}

test("AskService sends every synthetic corpus family to the provider", async (t) => {
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
  const response = await installedService({
    buildCorpus: syntheticCorpus(sources),
  }).handle(createJsonRequest({
    messages: [{ role: "user", content: "What experience does Nikita have?" }],
  }));

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

test("AskService keeps one explicit OpenAI cache prefix across dynamic request changes", async (t) => {
  configureProvider(t, {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-6-luna",
  });
  const capturedBodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBodies.push(parseProviderBody(init));
    await Promise.resolve();
    return providerResponse([JSON.stringify({
      answer: "Alpha provides the relevant evidence. [1]",
      sourceIds: ["project:alpha"],
      followUps: [],
    })]);
  });
  const baseSources = [
    {
      id: "project:alpha",
      title: "Alpha",
      href: "/projects/alpha",
      text: "CURATED_ALPHA_EVIDENCE",
      liveText: "LIVE_ALPHA_A",
    },
    {
      id: "article:beta",
      title: "Beta",
      href: "/articles/beta",
      text: "CURATED_BETA_EVIDENCE",
    },
  ];
  const baseContext = {
    pathname: "/projects/alpha",
    record: { kind: "project" as const, slug: "alpha" },
  };
  const baseMessages = [{ role: "user" as const, content: "Question one" }];
  const cases = [
    { sources: baseSources, context: baseContext, messages: baseMessages },
    {
      sources: baseSources,
      context: baseContext,
      messages: [
        { role: "user" as const, content: "Earlier question" },
        { role: "assistant" as const, content: "Earlier answer" },
        { role: "user" as const, content: "Different current question" },
      ],
    },
    { sources: baseSources, context: { pathname: "/" }, messages: baseMessages },
    {
      sources: baseSources.map((source) => source.id === "project:alpha"
        ? { ...source, liveText: "LIVE_ALPHA_B" }
        : source),
      context: baseContext,
      messages: baseMessages,
    },
    {
      sources: baseSources.map((source) => source.id === "project:alpha"
        ? { ...source, text: "CURATED_ALPHA_CHANGED" }
        : source),
      context: baseContext,
      messages: baseMessages,
    },
  ];

  for (const requestCase of cases) {
    const response = await installedService({
      buildCorpus: syntheticCorpus(requestCase.sources),
    }).handle(createJsonRequest({
      context: requestCase.context,
      messages: requestCase.messages,
    }));
    assert.deepEqual(parseServerSentEvents(await response.text()).at(-1), {
      event: "done",
      data: {
        sources: [{ id: "project:alpha", title: "Alpha", href: "/projects/alpha" }],
        followUps: [],
      },
    });
  }

  assert.equal(capturedBodies.length, cases.length);
  const requests = capturedBodies.map(providerMessages);
  const stableMessages = requests.map((messages) => messages.at(0));
  const dynamicMessages = requests.map((messages) => messages.at(1));
  const stableText = messageText(stableMessages[0]?.content);
  assert.deepEqual(stableMessages[0], {
    role: "system",
    content: [{
      type: "text",
      text: stableText,
      prompt_cache_breakpoint: { mode: "explicit" },
    }],
  });
  assert.match(stableText, /PORTFOLIO_DATA:\n/u);
  assert.match(stableText, /CURATED_ALPHA_EVIDENCE/u);
  assert.match(stableText, /CURATED_BETA_EVIDENCE/u);
  assert.doesNotMatch(stableText, /LIVE_ALPHA_/u);
  for (const index of [1, 2, 3]) assert.deepEqual(stableMessages[index], stableMessages[0]);
  assert.notDeepEqual(stableMessages[4], stableMessages[0]);
  assert.match(messageText(stableMessages[4]?.content), /CURATED_ALPHA_CHANGED/u);

  assert.deepEqual(dynamicMessages[0], dynamicMessages[1]);
  assert.notDeepEqual(dynamicMessages[2], dynamicMessages[0]);
  assert.notDeepEqual(dynamicMessages[3], dynamicMessages[0]);
  assert.match(messageText(dynamicMessages[0]?.content), /VIEW_CONTEXT:\n\{"pathname":"\/projects\/alpha","record":\{"kind":"project","slug":"alpha"\}\}/u);
  assert.match(messageText(dynamicMessages[0]?.content), /LIVE_PORTFOLIO_DATA:\n\[\{"id":"project:alpha","text":"LIVE_ALPHA_A"\}\]/u);
  assert.match(messageText(dynamicMessages[2]?.content), /VIEW_CONTEXT:\n\{"pathname":"\/"\}/u);
  assert.match(messageText(dynamicMessages[3]?.content), /LIVE_PORTFOLIO_DATA:\n\[\{"id":"project:alpha","text":"LIVE_ALPHA_B"\}\]/u);
  assert.doesNotMatch(messageText(dynamicMessages[0]?.content), /CURATED_ALPHA_EVIDENCE/u);
  assert.deepEqual(requests[1]?.slice(2), [
    { role: "user", content: "Earlier question" },
    { role: "assistant", content: "Earlier answer" },
    { role: "user", content: "Different current question" },
  ]);

  for (const body of capturedBodies) {
    assert.deepEqual(body.prompt_cache_options, { mode: "explicit" });
    assert.equal(Object.hasOwn(body, "stream_options"), false);
    assert.deepEqual(body.response_format, capturedBodies[0]?.response_format);
  }
});

test("AskService omits OpenAI cache extensions for custom providers and older models", async (t) => {
  configureProvider(t, {
    baseUrl: "https://provider.fixture/v1",
    model: "gpt-6-luna",
  });
  const capturedBodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBodies.push(parseProviderBody(init));
    await Promise.resolve();
    return providerResponse([JSON.stringify({ answer: "Evidence.", sourceIds: [], followUps: [] })]);
  });
  const sources = [{
    id: "home:about",
    title: "About",
    href: "/#about",
    text: "CURATED_EVIDENCE",
    liveText: "LIVE_EVIDENCE",
  }];

  const customResponse = await installedService({ buildCorpus: syntheticCorpus(sources) }).handle(createJsonRequest({
    messages: [{ role: "user", content: "Custom provider question" }],
  }));
  assert.equal(parseServerSentEvents(await customResponse.text()).at(-1)?.event, "done");

  process.env.ASK_API_BASE_URL = "https://api.openai.com/v1";
  process.env.ASK_MODEL = "gpt-4o";
  const olderModelResponse = await installedService({ buildCorpus: syntheticCorpus(sources) }).handle(createJsonRequest({
    messages: [{ role: "user", content: "Older model question" }],
  }));
  assert.equal(parseServerSentEvents(await olderModelResponse.text()).at(-1)?.event, "done");

  assert.equal(capturedBodies.length, 2);
  for (const body of capturedBodies) {
    const messages = providerMessages(body);
    assert.equal(messages.length, 3);
    const expectedRole = "system";
    assert.deepEqual(messages.slice(0, 2).map(({ role }) => role), [expectedRole, expectedRole]);
    assert.equal(typeof messages[0]?.content, "string");
    assert.equal(typeof messages[1]?.content, "string");
    assert.match(messageText(messages[0]?.content), /CURATED_EVIDENCE/u);
    assert.doesNotMatch(messageText(messages[0]?.content), /LIVE_EVIDENCE/u);
    assert.match(messageText(messages[1]?.content), /LIVE_EVIDENCE/u);
    assert.doesNotMatch(messageText(messages[1]?.content), /CURATED_EVIDENCE/u);
    assert.equal(Object.hasOwn(body, "prompt_cache_options"), false);
    assert.equal(Object.hasOwn(body, "stream_options"), false);
    assert.doesNotMatch(JSON.stringify(body), /prompt_cache_breakpoint/u);
    assert.match(systemPrompt(body), /CURATED_EVIDENCE/u);
    assert.match(systemPrompt(body), /LIVE_EVIDENCE/u);
  }
});

test("AskService replaces conflicting record hints with canonical route context", async (t) => {
  configureProvider(t);
  let capturedBody: Record<string, unknown> | undefined;
  t.mock.method(globalThis, "fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBody = parseProviderBody(init);
    await Promise.resolve();
    return providerResponse([JSON.stringify({ answer: "Alpha is the visible project.", sourceIds: [], followUps: [] })]);
  });
  const response = await installedService({
    buildCorpus: syntheticCorpus([
      { id: "project:alpha", title: "Alpha", href: "/projects/alpha", text: "Alpha project" },
      { id: "article:beta", title: "Beta", href: "/articles/beta", text: "Beta article" },
    ]),
  }).handle(createJsonRequest({
    context: {
      pathname: "/projects/alpha",
      sectionId: "writing",
      record: { kind: "article", slug: "beta" },
    },
    messages: [{ role: "user", content: "What is this project about?" }],
  }));

  assert.equal(parseServerSentEvents(await response.text()).at(-1)?.event, "done");
  assert.match(systemPrompt(capturedBody ?? {}), /VIEW_CONTEXT:\n\{"pathname":"\/projects\/alpha","record":\{"kind":"project","slug":"alpha"\}\}/u);
});

test("AskService removes unknown view context before provider generation", async (t) => {
  configureProvider(t);
  let capturedBody: Record<string, unknown> | undefined;
  t.mock.method(globalThis, "fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBody = parseProviderBody(init);
    await Promise.resolve();
    return providerResponse([JSON.stringify({ answer: "Clarify the reference.", sourceIds: [], followUps: [] })]);
  });
  const response = await installedService({
    buildCorpus: syntheticCorpus([
      { id: "project:known", title: "Known", href: "/projects/known", text: "Known project" },
    ]),
  }).handle(createJsonRequest({
    context: { pathname: "/missing", sectionId: "projects", record: { kind: "project", slug: "missing" } },
    messages: [{ role: "user", content: "What is this about?" }],
  }));

  assert.equal(parseServerSentEvents(await response.text()).at(-1)?.event, "done");
  assert.match(systemPrompt(capturedBody ?? {}), /VIEW_CONTEXT:\nnull\n/u);
});

test("AskService retains matching record hints on collection routes", async (t) => {
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
    const response = await installedService({ buildCorpus: syntheticCorpus(sources) }).handle(createJsonRequest({
      context,
      messages: [{ role: "user", content: "What is this about?" }],
    }));
    assert.equal(parseServerSentEvents(await response.text()).at(-1)?.event, "done");
  }

  assert.equal(capturedBodies.length, contexts.length);
  for (const [index, context] of contexts.entries()) {
    assert.equal(systemPrompt(capturedBodies[index] ?? {}).includes(`VIEW_CONTEXT:\n${JSON.stringify(context)}\n`), true);
  }
});

test("AskService removes wrong-family record hints from collection routes", async (t) => {
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
    const response = await installedService({ buildCorpus: syntheticCorpus(sources) }).handle(createJsonRequest({
      context,
      messages: [{ role: "user", content: "What is this about?" }],
    }));
    assert.equal(parseServerSentEvents(await response.text()).at(-1)?.event, "done");
  }

  assert.equal(capturedBodies.length, contexts.length);
  for (const [index, context] of contexts.entries()) {
    const prompt = systemPrompt(capturedBodies[index] ?? {});
    assert.equal(prompt.includes(`VIEW_CONTEXT:\n${JSON.stringify({ pathname: context.pathname })}\n`), true);
    assert.equal(prompt.includes(JSON.stringify(context.record)), false);
  }
});

test("AskService makes no retry after a provider HTTP failure", async (t) => {
  configureProvider(t);
  const errorLog = t.mock.method(console, "error", () => undefined);
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    await Promise.resolve();
    return Response.json({ error: { message: "sensitive provider detail" } }, { status: 429 });
  });
  const response = await installedService({
    buildCorpus: syntheticCorpus([
      { id: "home:about", title: "About", href: "/#about", text: "Evidence" },
    ]),
  }).handle(createJsonRequest({
    messages: [{ role: "user", content: "Question" }],
  }));

  const events = parseServerSentEvents(await response.text());
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(events.at(-1)?.event, "error");
  assert.equal(events.some(({ event }) => event === "done"), false);
  assert.deepEqual(errorLog.mock.calls[0]?.arguments, ["Portfolio Q&A generation failed."]);
});

test("AskService keeps provider partial text but ends with error after a broken HTTP stream", async (t) => {
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
  const response = await installedService({
    buildCorpus: syntheticCorpus([
      { id: "home:about", title: "About", href: "/#about", text: "Evidence" },
    ]),
  }).handle(createJsonRequest({
    messages: [{ role: "user", content: "Question" }],
  }));

  const events = parseServerSentEvents(await response.text());
  assert.equal(events.filter(({ event }) => event === "delta")
    .map(({ data }) => (data as { text: string }).text).join(""), "Visible partial");
  assert.equal(events.at(-1)?.event, "error");
  assert.equal(events.some(({ event }) => event === "done"), false);
  assert.deepEqual(errorLog.mock.calls[0]?.arguments, ["Portfolio Q&A generation failed."]);
});

test("AskService aborts the installed provider client when the browser cancels midstream", { timeout: 2_000 }, async (t) => {
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
  const response = await installedService({
    buildCorpus: syntheticCorpus([
      { id: "home:about", title: "About", href: "/#about", text: "Evidence" },
    ]),
  }).handle(createJsonRequest({ messages: [{ role: "user", content: "Question" }] }));
  assert.ok(response.body);
  const reader = response.body.getReader();
  await reader.read();
  const partial = await reader.read();
  assert.match(new TextDecoder().decode(partial.value), /Visible/u);

  await reader.cancel();
  assert.equal(providerSignal?.aborted, true);
  assert.equal(providerBodyCancelled, true);
});

test("AskService aborts a stalled installed provider stream at the server deadline", async (t) => {
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
  const response = await installedService({
    buildCorpus: syntheticCorpus([
      { id: "home:about", title: "About", href: "/#about", text: "Evidence" },
    ]),
  }).handle(createJsonRequest({ messages: [{ role: "user", content: "Question" }] }));
  const pendingBody = response.text();
  await providerStarted;

  t.mock.timers.tick(askServerTimeoutMs);

  const events = parseServerSentEvents(await pendingBody);
  assert.equal(providerSignal?.aborted, true);
  assert.equal(events.at(-1)?.event, "error");
  assert.equal(events.some(({ event }) => event === "done"), false);
});

test("AskService stops stalled corpus preparation at the server deadline before inference", async (t) => {
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
  const response = await installedService({
    buildCorpus: buildStalledCorpus,
  }).handle(createJsonRequest({ messages: [{ role: "user", content: "Question" }] }));
  const pendingBody = response.text();
  await corpusStarted;

  t.mock.timers.tick(askServerTimeoutMs);

  const events = parseServerSentEvents(await pendingBody);
  assert.equal(corpusSignal?.aborted, true);
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.equal(events.at(-1)?.event, "error");
  assert.equal(events.some(({ event }) => event === "done"), false);
});

test("AskService keeps a provider refusal sticky when later chunks clear the field", async (t) => {
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
  const response = await installedService({
    buildCorpus: syntheticCorpus([
      { id: "home:about", title: "About", href: "/#about", text: "Evidence" },
    ]),
  }).handle(createJsonRequest({ messages: [{ role: "user", content: "Question" }] }));

  const events = parseServerSentEvents(await response.text());
  assert.equal(events.at(-1)?.event, "error");
  assert.equal(events.some(({ event }) => event === "done"), false);
});

test("AskService rejects a non-normal finish reason even when a later chunk reports stop", async (t) => {
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
  const response = await installedService({
    buildCorpus: syntheticCorpus([
      { id: "home:about", title: "About", href: "/#about", text: "Evidence" },
    ]),
  }).handle(createJsonRequest({ messages: [{ role: "user", content: "Question" }] }));

  const events = parseServerSentEvents(await response.text());
  assert.equal(events.at(-1)?.event, "error");
  assert.equal(events.some(({ event }) => event === "done"), false);
});

test("AskService rejects provider content emitted after terminal finish metadata", async (t) => {
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
  const response = await installedService({
    buildCorpus: syntheticCorpus([
      { id: "home:about", title: "About", href: "/#about", text: "Evidence" },
    ]),
  }).handle(createJsonRequest({ messages: [{ role: "user", content: "Question" }] }));

  const events = parseServerSentEvents(await response.text());
  assert.equal(events.at(-1)?.event, "error");
  assert.equal(events.some(({ event }) => event === "done"), false);
});

/**
 * Composes the installed provider path with controlled content operations.
 * @param dependencies - Corpus builder or synthetic content operations.
 * @returns The request owner with mandatory environment validation.
 */
function installedService(dependencies: AskCorpusDependencies & { buildCorpus?: AskCorpus["build"] } = {}): AskService {
  return new AskService({
    /** Resolves the provider snapshot at the request validation boundary.
     * @returns The controlled operation result.
     */ resolveConfiguration: () => AskConfiguration.fromEnvironment(),
    answerService: new AskAnswerService({
      corpusService: dependencies.buildCorpus ? { build: dependencies.buildCorpus } : new AskCorpusService(dependencies),
    }),
  });
}
