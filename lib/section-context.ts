import type { AskContext, AskContextRecord } from "./ask.contract";

const recordSelector = "[data-ask-record-kind][data-ask-record-slug]";
/** Ordered Home sections supplied as compact question context. */
export const askSectionIds = [
  "about",
  "experience",
  "education",
  "skills",
  "projects",
  "code",
  "writing",
  "contact",
] as const;

/**
 * Returns the sticky header's lower viewport boundary.
 *
 * @returns Header boundary in viewport pixels.
 */
function getHeaderBottom(): number {
  return document.querySelector<HTMLElement>('[data-slot="site-header"]')
    ?.getBoundingClientRect().bottom ?? 0;
}

/** Finds the latest section that has reached the sticky header boundary.
 * @param sectionIds - Ordered document section identifiers.
 * @returns The active section identifier, when a known section has been reached.
 */
export function getVisibleSectionId(sectionIds: readonly string[]): string | undefined {
  const sections = sectionIds
    .map((id) => document.getElementById(id))
    .filter((section): section is HTMLElement => section !== null);
  const headerBottom = getHeaderBottom();
  let reachedSection: HTMLElement | undefined;
  for (const section of sections) {
    if (section.getBoundingClientRect().top > headerBottom + 1) break;
    reachedSection = section;
  }
  if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1) {
    reachedSection = sections.at(-1);
  }
  return reachedSection?.id;
}

/** Reads one record only when exactly one marked portfolio record is visible.
 * @returns The unambiguous visible project or article identity.
 */
function getVisibleRecord(): AskContextRecord | undefined {
  const headerBottom = getHeaderBottom();
  const visible = Array.from(document.querySelectorAll<HTMLElement>(recordSelector))
    .filter((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.bottom > headerBottom && bounds.top < window.innerHeight;
    });
  if (visible.length !== 1) return undefined;

  const element = visible[0];
  const kind = element?.dataset.askRecordKind;
  const slug = element?.dataset.askRecordSlug;
  if ((kind !== "project" && kind !== "article") || !slug) return undefined;
  return { kind, slug };
}

/** Captures compact browser location hints without scraping page text.
 * @param pathname - Current Next.js route pathname.
 * @param sectionIds - Ordered Home section identifiers.
 * @returns A request context snapshot for one submitted question.
 */
export function captureAskContext(pathname: string, sectionIds: readonly string[]): AskContext {
  const context: AskContext = { pathname };
  if (pathname === "/") {
    const sectionId = getVisibleSectionId(sectionIds);
    const record = getVisibleRecord();
    if (sectionId) context.sectionId = sectionId;
    if (record) context.record = record;
    return context;
  }

  let collectionKind: "project" | "article" | undefined;
  if (pathname === "/projects") {
    collectionKind = "project";
  } else if (pathname === "/articles") {
    collectionKind = "article";
  }
  if (collectionKind) {
    const record = getVisibleRecord();
    if (record?.kind === collectionKind) context.record = record;
    return context;
  }

  const match = /^\/(projects|articles)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/u.exec(pathname);
  if (match?.[1] && match[2]) {
    context.record = {
      kind: match[1] === "projects" ? "project" : "article",
      slug: match[2],
    };
  }
  return context;
}
