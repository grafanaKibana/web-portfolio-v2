import "server-only";

/** GitHub repository-star cache and transport limits. */
export const repositoryStarsConfig = {
  revalidateSeconds: 86_400,
  requestTimeoutMilliseconds: 5_000,
} as const;
