import "server-only";

import type { AskRequest } from "@/lib/ask.contract";
import { loadArticles } from "@/lib/content/articles/server";
import { GitHubActivityService } from "@/lib/content/github-activity";
import type { GitHubFetch } from "@/lib/content/github-activity.models";
import { PluginLinksService } from "@/lib/content/plugin-links";
import { home, profile } from "@/lib/content/portfolio/server";
import { loadProjects } from "@/lib/content/projects/server";
import { askServerConfig } from "./ask.config";
import { AskGenerationError } from "./ask.errors";
import type { AskCorpusDependencies, CorpusEntry, OptionalSnapshot } from "./ask.models";
import { abortReason, withAbort } from "./abort-helpers";

const { maxCorpusBytes, optionalDataTimeoutMs } = askServerConfig;

/** Builds complete server-owned evidence with request-local optional snapshot lifetimes. */
export class AskCorpusService {
  /** Shared UTF-8 encoder; encoded data remains invocation-local. */
  private static readonly encoder = new TextEncoder();

  /** Shared stateless integration preserves module-lifetime plugin cache operations. */
  private static readonly pluginLinksService = new PluginLinksService();

  /**
   * Binds content and optional integration operations without capturing request state.
   * @param dependencies - Controlled content and integration operations.
   */
  constructor(private readonly dependencies: AskCorpusDependencies = {}) {}

  /**
   * Builds the complete validated website corpus and a stable source catalog.
   *
   * @param signal - Request lifecycle cancellation signal.
   * @returns Curated Home, project, article, and bounded optional public data.
   * @throws When required content cannot load or the complete corpus exceeds its bound.
   */
  async build(signal: AbortSignal): Promise<CorpusEntry[]> {
    const dependencies = this.dependencies;
    const portfolio = dependencies.portfolio ?? { home, profile };
    const [projects, articles] = await withAbort(Promise.all([
      (dependencies.loadProjects ?? loadProjects)(),
      (dependencies.loadArticles ?? loadArticles)(),
    ]), signal);
    signal.throwIfAborted();
    const optional = await this.optionalSnapshot(
      projects,
      signal,
      portfolio.home.codeActivity.username,
      dependencies.githubFetch,
    );
    const renderedLinks = Array.isArray(optional.projectLinkMetadata)
      ? new Map(optional.projectLinkMetadata.map(({ slug, links }) => [slug, links]))
      : null;
    const sources: CorpusEntry[] = [
      { id: "home:top", title: "Portfolio overview", href: "/", text: JSON.stringify({
        evidenceType: "portfolio introduction",
        identity: { name: portfolio.profile.name, headline: portfolio.profile.headline },
        metadataDescription: portfolio.home.metadataDescription,
        hero: portfolio.home.hero,
        mobileNavigation: portfolio.home.mobileNavigation,
        footer: portfolio.home.footer,
      }) },
      { id: "home:about", title: "About", href: "/#about", text: JSON.stringify({
        evidenceType: "portfolio about",
        summary: portfolio.profile.summary,
        careerChapters: portfolio.profile.careerChapters,
        facts: portfolio.profile.facts,
      }) },
      { id: "home:experience", title: "Experience", href: "/#experience", text: JSON.stringify({
        evidenceType: "employment history",
        experience: portfolio.profile.experience,
        recommendations: portfolio.profile.recommendations,
      }) },
      { id: "home:education", title: "Education", href: "/#education", text: JSON.stringify({
        evidenceType: "education and learning",
        education: portfolio.profile.education,
        certifications: portfolio.profile.certifications,
        learning: portfolio.profile.learning,
      }) },
      { id: "home:skills", title: "Skills", href: "/#skills", text: JSON.stringify({
        evidenceType: "self-reported skill inventory",
        skills: portfolio.profile.skills,
      }) },
      { id: "home:projects", title: "Projects", href: "/#projects", text: JSON.stringify({
        evidenceType: "portfolio project index",
        projects: portfolio.home.projects,
      }) },
      { id: "home:writing", title: "Writing", href: "/#writing", text: JSON.stringify({
        evidenceType: "technical writing index",
        writing: portfolio.home.writing,
      }) },
      { id: "home:contact", title: "Contact", href: "/#contact", text: JSON.stringify({
        evidenceType: "contact information",
        contact: portfolio.home.contact,
        links: portfolio.profile.links,
      }) },
      ...projects.map(({ slug, metadata, askText }) => ({
        id: `project:${slug}`,
        title: metadata.title,
        href: `/projects/${slug}`,
        text: JSON.stringify({
          evidenceType: "portfolio project",
          metadata,
          body: askText,
        }),
        liveText: JSON.stringify({ renderedLinks: renderedLinks?.get(slug) ?? { available: false } }),
      })),
      ...articles.map(({ slug, metadata, askText, readingMinutes }) => ({
        id: `article:${slug}`,
        title: metadata.title,
        href: `/articles/${slug}`,
        text: JSON.stringify({ evidenceType: "technical writing", metadata, readingMinutes, body: askText }),
      })),
    ];

    sources.push({
      id: "home:code",
      title: "Code activity",
      href: "/#code",
      text: JSON.stringify({
        evidenceType: "public GitHub activity",
        username: portfolio.home.codeActivity.username,
      }),
      liveText: JSON.stringify({ githubActivity: optional.githubActivity }),
    });
    if (AskCorpusService.encoder.encode(JSON.stringify(sources)).byteLength > maxCorpusBytes) {
      throw new AskGenerationError("Complete portfolio corpus exceeds 256 KiB");
    }
    return sources;
  }

  /**
   * Resolves a browser view hint only against routes and source IDs known to the server.
   *
   * @param context - Syntax-validated visitor context.
   * @param sources - Current server-owned source catalog.
   * @returns A canonical hint, or undefined when stale or unknown.
   */
  static resolveViewContext(
    context: AskRequest["context"],
    sources: readonly CorpusEntry[],
  ): AskRequest["context"] {
    if (!context) return undefined;
    const knownSections = new Set(sources
      .filter(({ id }) => id.startsWith("home:"))
      .map(({ id }) => id.slice("home:".length)));
    const recordId = context.record ? `${context.record.kind}:${context.record.slug}` : undefined;
    const recordSource = recordId ? sources.find(({ id }) => id === recordId) : undefined;
    const routeRecord = sources.find(({ id, href }) => /^(?:project|article):/u.test(id) && href === context.pathname);
    const knownPath = context.pathname === "/" || context.pathname === "/projects" || context.pathname === "/articles"
      || sources.some(({ href }) => href === context.pathname);
    if (!knownPath) return undefined;
    let collectionKind: "project" | "article" | undefined;
    if (context.pathname === "/projects") {
      collectionKind = "project";
    } else if (context.pathname === "/articles") {
      collectionKind = "article";
    }
    let canonicalRecord: NonNullable<AskRequest["context"]>["record"];
    if (routeRecord) {
      const [kind, slug] = routeRecord.id.split(":", 2);
      if (kind && slug && (kind === "project" || kind === "article")) {
        canonicalRecord = { kind, slug };
      }
    } else if (recordSource && (
      collectionKind === context.record?.kind
      || context.pathname === "/" && (
        context.sectionId === "projects" && context.record?.kind === "project"
        || context.sectionId === "writing" && context.record?.kind === "article"
      )
    )) {
      canonicalRecord = context.record;
    }
    return {
      pathname: context.pathname,
      ...(context.sectionId && context.pathname === "/" && knownSections.has(context.sectionId)
        ? { sectionId: context.sectionId }
        : {}),
      ...(canonicalRecord ? { record: canonicalRecord } : {}),
    };
  }

  /**
   * Captures optional website data within one bounded wait without cancelling shared cache fills.
   *
   * @param projects - Validated projects whose public links may receive live labels.
   * @param signal - Request lifecycle cancellation signal.
   * @param githubUsername - Public GitHub account configured for the rendered activity section.
   * @param githubFetch - GitHub fetch implementation wrapped in request-owned cancellation.
   * @returns Independent activity and plugin availability snapshots.
   */
  private async optionalSnapshot(
    projects: Awaited<ReturnType<typeof loadProjects>>,
    signal: AbortSignal,
    githubUsername: string,
    githubFetch: GitHubFetch = (input, init) => fetch(input, init),
  ): Promise<OptionalSnapshot> {
    const snapshotDeadline = new AbortController();
    const timer = globalThis.setTimeout(() => {
      snapshotDeadline.abort(new DOMException("Optional data timed out", "TimeoutError"));
    }, optionalDataTimeoutMs);
    const activitySignal = AbortSignal.any([signal, snapshotDeadline.signal]);
    /**
     * Preserves loader cache flags while adding request and snapshot cancellation.
     *
     * @param input - Absolute GitHub request URL.
     * @param init - Loader request options with cache and per-fetch deadline.
     * @returns GitHub response bounded by every applicable signal.
     */
    const requestOwnedFetch: GitHubFetch = (input, init) => {
      activitySignal.throwIfAborted();
      return githubFetch(input, {
        ...init,
        signal: init.signal
          ? AbortSignal.any([init.signal, activitySignal])
          : activitySignal,
      });
    };
    try {
      const activity = this.dependencies.loadGitHubActivity
        ? this.dependencies.loadGitHubActivity(githubUsername, requestOwnedFetch)
        : new GitHubActivityService({ fetcher: requestOwnedFetch }).load(githubUsername);
      const pluginLinks = Promise.all(projects.map(async ({ slug, metadata }) => ({
        slug,
        links: await (this.dependencies.resolvePluginLinks ?? ((links) => AskCorpusService.pluginLinksService.resolve(links)))(metadata.links),
      })));
      const [activityResult, pluginResult] = await Promise.all([
        this.settleOptional(activity, signal),
        this.settleOptional(pluginLinks, signal),
      ]);
      return {
        githubActivity: activityResult,
        projectLinkMetadata: pluginResult,
      };
    } finally {
      globalThis.clearTimeout(timer);
    }
  }

  /**
   * Waits for optional public data until the request ends or its snapshot window closes.
   *
   * @param promise - Shared or cached public-data operation.
   * @param signal - Request lifecycle cancellation signal.
   * @typeParam T - Optional public-data result type.
   * @returns The settled value or an explicit unavailable marker.
   */
  private async settleOptional<T>(promise: Promise<T>, signal: AbortSignal): Promise<T | { available: false }> {
    return new Promise((resolve, reject) => {
      let settled = false;
      /**
       * Resolves exactly once and detaches snapshot lifecycle resources.
       *
       * @param value - Completed public data or unavailable marker.
       */
      const finish = (value: T | { available: false }) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        resolve(value);
      };
      /** Rejects the current snapshot wait without cancelling its shared source. */
      const abort = () => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        reject(abortReason(signal));
      };
      const timer = globalThis.setTimeout(() => {
        finish({ available: false });
      }, optionalDataTimeoutMs);
      signal.addEventListener("abort", abort, { once: true });
      void promise.then(finish, () => {
        finish({ available: false });
      });
    });
  }
}
