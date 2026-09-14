import type { MetadataRoute } from "next";

import { getArticleSlugs } from "@/content/articles/server";
import { getProjectSlugs } from "@/content/projects/server";
import { getSiteOrigin } from "@/content/site-url";
import { buildSitemap } from "@/lib/metadata-routes";

/**
 * Builds sitemap entries for every known route when an origin is configured.
 *
 * @returns The deployment sitemap, or an empty list without an origin.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap(getSiteOrigin(), {
    articleSlugs: getArticleSlugs(),
    projectSlugs: getProjectSlugs(),
  });
}
