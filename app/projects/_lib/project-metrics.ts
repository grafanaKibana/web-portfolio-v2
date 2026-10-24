import "server-only";

import { unstable_cache } from "next/cache";

import { PluginLinksService } from "@/lib/content/plugin-links";
import type { ProjectMetadata } from "@/lib/content/types";
import { projectMetricsConfig } from "./project-metrics.config";
import type { ProjectMetrics, ProjectMetricsOperations } from "./project-metrics.models";

/** Enriches curated projects with optional public metrics and orders them by stars. */
export class ProjectMetricsService {
  private static readonly cachedStars = unstable_cache(
    async (repository: string) => ProjectMetricsService.loadStars(repository),
    ["project-repository-stars-v1"],
    { revalidate: projectMetricsConfig.cacheSeconds },
  );

  private readonly operations: ProjectMetricsOperations;

  /**
   * Creates a project metrics loader using shared production caches by default.
   * @param operations - Optional uncached metric operations for deterministic tests.
   */
  constructor(operations?: ProjectMetricsOperations) {
    const pluginLinks = new PluginLinksService();
    this.operations = operations ?? {
      loadStars: ProjectMetricsService.cachedStars,
      /**
       * Reuses the plugin download cache for the project's store link.
       * @param links - Validated project links.
       * @returns Available total downloads.
       */
      loadDownloads: (links) => pluginLinks.loadDownloads(links),
    };
  }

  /**
   * Preserves projects while adding independent metrics and sorting known star counts descending.
   * @typeParam T - Project record whose existing fields must be retained.
   * @param projects - Validated project records in their fallback order.
   * @returns Enriched projects with stable ties and unavailable stars last.
   */
  async enrich<T extends { metadata: ProjectMetadata }>(
    projects: readonly T[],
  ): Promise<Array<T & { metrics: ProjectMetrics }>> {
    const starsByRepository = new Map<string, Promise<number | null>>();
    const enriched = await Promise.all(projects.map(async (project) => {
      const links = project.metadata.links;
      const repository = links?.map(({ href }) => PluginLinksService.githubRepository(href))
        .find((candidate) => candidate !== null);
      let stars = repository ? starsByRepository.get(repository) : undefined;
      if (repository && !stars) {
        stars = this.operations.loadStars(repository).catch(() => null);
        starsByRepository.set(repository, stars);
      }
      const [starCount, downloads] = await Promise.all([
        stars ?? null,
        this.operations.loadDownloads(links).catch(() => null),
      ]);
      return { ...project, metrics: { stars: starCount, downloads } };
    }));
    return enriched.sort((left, right) => (right.metrics.stars ?? -1) - (left.metrics.stars ?? -1));
  }

  /**
   * Fetches and validates the star count of an exact linked GitHub repository.
   * @param repository - Validated owner and repository path.
   * @returns A nonnegative safe integer star count.
   * @throws When GitHub fails or returns an invalid count.
   */
  private static async loadStars(repository: string): Promise<number> {
    const token = process.env.GITHUB_TOKEN?.trim();
    const response = await fetch(`https://api.github.com/repos/${repository}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(projectMetricsConfig.requestTimeoutMilliseconds),
    });
    if (!response.ok) throw new Error(`GitHub repository request failed: ${String(response.status)}`);
    const value: unknown = await response.json();
    const count = value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>).stargazers_count : undefined;
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
      throw new Error(`Invalid GitHub star count for ${repository}`);
    }
    return count;
  }
}
