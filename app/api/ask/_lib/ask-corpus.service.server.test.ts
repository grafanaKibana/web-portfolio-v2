import assert from "node:assert/strict";
import test from "node:test";

import { AskCorpusService } from "./ask-corpus.service";
import type { AskCorpusDependencies } from "./ask.models";

/** Synthetic content independent of the current portfolio records. */
const portfolio: NonNullable<AskCorpusDependencies["portfolio"]> = {
  profile: {
    name: "Fixture", headline: "Fixture headline", summary: [], careerChapters: [], facts: [],
    experience: [], recommendations: [],
    education: { institution: "Fixture", qualification: "Fixture", period: "Fixture", location: "Fixture" },
    certifications: [], learning: [], skills: [], links: [],
  },
  home: {
    metadataDescription: "Fixture",
    mobileNavigation: { scrollThreshold: 1 },
    hero: {
      availability: { status: "Fixture", qualifier: "Fixture" }, title: "Fixture", lead: "Fixture",
      descriptors: [], descriptorInterval: 1, resumeHref: "https://fixture.test/resume",
    },
    projects: { featuredSlugs: [], indexDescription: "Fixture" },
    writing: { indexDescription: "Fixture" },
    codeActivity: { username: "fixture" },
    contact: { description: "Fixture", email: "fixture@example.test" },
    footer: { locale: "en", timeZone: "UTC" },
  },
};

test("canceling one corpus snapshot leaves the shared plugin fill available to another build", async () => {
  let resolveFill: ((links: { label: string; href: string }[]) => void) | undefined;
  const fill = new Promise<{ label: string; href: string }[]>((resolve) => { resolveFill = resolve; });
  let started = 0;
  let bothWaiting: (() => void) | undefined;
  const waiting = new Promise<void>((resolve) => { bothWaiting = resolve; });
  const corpus = new AskCorpusService({
    portfolio,
    /** Supplies an empty synthetic article collection.
     * @returns The controlled operation result.
     */ loadArticles: () => Promise.resolve([]),
    /** Supplies the synthetic project used by the snapshot test.
     * @returns The controlled operation result.
     */ loadProjects: () => Promise.resolve([{
      slug: "fixture", askText: "Fixture evidence",
      metadata: { kind: "project", title: "Fixture", description: "Fixture", links: [{ label: "Plugin", href: "https://fixture.test/plugin" }] },
      /** @returns No rendered fixture output. */
      Content: () => null,
    }]),
    /** Marks optional activity unavailable without network access.
     * @returns The controlled operation result.
     */ loadGitHubActivity: () => Promise.reject(new Error("Optional fixture activity unavailable")),
    /** Shares one controlled metadata fill across overlapping snapshots.
     * @param links - Authored project links awaiting metadata.
     * @returns The controlled operation result.
     */ resolvePluginLinks: (links) => {
      assert.deepEqual(links, [{ label: "Plugin", href: "https://fixture.test/plugin" }]);
      started += 1;
      if (started === 2) bothWaiting?.();
      return fill;
    },
  });
  const firstController = new AbortController();
  const secondController = new AbortController();
  const first = corpus.build(firstController.signal);
  const firstRejected = assert.rejects(first, { name: "AbortError" });
  const second = corpus.build(secondController.signal);
  await waiting;
  firstController.abort(new DOMException("First snapshot ended", "AbortError"));
  await firstRejected;
  assert.equal(secondController.signal.aborted, false);
  assert.ok(resolveFill);
  resolveFill([{ label: "Plugin · 42 downloads", href: "https://fixture.test/plugin" }]);
  const sources = await second;
  const project = sources.find(({ id }) => id === "project:fixture");
  assert.ok(project);
  const evidence = JSON.parse(project.liveText ?? "null") as { renderedLinks: unknown };
  assert.deepEqual(evidence.renderedLinks, [{ label: "Plugin · 42 downloads", href: "https://fixture.test/plugin" }]);
  assert.equal(started, 2);
});

test("curated evidence stays identical across time and optional metadata changes", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1_000 });
  let available = true;
  const corpus = new AskCorpusService({
    portfolio,
    /** @returns An empty synthetic article collection. */
    loadArticles: () => Promise.resolve([]),
    /** @returns A project whose authored link remains available without live metadata. */
    loadProjects: () => Promise.resolve([{
      slug: "fixture", askText: "Curated project evidence",
      metadata: { kind: "project", title: "Fixture", description: "Fixture", links: [{ label: "Plugin", href: "https://fixture.test/plugin" }] },
      /** @returns No rendered fixture output. */
      Content: () => null,
    }]),
    /** @returns Controlled activity availability. */
    loadGitHubActivity: () => available
      ? Promise.resolve({ pullRequestsAvailable: true, merged: [], underReview: [], draft: [], calendarAvailable: true, calendar: [] })
      : Promise.reject(new Error("Unavailable")),
    /** @returns Controlled live labels without changing authored content. */
    resolvePluginLinks: () => available
      ? Promise.resolve([{ label: "Plugin · 42 downloads", href: "https://fixture.test/plugin" }])
      : Promise.reject(new Error("Unavailable")),
  });
  const first = await corpus.build(new AbortController().signal);
  t.mock.timers.tick(1_000);
  const later = await corpus.build(new AbortController().signal);
  assert.deepEqual(later, first, "wall-clock time must not alter evidence");
  available = false;
  const unavailable = await corpus.build(new AbortController().signal);
  assert.deepEqual(unavailable.map(({ text }) => text), first.map(({ text }) => text));
  for (const sources of [first, unavailable]) {
    const project = sources.find(({ id }) => id === "project:fixture");
    assert.ok(project);
    assert.match(project.text, /Curated project evidence/u);
    assert.equal(Object.hasOwn(JSON.parse(project.text) as object, "renderedLinks"), false);
    assert.ok(project.liveText);
    assert.doesNotMatch(JSON.stringify(sources), /capturedAt/u);
  }
  const project = unavailable.find(({ id }) => id === "project:fixture");
  assert.deepEqual(JSON.parse(project?.liveText ?? "null"), { renderedLinks: { available: false } });
  const activity = unavailable.find(({ id }) => id === "home:code");
  assert.deepEqual(JSON.parse(activity?.liveText ?? "null"), { githubActivity: { available: false } });
});
