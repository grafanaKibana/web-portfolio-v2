/** Server fetch options used for GitHub repository pages. */
export interface RepositoryStarsRequestInit extends RequestInit {
  next: { revalidate: number };
}

/** Fetch-compatible dependency used to retrieve GitHub repository pages. */
export type RepositoryStarsFetch = (
  input: string,
  init: RepositoryStarsRequestInit,
) => Promise<Response>;

/** Injectable server operations resolved at invocation time. */
export interface RepositoryStarsDependencies {
  fetcher?: RepositoryStarsFetch;
  resolveToken?: () => string | undefined;
}
