import { expect, test } from "@playwright/test";

test("the question endpoint validates requests before provider configuration", async ({ request }) => {
  const unsupported = await request.get("/api/ask");
  expect(unsupported.status()).toBe(405);

  const wrongMediaType = await request.post("/api/ask", {
    data: "Describe the available information.",
    headers: { "Content-Type": "text/plain" },
  });
  expect(wrongMediaType.status()).toBe(415);

  const oversized = await request.post("/api/ask", {
    data: { messages: [{ role: "user", content: "x".repeat(12_001) }] },
  });
  expect(oversized.status()).toBe(400);
  expect(await oversized.json()).toEqual({
    error: "Messages must alternate user and assistant and stay within their size limits.",
  });
});
