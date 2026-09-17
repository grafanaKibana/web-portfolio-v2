import assert from "node:assert/strict";
import test from "node:test";

import { AskService } from "./ask.service";
import { AskAnswerService } from "./ask-answer.service";
import { AskConfiguration } from "./ask.config";
import { AskRequestError } from "./ask.errors";
import type { AskDependencies, ProviderChunk } from "./ask.models";

type ServerSentEvent = { data: unknown; event: string };

/**
 * Creates one JSON POST request for the Ask endpoint.
 * @param body - Request payload to serialize.
 * @param signal - Optional request cancellation signal.
 * @returns A JSON request for the endpoint.
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
 * Parses complete SSE frames emitted by the Ask endpoint.
 * @param payload - Serialized event stream.
 * @returns Parsed event names and data.
 */
function parseEvents(payload: string): ServerSentEvent[] {
  return payload.trim().split(/\r?\n\r?\n/u).filter(Boolean).map((block) => {
    const lines = block.split(/\r?\n/u);
    const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
    const data = lines.find((line) => line.startsWith("data:"))?.slice(5).trim();
    assert.ok(event, `missing event name in ${block}`);
    assert.ok(data, `missing event data in ${block}`);
    return { data: JSON.parse(data) as unknown, event };
  });
}

/** @returns A valid immutable provider snapshot without reading the environment. */
function fixtureConfiguration(): AskConfiguration {
  return new AskConfiguration("fixture-key", "https://provider.fixture/v1", "fixture-model", 8192);
}

test("shared answer service keeps interleaved response output and cancellation isolated", async () => {
  const firstController = new AbortController();
  let firstStarted: (() => void) | undefined;
  const firstStartedPromise = new Promise<void>((resolve) => { firstStarted = resolve; });
  const sources = [
    { id: "project:first", title: "First", href: "/projects/first", text: "First evidence" },
    { id: "project:second", title: "Second", href: "/projects/second", text: "Second evidence" },
  ];
  let builds = 0;
  const answerService = new AskAnswerService({
    corpusService: {
      /** Supplies request-owned synthetic evidence.
       * @returns The controlled operation result.
       */ build: () => {
      const source = sources[builds++];
      assert.ok(source);
      return Promise.resolve([source]);
    } },
    /** Supplies controlled provider chunks and records the validated request boundary.
     * @param input - Validated conversation input.
     * @param signal - Request lifecycle cancellation signal.
     * @param configuration - Resolved provider configuration.
     * @param catalog - Server-owned source allowlist.
     * @returns The controlled operation result.
     */ createProviderSession: (input, signal, configuration, catalog) => {
      assert.equal(configuration.model, "fixture-model");
      const first = input.messages[0]?.content === "First question";
      assert.equal(catalog[0]?.id, first ? "project:first" : "project:second");
      return Promise.resolve((async function* (): AsyncGenerator<ProviderChunk> {
        if (first) {
          yield { text: '{"answer":"First partial' };
          firstStarted?.();
          await new Promise<never>((_resolve, reject) => {
            signal.addEventListener("abort", () => { reject(signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError")); }, { once: true });
          });
        } else {
          yield { text: '{"answer":"Second answer [1]",' };
          yield { text: '"sourceIds":["project:second"],"followUps":[]}', finishReason: "stop" };
        }
      })());
    },
  });
  const dependencies = { resolveConfiguration: fixtureConfiguration, answerService };
  const first = await new AskService(dependencies).handle(
    createJsonRequest({ messages: [{ content: "First question", role: "user" }] }, firstController.signal),
  );
  const firstBody = first.text();
  await firstStartedPromise;
  const second = await new AskService(dependencies).handle(
    createJsonRequest({ messages: [{ content: "Second question", role: "user" }] }),
  );
  const secondBody = second.text();
  firstController.abort(new DOMException("First visitor left", "AbortError"));
  const secondEvents = parseEvents(await secondBody);
  const firstEvents = parseEvents(await firstBody);
  assert.deepEqual(secondEvents, [
    { data: { mode: "live" }, event: "metadata" },
    { data: { text: "Second answer [1]" }, event: "delta" },
    { data: { followUps: [], sources: [{ id: "project:second", title: "Second", href: "/projects/second" }] }, event: "done" },
  ]);
  assert.deepEqual(firstEvents, [
    { data: { mode: "live" }, event: "metadata" },
    { data: { text: "First partial" }, event: "delta" },
  ]);
});

test("AskService validates a malformed request before checking missing provider configuration", async (t) => {
  const names = ["ASK_API_KEY", "LANGCHAIN_TRACING", "LANGCHAIN_TRACING_V2", "LANGCHAIN_VERBOSE", "LANGSMITH_TRACING", "LANGSMITH_TRACING_V2"] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  t.after(() => {
    for (const name of names) {
      const value = previous[name];
      if (value === undefined) Reflect.deleteProperty(process.env, name); else process.env[name] = value;
    }
  });
  for (const name of names) Reflect.deleteProperty(process.env, name);

  const service = new AskService({
    /** Resolves the provider snapshot at the request validation boundary.
     * @returns The controlled operation result.
     */ resolveConfiguration: () => AskConfiguration.fromEnvironment(),
    answerService: {
      /** Fails if generation starts before configuration validation succeeds.
       */ stream: () => { throw new Error("Provider must not start"); } },
  });
  const malformed = await service.handle(new Request("http://localhost/api/ask", {
    body: "{",
    headers: { "content-type": "application/json" },
    method: "POST",
  }));
  const configured = await service.handle(createJsonRequest({ messages: [{ content: "Question", role: "user" }] }));

  assert.deepEqual(await malformed.json(), { error: "Request body must contain valid UTF-8 JSON." });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await configured.json(), { error: "Ask AI provider configuration is missing or invalid." });
  assert.equal(configured.status, 503);
});

test("AskService resolves configuration exactly once after validation and passes the same snapshot to the provider", async () => {
  const configuration = fixtureConfiguration();
  let resolutions = 0;
  let generations = 0;
  const dependencies: AskDependencies = {
    /** Resolves the provider snapshot at the request validation boundary.
     * @returns The controlled operation result.
     */ resolveConfiguration: () => { resolutions += 1; return configuration; },
    answerService: new AskAnswerService({
      corpusService: {
      /** Supplies request-owned synthetic evidence.
       * @returns The controlled operation result.
       */ build: () => Promise.resolve([]) },
      /** Supplies controlled provider chunks and records the validated request boundary.
       * @param _input - Validated conversation input unused by this fixture.
       * @param _signal - Request signal unused by this fixture.
       * @param resolved - Resolved provider configuration.
       * @param sources - Server-owned source allowlist.
       * @returns The controlled operation result.
       */ createProviderSession: (_input, _signal, resolved, sources) => {
        generations += 1;
        assert.equal(resolved, configuration);
        assert.deepEqual(sources, []);
        return Promise.resolve((async function* () {
          await Promise.resolve();
          yield { text: '{"answer":"Answer","sourceIds":[],"followUps":[]}', finishReason: "stop" };
        })());
      },
    }),
  };
  const service = new AskService(dependencies);
  assert.equal(resolutions, 0);
  const invalid = await service.handle(createJsonRequest({ messages: [] }));
  assert.equal(invalid.status, 400);
  assert.equal(resolutions, 0);
  const valid = await service.handle(createJsonRequest({ messages: [{ role: "user", content: "Question" }] }));
  assert.equal(resolutions, 1);
  assert.equal(parseEvents(await valid.text()).at(-1)?.event, "done");
  assert.equal(resolutions, 1);
  assert.equal(generations, 1);
});

test("controlled provider injection cannot bypass a failing configuration resolver", async () => {
  let generations = 0;
  const service = new AskService({
    /** Resolves the provider snapshot at the request validation boundary.
     * @throws A safe missing-configuration error.
     */ resolveConfiguration: () => { throw new AskRequestError(503, "Ask AI provider configuration is missing or invalid."); },
    answerService: new AskAnswerService({
      corpusService: {
      /** Supplies request-owned synthetic evidence.
       * @returns The controlled operation result.
       */ build: () => Promise.resolve([]) },
      /** Supplies controlled provider chunks and records the validated request boundary.
       * @throws If generation starts before configuration validation.
       */ createProviderSession: () => { generations += 1; throw new Error("Must not start"); },
    }),
  });
  const response = await service.handle(createJsonRequest({ messages: [{ role: "user", content: "Question" }] }));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("content-type") ?? "", /application\/json/u);
  assert.deepEqual(await response.json(), { error: "Ask AI provider configuration is missing or invalid." });
  assert.equal(generations, 0);
});
