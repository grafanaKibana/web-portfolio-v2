import type { MetadataRoute } from "next";

import { getSiteOrigin } from "@/content/site-url";

/**
 * Allows crawling and publishes a sitemap only when an origin exists.
 *
 * @returns The crawler directives for this deployment.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = getSiteOrigin();

  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: origin ? `${origin}/sitemap.xml` : undefined,
  };
}
