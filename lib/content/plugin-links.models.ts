import type { ProjectLink } from "./types";

/** Project link enriched with optional accessible context. */
export interface ResolvedProjectLink extends ProjectLink {
  ariaLabel?: string;
}

/** Uncached operation dependencies; production defaults use shared caches. */
export interface PluginLinksOperations {
  loadDownloadCounts: () => Promise<Readonly<Record<string, number>>>;
  loadRepositoryVersion: (repository: string) => Promise<string>;
}
