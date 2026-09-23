import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import {
  type AskRequest,
} from "@/lib/ask.contract";
import { askLimits } from "@/lib/ask.config";

import { AskService } from "./ask.service";
import { AskAnswerService } from "./ask-answer.service";
import { AskCorpusService } from "./ask-corpus.service";
import { AskConfiguration } from "./ask.config";
import type { AskCorpusDependencies, AskCorpus, AskAnswerDependencies } from "./ask.models";

const { maxAskAssistantMessageLength, maxAskBodyBytes, maxAskUserMessageLength } = askLimits;

interface FixtureOptions {
  finishReason?: string | null;
  refusal?: unknown;
  sources?: { id: string; title: string; href: string; text: string }[];
}

type ServerSentEvent = { data: unknown; event: string };

/**
 * Creates one JSON POST request with an optional cancellation signal.
 *
 * @param body - JSON-compatible request body.
 * @param signal - Optional request cancellation signal.
 * @returns A request targeting the Ask endpoint.
 */
function createJsonRequest(body: unknown, signal?: AbortSignal): Request {
  return new Request("http://localhost/api/ask", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
    ...(signal ? { signal } : {}),
  });
}

/**
 * Produces a raw generation session from controlled JSON fragments.
 *
 * @param fragments - Raw structured-output fragments.
 * @param options - Terminal metadata and source catalog overrides.
 * @returns A session factory accepted by the public service operation.
 */
function fixtureSession(fragments: readonly string[], options: FixtureOptions = {}): AskAnswerDependencies {
  return {
    corpusService: {
      /** @returns The controlled source catalog for this fixture. */
      build: () => Promise.resolve(options.sources ?? [{ id: "project:fixture", title: "Fixture", href: "/projects/fixture", text: "Evidence" }]),
    },
    /**
     * Supplies raw provider fragments without bypassing configuration resolution.
     * @param _input - Validated request unused by this fixture.
     * @param signal - Request lifecycle cancellation signal.
     * @returns Controlled raw provider chunks.
     */
    createProviderSession: (_input, signal) => Promise.resolve( (async function* () {
      await Promise.resolve();
      for (const [index, text] of fragments.entries()) {
        signal.throwIfAborted();
        yield {
          text,
          ...(index === fragments.length - 1
            ? { ...(options.finishReason !== null ? { finishReason: options.finishReason ?? "stop" } : {}), ...(Object.hasOwn(options, "refusal") ? { refusal: options.refusal } : {}) }
            : {}),
        };
      }
    })()),
  };
}

/**
 * Parses a complete server-sent event payload.
 *
 * @param payload - Serialized event stream.
 * @returns Parsed event names and data.
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
 * Configures the installed provider path without retaining environment changes.
 *
 * @param t - Node test context that owns cleanup.
 */
function configureFixtureProvider(t: TestContext): void {
  const names = ["ASK_API_KEY", "ASK_API_BASE_URL", "ASK_MODEL", "GITHUB_TOKEN"] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  t.after(() => {
    for (const name of names) {
      const value = previous[name];
      if (value === undefined) Reflect.deleteProperty(process.env, name); else process.env[name] = value;
    }
  });
  process.env.ASK_API_KEY = "fixture-key";
  process.env.ASK_API_BASE_URL = "https://provider.fixture/v1";
  process.env.ASK_MODEL = "fixture-model";
  process.env.GITHUB_TOKEN = "fixture-github-token";
}

/**
 * Creates a valid raw provider stream for one short answer.
 *
 * @returns A successful Chat Completions event stream.
 */
function successfulProviderResponse(): Response {
  const answer = JSON.stringify({ answer: "Answer", sourceIds: [], followUps: [] });
  const chunks = [
    { id: "chatcmpl-fixture", object: "chat.completion.chunk", created: 1, model: "fixture-model", choices: [{ index: 0, delta: { role: "assistant", content: answer }, finish_reason: null }] },
    { id: "chatcmpl-fixture", object: "chat.completion.chunk", created: 1, model: "fixture-model", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
  ];
  return new Response(`${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`, {
    headers: { "content-type": "text/event-stream" },
  });
}

/** @returns An empty synthetic project collection. */
function loadNoProjects(): Promise<never[]> {
  return Promise.resolve([]);
}

/** @returns An empty synthetic article collection. */
function loadNoArticles(): Promise<never[]> {
  return Promise.resolve([]);
}

/**
 * Asserts a safe uncached JSON response status.
 *
 * @param run - Pending response.
 * @param status - Expected HTTP status.
 */
async function rejectsWithStatus(run: Promise<Response>, status: number): Promise<void> {
  const response = await run;
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json() as { error: unknown };
  assert.equal(typeof body.error, "string");
}

test("AskService accepts role-specific limits and normalizes the new view context", async () => {
  const body = {
    messages: [
      { role: "user", content: "u".repeat(maxAskUserMessageLength) },
      { role: "assistant", content: "a".repeat(maxAskAssistantMessageLength) },
      { role: "user", content: "  Question  " },
    ],
    context: { pathname: "/projects/fixture", sectionId: "projects", record: { kind: "project", slug: "fixture" } },
  };
  let received: AskRequest | undefined;
  const response = await fixtureService({
    corpusService: {
      /** Supplies request-owned synthetic evidence.
       * @returns The controlled operation result.
       */ build: () => Promise.resolve([]) },
    /** Supplies controlled provider chunks and records the validated request boundary.
     * @param input - Validated conversation input.
     * @param signal - Request lifecycle cancellation signal.
     * @param configuration - Resolved provider configuration.
     * @param sources - Server-owned source allowlist.
     * @returns The controlled operation result.
     */ createProviderSession: (input, signal, configuration, sources) => {
      received = input;
      const factory = fixtureSession(['{"answer":"Answer","sourceIds":[],"followUps":[]}']).createProviderSession;
      assert.ok(factory);
      return factory(input, signal, configuration, sources);
    },
  }).handle(createJsonRequest(body));
  assert.equal(response.status, 200);
  await response.text();
  assert.ok(received);
  assert.equal(received.messages.at(-1)?.content, "Question");
  assert.deepEqual(received.context, body.context);
});

test("AskService rejects invalid request, message, and context shapes", async () => {
  const invalidBodies: unknown[] = [
    {},
    { messages: [] },
    { messages: Array.from({ length: 13 }, (_, index) => ({ content: String(index), role: index % 2 ? "assistant" : "user" })) },
    { messages: [{ content: "Answer", role: "assistant" }] },
    { messages: [{ content: "First", role: "user" }, { content: "Second", role: "user" }] },
    { messages: [{ content: " ", role: "user" }] },
    { messages: [{ content: "x".repeat(maxAskUserMessageLength + 1), role: "user" }] },
    { messages: [{ content: "Question", role: "system" }] },
    { messages: [{ content: "Question", extra: true, role: "user" }] },
    { extra: true, messages: [{ content: "Question", role: "user" }] },
    { context: { pathname: "https://example.com" }, messages: [{ content: "Question", role: "user" }] },
    { context: { pathname: "/projects?query=x" }, messages: [{ content: "Question", role: "user" }] },
    { context: { pathname: "/", sectionId: "bad section" }, messages: [{ content: "Question", role: "user" }] },
    { context: { pathname: "/", record: { kind: "project", slug: "Invalid Slug" } }, messages: [{ content: "Question", role: "user" }] },
  ];
  for (const body of invalidBodies) {
    await rejectsWithStatus(fixtureService(fixtureSession([])).handle(createJsonRequest(body)), 400);
  }
});

test("AskService rejects non-JSON, malformed JSON, and actual oversized UTF-8 bodies", async () => {
  await rejectsWithStatus(fixtureService(fixtureSession([])).handle(new Request("http://localhost/api/ask", {
    body: "{}", headers: { "content-type": "text/plain" }, method: "POST",
  })), 415);
  await rejectsWithStatus(fixtureService(fixtureSession([])).handle(new Request("http://localhost/api/ask", {
    body: "{", headers: { "content-type": "application/json" }, method: "POST",
  })), 400);
  const payload = JSON.stringify({ messages: [{ content: "Question", role: "user" }], padding: "🙂".repeat(maxAskBodyBytes) });
  await rejectsWithStatus(fixtureService(fixtureSession([])).handle(new Request("http://localhost/api/ask", {
    body: payload, headers: { "content-type": "application/json" }, method: "POST",
  })), 413);
});

test("AskService validates operator configuration before opening the live stream", async (t) => {
  const protectedNames = [
    "ASK_API_KEY",
    "LANGSMITH_TRACING",
    "LANGSMITH_TRACING_V2",
    "LANGCHAIN_TRACING",
    "LANGCHAIN_TRACING_V2",
    "LANGCHAIN_VERBOSE",
  ] as const;
  const previous = Object.fromEntries(protectedNames.map((name) => [name, process.env[name]]));
  t.after(() => {
    for (const name of protectedNames) {
      const value = previous[name];
      if (value === undefined) Reflect.deleteProperty(process.env, name); else process.env[name] = value;
    }
  });
  for (const name of protectedNames) Reflect.deleteProperty(process.env, name);
  delete process.env.ASK_API_KEY;
  await rejectsWithStatus(installedService().handle(createJsonRequest({ messages: [{ role: "user", content: "Question" }] })), 503);
  process.env.ASK_API_KEY = "fixture-key";
  for (const name of protectedNames.slice(1)) {
    process.env[name] = "true";
    await rejectsWithStatus(installedService().handle(createJsonRequest({ messages: [{ role: "user", content: "Question" }] })), 503);
    Reflect.deleteProperty(process.env, name);
  }
});

test("AskService uses one raw ChatOpenAI strict-schema request with no tools or tracing", async (t) => {
  const environment = ["ASK_API_KEY", "ASK_API_BASE_URL", "ASK_MODEL", "OPENAI_LOG"] as const;
  const previous = Object.fromEntries(environment.map((name) => [name, process.env[name]]));
  t.after(() => {
    for (const name of environment) {
      const value = previous[name];
      if (value === undefined) Reflect.deleteProperty(process.env, name); else process.env[name] = value;
    }
  });
  process.env.ASK_API_KEY = "fixture-key";
  process.env.ASK_API_BASE_URL = "https://provider.fixture/v1";
  process.env.ASK_MODEL = "fixture-model";
  process.env.OPENAI_LOG = "debug";
  let requestBody: Record<string, unknown> | undefined;
  const fetchMock = t.mock.method(globalThis, "fetch", async (_input: string | URL | Request, init?: RequestInit) => {
    const requestPayload = init?.body;
    if (typeof requestPayload !== "string") throw new Error("Expected serialized provider request body");
    requestBody = JSON.parse(requestPayload) as Record<string, unknown>;
    const answer = JSON.stringify({ answer: "SDK answer [1]", sourceIds: ["project:fixture"], followUps: [] });
    const chunks = [
      { id: "chatcmpl-fixture", object: "chat.completion.chunk", created: 1, model: "fixture-model", choices: [{ index: 0, delta: { role: "assistant", content: answer.slice(0, 20) }, finish_reason: null }] },
      { id: "chatcmpl-fixture", object: "chat.completion.chunk", created: 1, model: "fixture-model", choices: [{ index: 0, delta: { content: answer.slice(20) }, finish_reason: null }] },
      { id: "chatcmpl-fixture", object: "chat.completion.chunk", created: 1, model: "fixture-model", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
    ];
    const body = `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`;
    await Promise.resolve();
    return new Response(body, { headers: { "content-type": "text/event-stream" } });
  });
  /**
   * Loads synthetic evidence while retaining the production provider path.
   *
   * @param signal - Request lifecycle signal.
   * @returns One controlled source.
   */
  async function buildFixtureCorpus(signal: AbortSignal) {
    signal.throwIfAborted();
    await Promise.resolve();
    return [{ id: "project:fixture", title: "Fixture", href: "/projects/fixture", text: "Synthetic evidence" }];
  }
  const response = await installedService({ buildCorpus: buildFixtureCorpus }).handle(createJsonRequest({
      context: { pathname: "/", sectionId: "projects", record: { kind: "project", slug: "fixture" } },
      messages: [{ role: "user", content: "Question" }],
    }));
  const events = parseServerSentEvents(await response.text());
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(events.filter(({ event }) => event === "delta").map(({ data }) => (data as { text: string }).text).join(""), "SDK answer [1]");
  assert.equal(events.at(-1)?.event, "done");
  assert.ok(requestBody);
  assert.equal(requestBody.stream, true);
  assert.equal(Object.hasOwn(requestBody, "tools"), false);
  assert.equal(Object.hasOwn(requestBody, "stream_options"), false);
  const format = requestBody.response_format as { json_schema: { strict: unknown; schema: { properties: { sourceIds: { items: { enum: unknown } } } } } };
  assert.equal(format.json_schema.strict, true);
  assert.deepEqual(format.json_schema.schema.properties.sourceIds.items.enum, ["project:fixture"]);
  const messages = requestBody.messages as { content?: unknown }[];
  assert.match(String(messages[0]?.content), /Synthetic evidence/u);
  assert.match(String(messages[1]?.content), /VIEW_CONTEXT:\n\{"pathname":"\/","record":\{"kind":"project","slug":"fixture"\}\}/u);
});

test("AskService partitions synthetic website evidence by its rendered source context", async (t) => {
  configureFixtureProvider(t);
  t.mock.method(console, "warn", () => undefined);
  let requestBody: Record<string, unknown> | undefined;
  const githubRequests: string[] = [];
  t.mock.method(globalThis, "fetch", async (_input: string | URL | Request, init?: RequestInit) => {
    if (typeof init?.body !== "string") throw new Error("Expected serialized provider request body");
    requestBody = JSON.parse(init.body) as Record<string, unknown>;
    await Promise.resolve();
    return successfulProviderResponse();
  });
  const syntheticPortfolio = {
    profile: {
      name: "Synthetic Person",
      headline: "Synthetic headline",
      summary: ["ABOUT_SUMMARY_MARKER"],
      careerChapters: [{ id: "chapter", meta: "Synthetic period", title: "Synthetic chapter", summary: "ABOUT_CHAPTER_MARKER" }],
      recommendations: [{ author: "Synthetic author", position: "Synthetic position", quote: "EMPLOYMENT_RECOMMENDATION_MARKER" }],
      experience: [{
        organization: "Synthetic organization",
        logo: "/synthetic.svg",
        role: "Synthetic role",
        chapter: "chapter",
        start: "2020-01",
        end: "2021-01",
        period: "January 2020 — January 2021",
        summary: "EMPLOYMENT_CAPABILITY_MARKER",
        highlights: [],
      }],
      education: { institution: "Synthetic institution", qualification: "Synthetic degree", period: "Synthetic period", location: "Synthetic location" },
      certifications: [{ title: "Synthetic certification", date: "Synthetic date", icon: "/synthetic.svg", href: "https://example.test/certification" }],
      learning: [{ title: "Synthetic learning", provider: "Synthetic provider" }],
      skills: [{ title: "Synthetic skills", skills: ["SKILL_INVENTORY_MARKER"] }],
      links: [{ label: "Synthetic link", href: "https://example.test/profile" }],
    },
    home: {
      metadataDescription: "Synthetic metadata",
      mobileNavigation: { scrollThreshold: 317 },
      hero: {
        availability: { status: "HERO_STATUS_MARKER", qualifier: "HERO_QUALIFIER_MARKER" },
        title: "HERO_TITLE_MARKER",
        lead: "HERO_LEAD_MARKER",
        descriptors: ["HERO_DESCRIPTOR_MARKER"],
        descriptorInterval: 3201,
        resumeHref: "https://example.test/resume",
      },
      projects: { featuredSlugs: ["synthetic-project"], indexDescription: "PROJECT_INDEX_MARKER" },
      codeActivity: { username: "synthetic-user" },
      writing: { indexDescription: "WRITING_INDEX_MARKER" },
      contact: { description: "CONTACT_DESCRIPTION_MARKER", email: "synthetic@example.test" },
      footer: { locale: "en", timeZone: "UTC" },
    },
  };
  const response = await installedService({
      portfolio: syntheticPortfolio,
      /**
       * Records the synthetic username and rejects optional activity loading.
       *
       * @param input - Requested GitHub URL.
       * @param init - Requested GitHub options.
       * @returns A rejected optional-data request.
       */
      githubFetch: (input, init) => {
        githubRequests.push(`${input}\n${typeof init.body === "string" ? init.body : ""}`);
        return Promise.reject(new Error("Synthetic optional data unavailable"));
      },
      /** @returns One synthetic portfolio project. */
      loadProjects: () => Promise.resolve([{
        askText: "PROJECT_BODY_MARKER",
        slug: "synthetic-project",
        metadata: {
          kind: "project" as const,
          title: "Synthetic project",
          description: "Synthetic project description",
          links: [{ label: "Synthetic project link", href: "https://example.test/project" }],
        },
        /** @returns No rendered fixture output. */
        Content: () => null,
      }]),
      /** @returns One synthetic technical article. */
      loadArticles: () => Promise.resolve([{
        askText: "ARTICLE_BODY_MARKER",
        slug: "synthetic-article",
        metadata: { kind: "article" as const, title: "Synthetic article", description: "Synthetic article description", published: "2026-01-01" },
        readingMinutes: 1,
        /** @returns No rendered fixture output. */
        Content: () => null,
      }]),
    }).handle(createJsonRequest({ messages: [{ role: "user", content: "Map Nikita's evidence." }] }));
  assert.equal(response.status, 200);
  await response.text();
  assert.ok(requestBody);
  const messages = requestBody.messages as { content?: unknown }[];
  const prompt = String(messages[0]?.content);
  const marker = "\nPORTFOLIO_DATA:\n";
  const markerIndex = prompt.lastIndexOf(marker);
  assert.notEqual(markerIndex, -1);
  const sources = JSON.parse(prompt.slice(markerIndex + marker.length)) as { href: string; id: string; text: string; title: string }[];
  assert.equal(sources.length, 11);
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const byId = new Map(sources.map((source) => [source.id, JSON.parse(source.text) as Record<string, unknown>]));
  const livePrompt = String(messages[1]?.content);
  const liveMarker = "\nLIVE_PORTFOLIO_DATA:\n";
  const liveSources = JSON.parse(livePrompt.slice(livePrompt.indexOf(liveMarker) + liveMarker.length)) as { id: string; text: string }[];
  const liveById = new Map(liveSources.map((source) => [source.id, JSON.parse(source.text) as Record<string, unknown>]));

  assert.deepEqual(sourceById.get("home:top"), {
    id: "home:top",
    title: "Portfolio overview",
    href: "/",
    text: sourceById.get("home:top")?.text,
  });
  assert.deepEqual(byId.get("home:top"), {
    evidenceType: "portfolio introduction",
    identity: { name: syntheticPortfolio.profile.name, headline: syntheticPortfolio.profile.headline },
    metadataDescription: syntheticPortfolio.home.metadataDescription,
    hero: syntheticPortfolio.home.hero,
    mobileNavigation: syntheticPortfolio.home.mobileNavigation,
    footer: syntheticPortfolio.home.footer,
  });
  assert.deepEqual(byId.get("home:about"), {
    evidenceType: "portfolio about",
    summary: syntheticPortfolio.profile.summary,
    careerChapters: syntheticPortfolio.profile.careerChapters,
  });
  assert.equal(JSON.stringify(byId.get("home:about")).includes("EMPLOYMENT_CAPABILITY_MARKER"), false);
  assert.equal(JSON.stringify(byId.get("home:about")).includes("SKILL_INVENTORY_MARKER"), false);
  assert.equal(byId.get("home:experience")?.evidenceType, "employment history");
  assert.equal(byId.get("home:skills")?.evidenceType, "self-reported skill inventory");
  assert.equal(byId.get("project:synthetic-project")?.evidenceType, "portfolio project");
  assert.equal(byId.get("article:synthetic-article")?.evidenceType, "technical writing");
  assert.deepEqual(liveById.get("project:synthetic-project")?.renderedLinks, [
    { label: "Synthetic project link", href: "https://example.test/project" },
  ]);
  assert.equal(byId.get("home:code")?.username, syntheticPortfolio.home.codeActivity.username);
  assert.equal(Object.hasOwn(byId.get("home:code") ?? {}, "projectLinkMetadata"), false);
  assert.match(githubRequests.join("\n"), /synthetic-user/u);

  const pending: unknown[] = [syntheticPortfolio.profile, syntheticPortfolio.home];
  const portfolioValues: unknown[] = [];
  while (pending.length) {
    const value = pending.pop();
    if (Array.isArray(value)) pending.push(...(value as unknown[]));
    else if (value && typeof value === "object") pending.push(...Object.values(value as Record<string, unknown>));
    else portfolioValues.push(value);
  }
  const serializedCorpus = sources.map(({ text }) => text).join("\n");
  for (const value of portfolioValues) {
    assert.equal(serializedCorpus.includes(JSON.stringify(value)), true, `missing portfolio value ${String(value)}`);
  }
  assert.match(prompt, /skill inventory entry establishes only.*not where, how long, or commercially/u);
  assert.match(prompt, /Do not infer a current employer from a dated record/u);
  assert.match(prompt, /Do not merge details across evidence contexts/u);
  assert.match(prompt, /Cite each returned source at least once in answer with \[n\]/u);
  assert.match(prompt, /Return zero follow-ups whenever the answer is waiting for a pasted job description/u);
  assert.match(prompt, /Do not use inline code or backticks.*API names, commands, and other technical terms as plain text/u);
});

test("AskService observes refusal metadata retained from the raw ChatOpenAI stream", async (t) => {
  const environment = ["ASK_API_KEY", "ASK_API_BASE_URL", "ASK_MODEL"] as const;
  const previous = Object.fromEntries(environment.map((name) => [name, process.env[name]]));
  t.after(() => {
    for (const name of environment) {
      const value = previous[name];
      if (value === undefined) Reflect.deleteProperty(process.env, name); else process.env[name] = value;
    }
  });
  process.env.ASK_API_KEY = "fixture-key";
  process.env.ASK_API_BASE_URL = "https://provider.fixture/v1";
  process.env.ASK_MODEL = "fixture-model";
  t.mock.method(console, "error", () => undefined);
  t.mock.method(globalThis, "fetch", async () => {
    const answer = JSON.stringify({ answer: "Apparently valid", sourceIds: [], followUps: [] });
    const chunks = [
      { id: "chatcmpl-fixture", object: "chat.completion.chunk", created: 1, model: "fixture-model", choices: [{ index: 0, delta: { role: "assistant", content: answer, refusal: "Refused" }, finish_reason: null }] },
      { id: "chatcmpl-fixture", object: "chat.completion.chunk", created: 1, model: "fixture-model", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
    ];
    await Promise.resolve();
    return new Response(`${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`, {
      headers: { "content-type": "text/event-stream" },
    });
  });
  /**
   * Loads synthetic evidence while retaining raw refusal inspection.
   *
   * @param signal - Request lifecycle signal.
   * @returns One controlled source.
   */
  async function buildRefusalCorpus(signal: AbortSignal) {
    signal.throwIfAborted();
    await Promise.resolve();
    return [{ id: "home:about", title: "About", href: "/#about", text: "Synthetic evidence" }];
  }
  const response = await installedService({ buildCorpus: buildRefusalCorpus }).handle(createJsonRequest({ messages: [{ role: "user", content: "Question" }] }));
  const events = parseServerSentEvents(await response.text());
  assert.equal(events.at(-1)?.event, "error");
  assert.equal(events.some(({ event }) => event === "done"), false);
});

test("AskService cancels active GitHub work with the request and preserves loader fetch flags", async (t) => {
  configureFixtureProvider(t);
  t.mock.method(console, "warn", () => undefined);
  const requestController = new AbortController();
  let githubSignal: AbortSignal | undefined;
  let githubInit: RequestInit | undefined;
  let resolveStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    resolveStarted = resolve;
  });
  const githubFetch = t.mock.fn((_input: string, init: RequestInit) => {
    githubInit = init;
    githubSignal = init.signal instanceof AbortSignal ? init.signal : undefined;
    resolveStarted?.();
    return new Promise<Response>((_resolve, reject) => {
      githubSignal?.addEventListener("abort", () => {
        reject(githubSignal?.reason instanceof Error ? githubSignal.reason : new DOMException("Aborted", "AbortError"));
      }, { once: true });
    });
  });
  const providerFetch = t.mock.method(globalThis, "fetch", () => Promise.resolve(successfulProviderResponse()));
  const response = await installedService({ githubFetch, loadArticles: loadNoArticles, loadProjects: loadNoProjects }).handle(createJsonRequest({ messages: [{ role: "user", content: "Question" }] }, requestController.signal));
  const pendingBody = response.text();
  await started;

  requestController.abort(new DOMException("Visitor left", "AbortError"));
  await pendingBody;

  assert.equal(githubSignal?.aborted, true);
  assert.equal(githubFetch.mock.callCount(), 1);
  assert.ok(githubInit);
  assert.equal(githubInit.cache, "force-cache");
  assert.deepEqual(githubInit.next, { revalidate: 300 });
  assert.equal(providerFetch.mock.callCount(), 0);
});

test("AskService stops sequential GitHub work when the optional-data window closes", async (t) => {
  configureFixtureProvider(t);
  t.mock.method(console, "warn", () => undefined);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let githubSignal: AbortSignal | undefined;
  let resolveStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    resolveStarted = resolve;
  });
  const githubFetch = t.mock.fn((_input: string, init: RequestInit) => {
    githubSignal = init.signal instanceof AbortSignal ? init.signal : undefined;
    resolveStarted?.();
    return new Promise<Response>((_resolve, reject) => {
      githubSignal?.addEventListener("abort", () => {
        reject(githubSignal?.reason instanceof Error ? githubSignal.reason : new DOMException("Aborted", "AbortError"));
      }, { once: true });
    });
  });
  const providerFetch = t.mock.method(globalThis, "fetch", () => Promise.resolve(successfulProviderResponse()));
  const response = await installedService({ githubFetch, loadArticles: loadNoArticles, loadProjects: loadNoProjects }).handle(createJsonRequest({ messages: [{ role: "user", content: "Question" }] }));
  const pendingBody = response.text();
  await started;

  t.mock.timers.tick(5_000);

  const events = parseServerSentEvents(await pendingBody);
  assert.equal(githubSignal?.aborted, true);
  assert.equal(githubFetch.mock.callCount(), 1);
  assert.equal(providerFetch.mock.callCount(), 1);
  assert.equal(events.at(-1)?.event, "done");
});

test("AskService streams only decoded answer text and resolves terminal metadata", async () => {
  const raw = '{"answer":"Hello \\uD83D\\uDE00\\n**Nikita** [1]","sourceIds":["project:fixture"],"followUps":[{"label":"Role fit","question":"How does Nikita fit this role?"}]}';
  const fragments = [raw.slice(0, 17), raw.slice(17, 28), raw.slice(28, 49), raw.slice(49)];
  const response = await fixtureService(fixtureSession(fragments)).handle(createJsonRequest({ messages: [{ role: "user", content: "Question" }] }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/event-stream; charset=utf-8");
  const events = parseServerSentEvents(await response.text());
  assert.deepEqual(events[0], { event: "metadata", data: { mode: "live" } });
  assert.equal(events.filter(({ event }) => event === "delta")
    .map(({ data }) => (data as { text: string }).text).join(""), "Hello 😀\n**Nikita** [1]");
  assert.deepEqual(events.at(-1), { event: "done", data: {
      sources: [{ id: "project:fixture", title: "Fixture", href: "/projects/fixture" }],
      followUps: [{ label: "Role fit", question: "How does Nikita fit this role?" }],
  } });
});

test("AskService accepts reordered repeated citations and preserves source array order", async () => {
  for (const answer of [
    "Beta supports the first claim [1]. Alpha supports another [2], and Beta also supports this [1].",
    "Both sources support this claim [1][2].",
    "Repeated and reordered citations stay valid [2][1][2].",
    "Spaced citations also stay valid [1] [2].",
    "An unused trailing source does not invalidate the answer [1].",
    "An unused leading source must not shift this citation [2].",
    "Unused source metadata does not invalidate an answer without citations.",
  ]) {
    const raw = JSON.stringify({
      answer,
      sourceIds: ["article:beta", "project:alpha"],
      followUps: [],
    });
    const response = await fixtureService(fixtureSession([raw], { sources: [
        { id: "project:alpha", title: "Alpha", href: "/projects/alpha", text: "Alpha evidence" },
        { id: "article:beta", title: "Beta", href: "/articles/beta", text: "Beta evidence" },
      ] })).handle(createJsonRequest({ messages: [{ role: "user", content: "Question" }] }));
    assert.deepEqual(parseServerSentEvents(await response.text()).at(-1), {
      event: "done",
      data: {
        sources: [
          { id: "article:beta", title: "Beta", href: "/articles/beta" },
          { id: "project:alpha", title: "Alpha", href: "/projects/alpha" },
        ],
        followUps: [],
      },
    });
  }
});

test("AskService rejects out-of-range markers and unsupported citation syntax", async (t) => {
  const errorLog = t.mock.method(console, "error", () => undefined);
  const cases = [
    { answer: "Out of range [2].", sourceIds: ["project:fixture"] },
    { answer: "A leading zero is not canonical [01].", sourceIds: ["project:fixture"] },
    { answer: "A linked marker is unsupported [[1]](/projects/fixture).", sourceIds: ["project:fixture"] },
    { answer: "A direct linked marker is unsupported [1](/projects/fixture).", sourceIds: ["project:fixture"] },
    { answer: "A reference marker is unsupported [source [1]][fixture].", sourceIds: ["project:fixture"] },
    { answer: "A code marker is unsupported `[1]`.", sourceIds: ["project:fixture"] },
    { answer: "A reference link is unsupported [1][reference].", sourceIds: ["project:fixture"] },
    { answer: "A collapsed reference is unsupported [1][].", sourceIds: ["project:fixture"] },
    { answer: "A numeric image reference is unsupported ![1][1].", sourceIds: ["project:fixture"] },
    { answer: "A defined numeric reference is unsupported [1][1].\n\n[1]: /projects/fixture", sourceIds: ["project:fixture"] },
    ...[
      "Evidence [1]\n\n[1]: /projects/fixture",
      "~~~\n[1]\n~~~",
      "    [1]",
      "\t[1]",
      '<div title="[1]">Hidden citation</div>',
      "<!-- Hidden [1] -->",
    ].map((answer) => ({ answer, sourceIds: ["project:fixture"] })),
    { answer: "No sources may not cite [1].", sourceIds: [] },
  ];
  for (const result of cases) {
    const response = await fixtureService(fixtureSession([JSON.stringify({ ...result, followUps: [] })], { sources: [
        { id: "project:fixture", title: "Fixture", href: "/projects/fixture", text: "Evidence" },
        { id: "article:second", title: "Second", href: "/articles/second", text: "More evidence" },
      ] })).handle(createJsonRequest({ messages: [{ role: "user", content: "Question" }] }));
    const events = parseServerSentEvents(await response.text());
    assert.equal(events.at(-1)?.event, "error");
    assert.equal(events.some(({ event }) => event === "done"), false);
  }
  assert.equal(errorLog.mock.callCount(), cases.length);
});

test("AskService supports answer after other top-level fields without exposing raw JSON", async () => {
  const response = await fixtureService(fixtureSession(['{"sourceIds":[],"followUps":[],"answer":"Late answer"}'])).handle(createJsonRequest({ messages: [{ role: "user", content: "Question" }] }));
  assert.deepEqual(parseServerSentEvents(await response.text()), [
    { event: "metadata", data: { mode: "live" } },
    { event: "delta", data: { text: "Late answer" } },
    { event: "done", data: { sources: [], followUps: [] } },
  ]);
});

test("AskService degrades malformed optional follow-ups while preserving a valid answer", async () => {
  const invalidFollowUps = [
    [{ label: "x".repeat(25), question: "One" }, { label: "Two", question: "Two" }],
    [{ label: "Same", question: "Same" }, { label: "Same", question: "Same" }],
    [{ label: "", question: "Question" }],
  ];
  for (const followUps of invalidFollowUps) {
    const raw = JSON.stringify({ answer: "Answer", sourceIds: [], followUps });
    const response = await fixtureService(fixtureSession([raw])).handle(createJsonRequest({ messages: [{ role: "user", content: "Question" }] }));
    assert.deepEqual(parseServerSentEvents(await response.text()).at(-1), {
      event: "done", data: { sources: [], followUps: [] },
    });
  }
});

test("AskService rejects ambiguous, malformed, refused, truncated, and unsupported results", async (t) => {
  const errorLog = t.mock.method(console, "error", () => undefined);
  const cases: [string, FixtureOptions][] = [
    ['{"answer":"One","answer":"Two","sourceIds":[],"followUps":[]}', {}],
    ['{"answer":"Answer","sourceIds":[],"followUps":[],"extra":true}', {}],
    ['{"answer":"Answer","sourceIds":["project:unknown"],"followUps":[]}', {}],
    ['{"answer":"Answer","sourceIds":[],"followUps":[]', {}],
    ['{"answer":"Answer","sourceIds":[],"followUps":[]}', { finishReason: "length" }],
    ['{"answer":"Answer","sourceIds":[],"followUps":[]}', { finishReason: null }],
    ['{"answer":"Answer","sourceIds":[],"followUps":[]}', { refusal: "Cannot comply" }],
    ['{"answer":"\\uD800x","sourceIds":[],"followUps":[]}', {}],
    ['{"answer":"\\uDC00","sourceIds":[],"followUps":[]}', {}],
  ];
  for (const [raw, options] of cases) {
    const response = await fixtureService(fixtureSession([raw], options)).handle(createJsonRequest({ messages: [{ role: "user", content: "Question" }] }));
    const events = parseServerSentEvents(await response.text());
    assert.equal(events.at(-1)?.event, "error");
    assert.equal(events.some(({ event }) => event === "done"), false);
  }
  assert.equal(errorLog.mock.callCount(), cases.length);
  assert.deepEqual(errorLog.mock.calls[0]?.arguments, ["Portfolio Q&A generation failed.", "Provider returned invalid top-level fields"]);
});

test("AskService keeps maximum answer framing below the SSE cap with tiny provider chunks", async () => {
  const answer = "x".repeat(maxAskAssistantMessageLength);
  const raw = JSON.stringify({ answer, sourceIds: [], followUps: [] });
  const response = await fixtureService(fixtureSession(Array.from(raw))).handle(createJsonRequest({ messages: [{ role: "user", content: "Question" }] }));
  const payload = await response.text();
  const events = parseServerSentEvents(payload);
  assert.equal(Buffer.byteLength(payload, "utf8") < 512 * 1_024, true);
  assert.equal(events.filter(({ event }) => event === "delta").map(({ data }) => (data as { text: string }).text).join(""), answer);
  assert.equal(events.at(-1)?.event, "done");
});

test("AskService closes silently and returns the generator when the browser cancels", async () => {
  let returned = false;
  /**
   * Creates a generation stream that records iterator cleanup after cancellation.
   *
   * @param _input - Validated request unused by this fixture.
   * @param signal - Cancellation signal observed by the fixture.
   * @returns A controlled generation session.
   */
  const createSession = (_input: AskRequest, signal: AbortSignal) => Promise.resolve( (async function* () {
      try {
        yield { text: '{"answer":"Partial' };
        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => {
            resolve();
          }, { once: true });
        });
      } finally {
        returned = true;
      }
    })());
  const response = await fixtureService({ corpusService: {
      /** Supplies request-owned synthetic evidence.
       * @returns The controlled operation result.
       */ build: () => Promise.resolve([]) }, createProviderSession: createSession }).handle(createJsonRequest({ messages: [{ role: "user", content: "Question" }] }));
  assert.ok(response.body);
  const reader = response.body.getReader();
  await reader.read();
  const delta = await reader.read();
  assert.match(new TextDecoder().decode(delta.value), /Partial/u);
  await reader.cancel();
  assert.equal(returned, true);
});

test("AskService sanitizes generator failures and never logs provider details", async (t) => {
  const errorLog = t.mock.method(console, "error", () => undefined);
  const response = await fixtureService({
      corpusService: {
      /** Supplies request-owned synthetic evidence.
       * @returns The controlled operation result.
       */ build: () => Promise.resolve([]) },
      /** Supplies controlled provider chunks and records the validated request boundary.
       * @returns The controlled operation result.
       */ createProviderSession: () => Promise.resolve( (async function* () {
        await Promise.resolve();
        yield { text: '{"answer":"Partial' };
        throw new Error("provider secret response");
      })()),
    }).handle(createJsonRequest({ messages: [{ role: "user", content: "private visitor question" }] }));
  const events = parseServerSentEvents(await response.text());
  assert.equal(events.at(-1)?.event, "error");
  assert.deepEqual(errorLog.mock.calls[0]?.arguments, ["Portfolio Q&A generation failed."]);
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

/**
 * Composes real answer parsing with deterministic corpus, chunks and configuration.
 * @param dependencies - Synthetic source and provider operations.
 * @returns A configured request owner exercising the production answer parser.
 */
function fixtureService(dependencies: AskAnswerDependencies): AskService {
  return new AskService({
    /** Resolves the provider snapshot at the request validation boundary.
     * @returns The controlled operation result.
     */ resolveConfiguration: () => new AskConfiguration("fixture-key", "https://provider.fixture/v1", "fixture-model", 8192),
    answerService: new AskAnswerService(dependencies),
  });
}
