import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "./route";

/** Creates a JSON request for route integration tests.
 * @param body - Request payload to serialize.
 * @returns A request with the endpoint media type.
 */
function createJsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/ask", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

test("POST accepts the live request contract and reports missing operator configuration", async (t) => {
  const previousKey = process.env.ASK_API_KEY;
  delete process.env.ASK_API_KEY;
  t.after(() => {
    if (previousKey === undefined) delete process.env.ASK_API_KEY;
    else process.env.ASK_API_KEY = previousKey;
  });
  const response = await POST(createJsonRequest({
    context: { pathname: "/projects/fixture-project", record: { kind: "project", slug: "fixture-project" } },
    messages: [
      { content: "What does this project do?", role: "user" },
      { content: "It demonstrates a fixture capability.", role: "assistant" },
      { content: "How does it work?", role: "user" },
    ],
  }));

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { error: "Ask AI provider configuration is missing or invalid." });
});

test("POST maps public request errors to uncached JSON responses", async () => {
  const response = await POST(new Request("http://localhost/api/ask", {
    body: JSON.stringify({ messages: [{ content: "Hello", role: "user" }] }),
    headers: { "content-type": "text/plain" },
    method: "POST",
  }));

  assert.equal(response.status, 415);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { error: "Send the request as application/json." });
});

test("POST propagates unexpected request stream failures", async () => {
  const failure = new Error("request stream failed");
  const body = new ReadableStream<Uint8Array>({
    /** Fails the request body before JSON parsing can begin.
     * @param controller - Request body stream controller.
     */
    start(controller) {
      controller.error(failure);
    },
  });
  const request = new Request("http://localhost/api/ask", {
    body,
    duplex: "half",
    headers: { "content-type": "application/json" },
    method: "POST",
  } as RequestInit & { duplex: "half" });

  await assert.rejects(POST(request), (error) => error === failure);
});
