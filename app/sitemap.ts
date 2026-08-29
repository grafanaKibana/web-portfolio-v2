import type { MetadataRoute } from "next";

import { getArticleSlugs } from "@/content/articles/server";
import { getProjectSlugs } from "@/content/projects/server";
import { getSiteOrigin } from "@/content/site-url";

/**
 * Builds sitemap entries for every known route when an origin is configured.
 *
 * @returns The deployment sitemap, or an empty list without an origin.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getSiteOrigin();
  if (!origin) return [];

  const paths = [
    "",
    "/accessibility",
    "/articles",
    "/for-robots",
    "/privacy",
    "/projects",
    "/terms",
    ...getArticleSlugs().map((slug) => `/articles/${slug}`),
    ...getProjectSlugs().map((slug) => `/projects/${slug}`),
  ];

  return paths.map((path) => ({ url: `${origin}${path}` }));
}
