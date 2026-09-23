import { expect, test } from "@playwright/test";

test("the built question endpoint rejects invalid requests before provider work", async ({ request }) => {
  const responses = await Promise.all([
    request.get("/api/ask"),
    request.post("/api/ask", { data: "Synthetic question", headers: { "Content-Type": "text/plain" } }),
    request.post("/api/ask", { data: { messages: "invalid" } }),
    request.post("/api/ask", { data: { messages: [{ role: "user", content: "x".repeat(12_001) }] } }),
  ]);
  expect(responses.map((response) => response.status())).toEqual([405, 415, 400, 400]);
});
