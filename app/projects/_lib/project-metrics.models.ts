import type { ProjectLink } from "@/lib/content/types";

/** Available public popularity counts for one project. */
export interface ProjectMetrics {
  stars: number | null;
  downloads: number | null;
}

/** Uncached transport operations for deterministic project metric tests. */
export interface ProjectMetricsOperations {
  loadStars: (repository: string) => Promise<number>;
  loadDownloads: (links: readonly ProjectLink[] | undefined) => Promise<number | null>;
}
