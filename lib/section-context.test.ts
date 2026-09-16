import assert from "node:assert/strict";
import test from "node:test";

import { askSectionIds, captureAskContext, getVisibleSectionId } from "./section-context";

interface ElementFixture {
  bottom: number;
  id: string;
  kind?: "project" | "article";
  slug?: string;
  top: number;
}

/** Installs the minimum browser geometry used by the context helper.
 * @param sections - Ordered section geometry.
 * @param records - Marked record geometry.
 * @returns A cleanup callback that restores the Node globals.
 */
function installBrowserFixture(
  sections: readonly ElementFixture[],
  records: readonly ElementFixture[] = [],
): () => void {
  const priorDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  /** Creates the DOM subset read by the production helper.
   * @param fixture - Element geometry and data attributes.
   * @returns A structural HTMLElement fixture.
   */
  function element(fixture: ElementFixture) {
    return {
      dataset: { askRecordKind: fixture.kind, askRecordSlug: fixture.slug },
      /**
       * Returns the fixture's visible vertical bounds.
       *
       * @returns Synthetic element bounds.
       */
      getBoundingClientRect: () => ({ bottom: fixture.bottom, top: fixture.top }),
      id: fixture.id,
    };
  }
  const sectionElements = new Map(sections.map((fixture) => [fixture.id, element(fixture)]));
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      documentElement: { scrollHeight: 2_000 },
      /**
       * Resolves one synthetic Home section by ID.
       *
       * @param id - Requested section identifier.
       * @returns Matching fixture element, when present.
       */
      getElementById: (id: string) => sectionElements.get(id) ?? null,
      /**
       * Returns the synthetic sticky site header.
       *
       * @returns Structural sticky-header fixture.
       */
      querySelector: () => ({
        /**
         * Returns the sticky header's lower boundary.
         *
         * @returns Synthetic header bounds.
         */
        getBoundingClientRect: () => ({ bottom: 64 }),
      }),
      /**
       * Returns all synthetic marked portfolio records.
       *
       * @returns Structural record fixtures.
       */
      querySelectorAll: () => records.map(element),
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { innerHeight: 800, scrollY: 400 },
  });
  return () => {
    if (priorDocument) Object.defineProperty(globalThis, "document", priorDocument);
    else Reflect.deleteProperty(globalThis, "document");
    if (priorWindow) Object.defineProperty(globalThis, "window", priorWindow);
    else Reflect.deleteProperty(globalThis, "window");
  };
}

test("getVisibleSectionId uses the shared sticky-header boundary", () => {
  const restore = installBrowserFixture([
    { bottom: 60, id: "about", top: -200 },
    { bottom: 900, id: "experience", top: 64 },
    { bottom: 1_600, id: "projects", top: 900 },
  ]);
  try {
    assert.equal(getVisibleSectionId(["about", "experience", "projects"]), "experience");
  } finally {
    restore();
  }
});

test("captureAskContext includes one visible record and omits ambiguous records", () => {
  const sections = [{ bottom: 1_200, id: "projects", top: 0 }];
  let restore = installBrowserFixture(sections, [
    { bottom: 600, id: "fixture", kind: "project", slug: "fixture", top: 100 },
  ]);
  try {
    assert.deepEqual(captureAskContext("/", askSectionIds), {
      pathname: "/",
      sectionId: "projects",
      record: { kind: "project", slug: "fixture" },
    });
  } finally {
    restore();
  }

  restore = installBrowserFixture(sections, [
    { bottom: 400, id: "one", kind: "project", slug: "one", top: 100 },
    { bottom: 700, id: "two", kind: "project", slug: "two", top: 350 },
  ]);
  try {
    assert.deepEqual(captureAskContext("/", askSectionIds), {
      pathname: "/",
      sectionId: "projects",
    });
  } finally {
    restore();
  }
});

test("captureAskContext derives detail-route record identity from the pathname", () => {
  assert.deepEqual(captureAskContext("/articles/fixture-article", askSectionIds), {
    pathname: "/articles/fixture-article",
    record: { kind: "article", slug: "fixture-article" },
  });
});

test("captureAskContext includes one matching record on collection pages", () => {
  let restore = installBrowserFixture([], [
    { bottom: 600, id: "project", kind: "project", slug: "project", top: 100 },
  ]);
  try {
    assert.deepEqual(captureAskContext("/projects", askSectionIds), {
      pathname: "/projects",
      record: { kind: "project", slug: "project" },
    });
    assert.deepEqual(captureAskContext("/articles", askSectionIds), { pathname: "/articles" });
  } finally {
    restore();
  }

  restore = installBrowserFixture([], [
    { bottom: 400, id: "one", kind: "article", slug: "one", top: 100 },
    { bottom: 700, id: "two", kind: "article", slug: "two", top: 350 },
  ]);
  try {
    assert.deepEqual(captureAskContext("/articles", askSectionIds), { pathname: "/articles" });
  } finally {
    restore();
  }
});
