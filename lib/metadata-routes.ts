import type { MetadataRoute } from "next";

/** Content slugs supplied to sitemap generation. */
export interface SitemapContent {
  articleSlugs: readonly string[];
  projectSlugs: readonly string[];
}

const staticPaths = [
  "",
  "/accessibility",
  "/articles",
  "/for-robots",
  "/privacy",
  "/projects",
  "/terms",
] as const;

/**
 * Builds sitemap entries from a deployment origin and discovered content slugs.
 *
 * @param origin - Validated deployment origin, when configured.
 * @param content - Article and project slugs discovered by the route wrapper.
 * @returns Sitemap entries, or an empty list without an origin.
 */
export function buildSitemap(
  origin: string | undefined,
  content: SitemapContent,
): MetadataRoute.Sitemap {
  if (!origin) return [];

  const paths = [
    ...staticPaths,
    ...content.articleSlugs.map((slug) => `/articles/${slug}`),
    ...content.projectSlugs.map((slug) => `/projects/${slug}`),
  ];

  return paths.map((path) => ({ url: `${origin}${path}` }));
}

/**
 * Builds crawler directives for a deployment origin.
 *
 * @param origin - Validated deployment origin, when configured.
 * @returns Crawler directives with a sitemap URL only when configured.
 */
export function buildRobots(origin: string | undefined): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: origin ? `${origin}/sitemap.xml` : undefined,
  };
}
