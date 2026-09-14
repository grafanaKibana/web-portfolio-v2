import assert from "node:assert/strict";
import test from "node:test";

import { resolvePluginLinks } from "../content/plugin-links";

const storeHref = "https://obsidian.md/plugins?id=tabsdown";
const obsidianHref = "https://github.com/grafanaKibana/obsidian-tabsdown";
const quartzHref = "https://github.com/grafanaKibana/quartz-tabsdown";

/**
 * Creates a JSON response for a focused remote-loader test.
 *
 * @param value - Response JSON value.
 * @param status - HTTP status code.
 * @returns A JSON response.
 */
function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("resolves downloads and each source repository independently", async () => {
  const requested: string[] = [];
  const links = await resolvePluginLinks([
    { label: "Store page", href: storeHref },
    { label: "Obsidian source", href: obsidianHref },
    { label: "Quartz source", href: quartzHref },
  ], (input, init) => {
    requested.push(input);
    assert.ok(init.signal);
    if (input.includes("community-plugin-stats")) {
      return Promise.resolve(jsonResponse({
        tabsdown: { downloads: 12_345 },
        colsdown: { downloads: 987 },
        "Legacy_Plugin.ID": { downloads: 5 },
      }));
    }
    if (input.includes("obsidian-tabsdown")) {
      return Promise.resolve(jsonResponse({
        tag_name: "v1.4.3",
        draft: false,
        prerelease: false,
        published_at: "2026-09-12T10:00:00Z",
      }));
    }
    return Promise.resolve(jsonResponse({
      tag_name: "0.3.0",
      draft: false,
      prerelease: false,
      published_at: "2026-09-11T10:00:00Z",
    }));
  });

  assert.deepEqual(links, [
    {
      label: "12,345 Downloads",
      href: storeHref,
      ariaLabel: "12,345 Downloads — Store page",
    },
    {
      label: "v1.4.3",
      href: obsidianHref,
      ariaLabel: "v1.4.3 — Obsidian source",
    },
    {
      label: "0.3.0",
      href: quartzHref,
      ariaLabel: "0.3.0 — Quartz source",
    },
  ]);
  assert.equal(requested.filter((url) => url.includes("community-plugin-stats")).length, 1);
  assert.equal(requested.filter((url) => url.includes("/releases/latest")).length, 2);
});

test("preserves each original label when its remote value is unavailable", async () => {
  const links = await resolvePluginLinks([
    { label: "Store page", href: storeHref },
    { label: "Obsidian source", href: obsidianHref },
    { label: "Quartz source", href: quartzHref },
  ], (input) => {
    if (input.includes("community-plugin-stats")) {
      return Promise.resolve(jsonResponse({ tabsdown: { downloads: "many" } }));
    }
    if (input.includes("obsidian-tabsdown")) {
      return Promise.resolve(jsonResponse({
        tag_name: "v1.4.3-beta.1",
        draft: false,
        prerelease: true,
        published_at: "2026-09-12T10:00:00Z",
      }));
    }
    return Promise.resolve(jsonResponse({
      tag_name: "0.3.0",
      draft: false,
      prerelease: false,
      published_at: "2026-09-11T10:00:00Z",
    }));
  });

  assert.deepEqual(links, [
    { label: "Store page", href: storeHref },
    { label: "Obsidian source", href: obsidianHref },
    {
      label: "0.3.0",
      href: quartzHref,
      ariaLabel: "0.3.0 — Quartz source",
    },
  ]);
});

test("resolves another plugin ID and accepts zero downloads", async () => {
  const colsdownStoreHref = "https://obsidian.md/plugins?id=colsdown";
  const colsdownSourceHref = "https://github.com/grafanaKibana/obsidian-colsdown";
  const links = await resolvePluginLinks([
    { label: "Store page", href: colsdownStoreHref },
    { label: "Source", href: colsdownSourceHref },
  ], (input) => {
    if (input.includes("community-plugin-stats")) {
      return Promise.resolve(jsonResponse({
        tabsdown: { downloads: 99 },
        colsdown: { downloads: 0 },
      }));
    }
    return Promise.resolve(jsonResponse({
      tag_name: "2.0.0",
      draft: false,
      prerelease: false,
      published_at: "2026-09-10T10:00:00Z",
    }));
  });

  assert.deepEqual(links, [
    {
      label: "0 Downloads",
      href: colsdownStoreHref,
      ariaLabel: "0 Downloads — Store page",
    },
    {
      label: "2.0.0",
      href: colsdownSourceHref,
      ariaLabel: "2.0.0 — Source",
    },
  ]);
});

test("rejects invalid download count boundaries", async () => {
  for (const downloads of [-1, Number.NaN, "12"]) {
    const links = await resolvePluginLinks([
      { label: "Store page", href: storeHref },
    ], () => Promise.resolve(jsonResponse({ tabsdown: { downloads } })));
    assert.deepEqual(links, [{ label: "Store page", href: storeHref }]);
  }
});

test("rejects an invalid statistics map and falls back when its plugin ID is absent", async () => {
  const invalidMap = await resolvePluginLinks([
    { label: "Store page", href: storeHref },
  ], () => Promise.resolve(jsonResponse({
    tabsdown: { downloads: 12_345 },
    broken: { downloads: -1 },
  })));
  const missingPlugin = await resolvePluginLinks([
    { label: "Store page", href: storeHref },
  ], () => Promise.resolve(jsonResponse({
    colsdown: { downloads: 100 },
  })));
  const emptyMap = await resolvePluginLinks([
    { label: "Store page", href: storeHref },
  ], () => Promise.resolve(jsonResponse({})));

  assert.deepEqual(invalidMap, [{ label: "Store page", href: storeHref }]);
  assert.deepEqual(missingPlugin, [{ label: "Store page", href: storeHref }]);
  assert.deepEqual(emptyMap, [{ label: "Store page", href: storeHref }]);
});

test("contains HTTP, network, and malformed release failures per link", async () => {
  const links = await resolvePluginLinks([
    { label: "Store page", href: storeHref },
    { label: "Obsidian source", href: obsidianHref },
    { label: "Quartz source", href: quartzHref },
  ], (input) => {
    if (input.includes("community-plugin-stats")) {
      return Promise.resolve(jsonResponse({ error: "unavailable" }, 503));
    }
    if (input.includes("obsidian-tabsdown")) {
      return Promise.reject(new TypeError("network unavailable"));
    }
    return Promise.resolve(jsonResponse({
      tag_name: "0.3.0",
      draft: false,
      prerelease: false,
      published_at: "not-a-date",
    }));
  });

  assert.deepEqual(links, [
    { label: "Store page", href: storeHref },
    { label: "Obsidian source", href: obsidianHref },
    { label: "Quartz source", href: quartzHref },
  ]);
});

test("keeps non-plugin projects and unrelated links unchanged without fetching", async () => {
  let requests = 0;
  const original = [
    { label: "Source", href: "https://github.com/grafanaKibana/example" },
    { label: "Website", href: "https://example.com" },
  ] as const;
  const links = await resolvePluginLinks(original, () => {
    requests += 1;
    return Promise.reject(new Error("unexpected request"));
  });

  assert.equal(links, original);
  assert.equal(requests, 0);
  assert.deepEqual(await resolvePluginLinks(undefined), []);
});

test("requires exact plugin and repository URLs", async () => {
  let requests = 0;
  const links = [
    { label: "Store page", href: "https://obsidian.md/plugins?id=tabsdown&ref=portfolio" },
    { label: "Source", href: `${obsidianHref}/releases` },
  ] as const;
  const resolved = await resolvePluginLinks(links, () => {
    requests += 1;
    return Promise.reject(new Error("unexpected request"));
  });

  assert.equal(resolved, links);
  assert.equal(requests, 0);
});
