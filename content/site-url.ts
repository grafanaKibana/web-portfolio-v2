type SiteEnvironment = {
  NEXT_PUBLIC_SITE_URL?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
};

/**
 * Resolves the deployment HTTPS origin without inventing a fallback.
 *
 * @param environment - Supported deployment URL variables.
 * @returns The validated origin, or `undefined` when none is configured.
 * @throws Error when the configured value is not an HTTPS origin.
 */
export function getSiteOrigin(environment: SiteEnvironment = {
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
}): string | undefined {
  const publicUrl = environment.NEXT_PUBLIC_SITE_URL?.trim();
  const vercelUrl = environment.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const value = publicUrl || vercelUrl;
  if (!value) return undefined;

  const name = publicUrl ? "NEXT_PUBLIC_SITE_URL" : "VERCEL_PROJECT_PRODUCTION_URL";
  let url: URL;
  try {
    url = new URL(value.includes("://") ? value : `https://${value}`);
  } catch {
    throw new Error(`${name} must be an HTTPS origin`);
  }
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.pathname !== "/"
    || url.search
    || url.hash
  ) {
    throw new Error(`${name} must be an HTTPS origin`);
  }

  return url.origin;
}
