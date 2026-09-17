import "server-only";

import { unstable_cache } from "next/cache";

import { pluginLinksConfig } from "./plugin-links.config";
import type { PluginLinksOperations, ResolvedProjectLink } from "./plugin-links.models";
import type { ProjectLink } from "./types";

/** Resolves plugin metadata using stable production cache operations. */
export class PluginLinksService {
  private static readonly cachedDownloadCounts = unstable_cache(
    async () => PluginLinksService.loadDownloadCounts(),
    ["plugin-download-counts-v2"],
    { revalidate: pluginLinksConfig.cacheSeconds },
  );

  private static readonly cachedRepositoryVersion = unstable_cache(
    async (repository: string) => PluginLinksService.loadRepositoryVersion(repository),
    ["plugin-repository-version-v1"],
    { revalidate: pluginLinksConfig.cacheSeconds },
  );
  private readonly operations: PluginLinksOperations;

  /**
   * Creates a plugin-link resolver.
   *
   * @param operations - Optional uncached operations for deterministic tests.
   */
  constructor(operations?: PluginLinksOperations) {
    this.operations = operations ?? {
      loadDownloadCounts: PluginLinksService.cachedDownloadCounts,
      loadRepositoryVersion: PluginLinksService.cachedRepositoryVersion,
    };
  }

  /**
   * Resolves live labels for links belonging to an Obsidian plugin project.
   *
   * @param links - Validated project links.
   * @returns Links with enriched labels when current remote values are available.
   */
  async resolve(links: readonly ProjectLink[] | undefined): Promise<readonly ResolvedProjectLink[]> {
    if (!links) return [];
    const storeLink = links.find(({ href }) => PluginLinksService.obsidianPluginId(href) !== null);
    const pluginId = storeLink ? PluginLinksService.obsidianPluginId(storeLink.href) : null;
    if (!pluginId) return links;
    const downloadCounts = this.operations.loadDownloadCounts().catch(() => null);
    const versions = new Map<string, Promise<string | null>>();
    return Promise.all(links.map(async (link): Promise<ResolvedProjectLink> => {
      if (PluginLinksService.obsidianPluginId(link.href) === pluginId) {
        const counts = await downloadCounts;
        const downloads = counts && Object.hasOwn(counts, pluginId) ? counts[pluginId] : undefined;
        if (downloads === undefined) return link;
        const label = `${new Intl.NumberFormat("en-US").format(downloads)} Downloads`;
        return { ...link, label, ariaLabel: `${label} — ${link.label}` };
      }
      const repository = pluginLinksConfig.sourceLabels.has(link.label) ? PluginLinksService.githubRepository(link.href) : null;
      if (!repository) return link;
      let version = versions.get(repository);
      if (!version) {
        version = this.operations.loadRepositoryVersion(repository).catch(() => null);
        versions.set(repository, version);
      }
      const label = await version;
      return label === null ? link : { ...link, label, ariaLabel: `${label} — ${link.label}` };
    }));
  }

  /**
   * Returns an object record or null for an invalid remote value.
   *
   * @param value - Untrusted remote value.
   * @returns The record when valid.
   */
  private static record(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  }

  /**
   * Extracts a plugin ID from the canonical Obsidian store URL.
   *
   * @param href - Candidate project-link URL.
   * @returns The plugin ID when the link identifies an Obsidian plugin.
   */
  private static obsidianPluginId(href: string): string | null {
    try {
      const url = new URL(href);
      if (url.protocol !== "https:"
        || url.hostname !== "obsidian.md"
        || url.pathname !== "/plugins"
        || url.searchParams.size !== 1) return null;
      const id = url.searchParams.get("id");
      return id && /^[a-z0-9][a-z0-9-]*$/.test(id) ? id : null;
    } catch {
      return null;
    }
  }

  /**
   * Extracts a GitHub owner and repository from an exact repository URL.
   *
   * @param href - Candidate source URL.
   * @returns The repository path when valid.
   */
  private static githubRepository(href: string): string | null {
    try {
      const url = new URL(href);
      const segments = url.pathname.split("/").filter(Boolean);
      if (url.protocol !== "https:"
        || url.hostname !== "github.com"
        || segments.length !== 2
        || url.search
        || url.hash) return null;
      const [owner, repository] = segments;
      if (!owner || !repository
        || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner)
        || !/^[A-Za-z0-9._-]{1,100}$/.test(repository)) return null;
      return `${owner}/${repository}`;
    } catch {
      return null;
    }
  }

  /**
   * Reads and validates official aggregate download counts for all plugins.
   *
   * @returns Validated download counts keyed by plugin ID.
   * @throws When the request or remote value is invalid.
   */
  private static async loadDownloadCounts(): Promise<Readonly<Record<string, number>>> {
    const response = await fetch(pluginLinksConfig.statsUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(pluginLinksConfig.requestTimeoutMilliseconds),
    });
    if (!response.ok) throw new Error(`Obsidian statistics request failed: ${String(response.status)}`);
    const stats = PluginLinksService.record(await response.json());
    if (!stats) throw new Error("Invalid Obsidian statistics response");

    const entries: [string, number][] = [];
    for (const [pluginId, value] of Object.entries(stats)) {
      const downloads = PluginLinksService.record(value)?.downloads;
      if (typeof downloads !== "number"
        || !Number.isSafeInteger(downloads)
        || downloads < 0) {
        throw new Error(`Invalid download count for ${pluginId}`);
      }
      entries.push([pluginId, downloads]);
    }
    if (entries.length === 0) throw new Error("Obsidian statistics response is empty");
    return Object.fromEntries(entries);
  }

  /**
   * Reads and validates the latest stable release tag for one GitHub repository.
   *
   * @param repository - GitHub owner and repository path.
   * @returns The stable version tag.
   * @throws When the request or remote value is invalid.
   */
  private static async loadRepositoryVersion(repository: string): Promise<string> {
    const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(pluginLinksConfig.requestTimeoutMilliseconds),
    });
    if (!response.ok) throw new Error(`GitHub release request failed: ${String(response.status)}`);
    const release = PluginLinksService.record(await response.json());
    const tagName = release?.tag_name;
    const publishedAt = release?.published_at;
    if (release?.draft !== false
      || release.prerelease !== false
      || typeof tagName !== "string"
      || !/^v?\d+\.\d+\.\d+(?:\+[0-9A-Za-z.-]+)?$/.test(tagName)
      || typeof publishedAt !== "string"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(publishedAt)
      || !Number.isFinite(Date.parse(publishedAt))) {
      throw new Error(`Invalid stable release for ${repository}`);
    }
    return tagName;
  }
}
