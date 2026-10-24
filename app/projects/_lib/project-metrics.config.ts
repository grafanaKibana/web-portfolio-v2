import "server-only";

/** Project index popularity cache and transport policy. */
export const projectMetricsConfig = {
  cacheSeconds: 86_400,
  requestTimeoutMilliseconds: 5_000,
} as const;
