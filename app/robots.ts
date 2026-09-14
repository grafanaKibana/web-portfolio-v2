import type { MetadataRoute } from "next";

import { getSiteOrigin } from "@/content/site-url";
import { buildRobots } from "@/lib/metadata-routes";

/**
 * Allows crawling and publishes a sitemap only when an origin exists.
 *
 * @returns The crawler directives for this deployment.
 */
export default function robots(): MetadataRoute.Robots {
  return buildRobots(getSiteOrigin());
}
