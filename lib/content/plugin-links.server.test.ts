import assert from "node:assert/strict";
import test from "node:test";

import { resolvePluginLinks } from "./plugin-links";

const storeHref = "https://obsidian.md/plugins?id=fixture-plugin";
const primarySourceHref = "https://github.com/fixture-owner/plugin-repository";
const companionSourceHref = "https://github.com/fixture-owner/companion-repository";

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
    { label: "Obsidian source", href: primarySourceHref },
    { label: "Quartz source", href: companionSourceHref },
  ], (input, init) => {
    requested.push(input);
    assert.ok(init.signal);
    if (input.includes("community-plugin-stats")) {
      return Promise.resolve(jsonResponse({
        "fixture-plugin": { downloads: 12_345 },
        "unused-plugin": { downloads: 987 },
        "Legacy_Plugin.ID": { downloads: 5 },
      }));
    }
    if (input.includes("plugin-repository")) {
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
      href: primarySourceHref,
      ariaLabel: "v1.4.3 — Obsidian source",
    },
    {
      label: "0.3.0",
      href: companionSourceHref,
      ariaLabel: "0.3.0 — Quartz source",
    },
  ]);
  assert.equal(requested.filter((url) => url.includes("community-plugin-stats")).length, 1);
  assert.equal(requested.filter((url) => url.includes("/releases/latest")).length, 2);
});

test("preserves each original label when its remote value is unavailable", async () => {
  const links = await resolvePluginLinks([
    { label: "Store page", href: storeHref },
    { label: "Obsidian source", href: primarySourceHref },
    { label: "Quartz source", href: companionSourceHref },
  ], (input) => {
    if (input.includes("community-plugin-stats")) {
      return Promise.resolve(jsonResponse({ "fixture-plugin": { downloads: "many" } }));
    }
    if (input.includes("plugin-repository")) {
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
    { label: "Obsidian source", href: primarySourceHref },
    {
      label: "0.3.0",
      href: companionSourceHref,
      ariaLabel: "0.3.0 — Quartz source",
    },
  ]);
});

test("resolves another plugin ID and accepts zero downloads", async () => {
  const otherStoreHref = "https://obsidian.md/plugins?id=other-plugin";
  const otherSourceHref = "https://github.com/fixture-owner/other-repository";
  const links = await resolvePluginLinks([
    { label: "Store page", href: otherStoreHref },
    { label: "Source", href: otherSourceHref },
  ], (input) => {
    if (input.includes("community-plugin-stats")) {
      return Promise.resolve(jsonResponse({
        "fixture-plugin": { downloads: 99 },
        "other-plugin": { downloads: 0 },
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
      href: otherStoreHref,
      ariaLabel: "0 Downloads — Store page",
    },
    {
      label: "2.0.0",
      href: otherSourceHref,
      ariaLabel: "2.0.0 — Source",
    },
  ]);
});

test("rejects invalid download count boundaries", async () => {
  for (const downloads of [-1, Number.NaN, "12"]) {
    const links = await resolvePluginLinks([
      { label: "Store page", href: storeHref },
    ], () => Promise.resolve(jsonResponse({ "fixture-plugin": { downloads } })));
    assert.deepEqual(links, [{ label: "Store page", href: storeHref }]);
  }
});

test("rejects an invalid statistics map and falls back when its plugin ID is absent", async () => {
  const invalidMap = await resolvePluginLinks([
    { label: "Store page", href: storeHref },
  ], () => Promise.resolve(jsonResponse({
    "fixture-plugin": { downloads: 12_345 },
    broken: { downloads: -1 },
  })));
  const missingPlugin = await resolvePluginLinks([
    { label: "Store page", href: storeHref },
  ], () => Promise.resolve(jsonResponse({
    "other-plugin": { downloads: 100 },
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
    { label: "Obsidian source", href: primarySourceHref },
    { label: "Quartz source", href: companionSourceHref },
  ], (input) => {
    if (input.includes("community-plugin-stats")) {
      return Promise.resolve(jsonResponse({ error: "unavailable" }, 503));
    }
    if (input.includes("plugin-repository")) {
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
    { label: "Obsidian source", href: primarySourceHref },
    { label: "Quartz source", href: companionSourceHref },
  ]);
});

test("keeps non-plugin projects and unrelated links unchanged without fetching", async () => {
  let requests = 0;
  const original = [
    { label: "Source", href: "https://github.com/fixture-owner/unrelated-repository" },
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
    { label: "Store page", href: "https://obsidian.md/plugins?id=fixture-plugin&ref=fixture" },
    { label: "Source", href: `${primarySourceHref}/releases` },
  ] as const;
  const resolved = await resolvePluginLinks(links, () => {
    requests += 1;
    return Promise.reject(new Error("unexpected request"));
  });

  assert.equal(resolved, links);
  assert.equal(requests, 0);
});
