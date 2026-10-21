type SiteEnvironment = {
  VERCEL_PROJECT_PRODUCTION_URL?: string | undefined;
};

/**
 * Resolves the deployment HTTPS origin without inventing a fallback.
 *
 * @param environment - Vercel's production deployment URL.
 * @returns The validated origin, or `undefined` when none is configured.
 * @throws Error when the configured value is not an HTTPS origin.
 */
export function getSiteOrigin(environment: SiteEnvironment = {
  VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
}): string | undefined {
  const value = environment.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (!value) return undefined;

  let url: URL;
  try {
    url = new URL(value.includes("://") ? value : `https://${value}`);
  } catch {
    throw new Error("VERCEL_PROJECT_PRODUCTION_URL must be an HTTPS origin");
  }
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.pathname !== "/"
    || url.search
    || url.hash
  ) {
    throw new Error("VERCEL_PROJECT_PRODUCTION_URL must be an HTTPS origin");
  }

  return url.origin;
}
