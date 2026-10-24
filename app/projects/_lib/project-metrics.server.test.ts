import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import type { ProjectMetricsOperations } from "./project-metrics.models";
import type { ProjectMetadata } from "@/lib/content/types";

const require = createRequire(import.meta.url);
const cache = require("next/cache") as typeof import("next/cache");
const originalCache = cache.unstable_cache;
cache.unstable_cache = ((operation: (...args: unknown[]) => Promise<unknown>) => operation) as typeof cache.unstable_cache;
const { ProjectMetricsService } = require("./project-metrics") as typeof import("./project-metrics");
cache.unstable_cache = originalCache;

/**
 * Creates a validated synthetic project with optional external metadata links.
 * @param slug - Fixture identity.
 * @param repository - Optional GitHub repository name.
 * @param plugin - Optional canonical store plugin ID.
 * @returns A synthetic project record.
 */
function project(slug: string, repository?: string, plugin?: string) {
  const metadata: ProjectMetadata = {
    kind: "project", title: slug, description: "Synthetic project",
    links: [
      ...(repository ? [{ label: "Source", href: `https://github.com/fixture/${repository}` }] : []),
      ...(plugin ? [{ label: "Store page", href: `https://obsidian.md/plugins?id=${plugin}` }] : []),
    ],
  };
  return { slug, metadata, extra: "retained" };
}

/**
 * Enriches fixtures using controlled transport at the production validation boundary.
 * @param projects - Synthetic records.
 * @param fetcher - Controlled transport.
 * @returns Enriched fixtures.
 */
async function enrichWithFetch(
  projects: ReturnType<typeof project>[],
  fetcher: (input: string, init: RequestInit) => Promise<Response>,
) {
  const original = globalThis.fetch;
  globalThis.fetch = fetcher as typeof fetch;
  try {
    return await new ProjectMetricsService().enrich(projects);
  } finally {
    globalThis.fetch = original;
  }
}

/**
 * Creates a remote JSON fixture response.
 * @param value - Synthetic response value.
 * @returns A JSON response.
 */
function json(value: unknown) {
  return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
}

test("sorts stars descending with stable ties, known zero before unknown and original fields retained", async () => {
  const projects = [project("unknown"), project("tie-a", "a"), project("zero", "zero"), project("high", "high"), project("tie-b", "b")];
  const operations: ProjectMetricsOperations = {
    /**
     * Looks up a controlled star count for a synthetic repository.
     * @param repository - Synthetic repository identity.
     * @returns Fixture stars.
     */
    loadStars: (repository) => Promise.resolve(({ "fixture/a": 7, "fixture/b": 7, "fixture/zero": 0, "fixture/high": 80 })[repository] ?? 0),
    /** @returns Unavailable fixture downloads. */
    loadDownloads: () => Promise.resolve(null),
  };
  const result = await new ProjectMetricsService(operations).enrich(projects);
  assert.deepEqual(result.map(({ slug }) => slug), ["high", "tie-a", "tie-b", "zero", "unknown"]);
  assert.equal(result[0]?.metadata, projects[3]?.metadata);
  assert.ok(result.every(({ extra }) => extra === "retained"));
  assert.equal(projects[0]?.slug, "unknown");
});

test("loads exact repository stars and canonical plugin downloads including zero independently", async () => {
  const requests: string[] = [];
  const result = await enrichWithFetch([project("plugin", "repo", "test-plugin")], (input, init) => {
    requests.push(input);
    assert.ok(init.signal);
    return Promise.resolve(input.includes("community-plugin-stats")
      ? json({ "test-plugin": { downloads: 0 } }) : json({ stargazers_count: 12 }));
  });
  assert.deepEqual(result[0]?.metrics, { stars: 12, downloads: 0 });
  assert.ok(requests.includes("https://api.github.com/repos/fixture/repo"));
  assert.equal(requests.length, 2);
});

test("invalid or failed stars preserve valid downloads", async () => {
  for (const count of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "12", null, undefined]) {
    const result = await enrichWithFetch([project("plugin", "repo", "test-plugin")], (input) => Promise.resolve(
      input.includes("community-plugin-stats") ? json({ "test-plugin": { downloads: 5 } }) : json({ stargazers_count: count })
    ));
    assert.deepEqual(result[0]?.metrics, { stars: null, downloads: 5 });
  }
  const result = await enrichWithFetch([project("plugin", "repo", "test-plugin")], (input) => {
    if (input.includes("community-plugin-stats")) return Promise.resolve(json({ "test-plugin": { downloads: 5 } }));
    return Promise.reject(new Error("Fixture network failure"));
  });
  assert.deepEqual(result[0]?.metrics, { stars: null, downloads: 5 });
});

test("invalid, absent and failed downloads preserve valid zero stars", async () => {
  for (const stats of [{ "test-plugin": { downloads: -1 } }, { other: { downloads: 8 } }, {}]) {
    const result = await enrichWithFetch([project("plugin", "repo", "test-plugin")], (input) => Promise.resolve(
      input.includes("community-plugin-stats") ? json(stats) : json({ stargazers_count: 0 })
    ));
    assert.deepEqual(result[0]?.metrics, { stars: 0, downloads: null });
  }
  const result = await enrichWithFetch([project("plugin", "repo", "test-plugin")], (input) => {
    if (input.includes("community-plugin-stats")) return Promise.reject(new Error("Fixture network failure"));
    return Promise.resolve(json({ stargazers_count: 0 }));
  });
  assert.deepEqual(result[0]?.metrics, { stars: 0, downloads: null });
});

test("missing metadata and noncanonical links do not trigger requests", async () => {
  const requests: string[] = [];
  const invalid = project("invalid");
  invalid.metadata.links = [
    { label: "Source", href: "https://github.com/fixture/repo/issues" },
    { label: "Store", href: "https://obsidian.md/plugins?id=test-plugin&extra=1" },
  ];
  const result = await enrichWithFetch([project("missing"), invalid], (input) => {
    requests.push(input);
    return Promise.reject(new Error("Unexpected fetch"));
  });
  assert.deepEqual(requests, []);
  assert.deepEqual(result.map(({ metrics }) => metrics), [{ stars: null, downloads: null }, { stars: null, downloads: null }]);
  assert.deepEqual(await new ProjectMetricsService().enrich([]), []);
});

test("deduplicates shared repository lookups within a list", async () => {
  let calls = 0;
  const result = await new ProjectMetricsService({
    /** @returns Shared fixture stars while recording calls. */
    loadStars: () => { calls += 1; return Promise.resolve(9); },
    /** @returns Unavailable fixture downloads. */
    loadDownloads: () => Promise.resolve(null),
  }).enrich([project("first", "shared"), project("second", "shared")]);
  assert.equal(calls, 1);
  assert.deepEqual(result.map(({ metrics }) => metrics.stars), [9, 9]);
});
