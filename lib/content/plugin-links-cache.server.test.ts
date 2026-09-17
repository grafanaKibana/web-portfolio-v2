import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);

test("production plugin caches retain boundaries across overlapping callers", async (t) => {
  const timeouts: number[] = [];
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal, "timeout", (milliseconds: number) => {
    timeouts.push(milliseconds);
    return timeout(milliseconds);
  });
  const registrations: Array<{ keys: string[]; revalidate: number }> = [];
  const cache = require("next/cache") as typeof import("next/cache");
  t.mock.method(cache, "unstable_cache", (
    callback: (...args: string[]) => Promise<unknown>, keys: string[], options: { revalidate: number },
  ) => {
    registrations.push({ keys, revalidate: options.revalidate });
    const pending = new Map<string, Promise<unknown>>();
    return (...args: string[]) => {
      const key = JSON.stringify(args);
      let result = pending.get(key);
      if (!result) {
        result = callback(...args);
        pending.set(key, result);
      }
      return result;
    };
  });
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => { finish = resolve; });
  const requests: Array<{ url: string; signal: AbortSignal | null | undefined }> = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    requests.push({ url, signal: init.signal });
    await gate;
    return Response.json(url.includes("community-plugin-stats")
      ? { "fixture-plugin": { downloads: 42 } }
      : { tag_name: "v1.2.3", draft: false, prerelease: false, published_at: "2026-01-01T00:00:00Z" });
  });
  const { PluginLinksService } = await import("./plugin-links");
  const service = new PluginLinksService();
  const input = [
    { label: "Store", href: "https://obsidian.md/plugins?id=fixture-plugin" },
    { label: "Source", href: "https://github.com/fixture/plugin" },
    { label: "Quartz source", href: "https://github.com/fixture/plugin" },
  ];
  const first = service.resolve(input);
  const second = new PluginLinksService().resolve(input);
  const caller = new AbortController();
  const stoppedWaiting = Promise.race([
    first,
    new Promise<null>((resolve) => { caller.signal.addEventListener("abort", () => { resolve(null); }, { once: true }); }),
  ]);
  caller.abort();
  assert.equal(await stoppedWaiting, null);
  assert.deepEqual(registrations, [
    { keys: ["plugin-download-counts-v2"], revalidate: 86_400 },
    { keys: ["plugin-repository-version-v1"], revalidate: 86_400 },
  ]);
  assert.equal(requests.length, 2);
  assert.deepEqual(timeouts, [5_000, 5_000]);
  assert.ok(requests.every(({ signal }) => signal instanceof AbortSignal && !signal.aborted));
  finish();
  for (const result of await Promise.all([first, second])) {
    assert.deepEqual(result.map(({ label }) => label), ["42 Downloads", "v1.2.3", "v1.2.3"]);
  }
  await new PluginLinksService().resolve(input);
  assert.equal(requests.length, 2);
  assert.equal(registrations.length, 2);
  let uncachedCalls = 0;
  const uncached = new PluginLinksService({
    /**
     * Supplies fixture counts.
     * @returns Synthetic plugin counts.
     */
    loadDownloadCounts: () => { uncachedCalls += 1; return Promise.resolve({ "fixture-plugin": 3 }); },
    /**
     * Supplies a fixture release.
     * @returns Synthetic version.
     */
    loadRepositoryVersion: () => Promise.resolve("v9.0.0"),
  });
  for (let index = 0; index < 2; index += 1) {
    assert.equal((await uncached.resolve(input))[0]?.label, "3 Downloads");
  }
  assert.equal(uncachedCalls, 2);
  assert.equal(requests.length, 2);
  assert.equal(registrations.length, 2);
});
