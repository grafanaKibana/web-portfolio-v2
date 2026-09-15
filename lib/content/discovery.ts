import "server-only";

import { readdirSync } from "node:fs";
import { join } from "node:path";

import { validateSlug } from "./slugs";

/**
 * Discovers normalized MDX slugs and rejects case-insensitive duplicates.
 *
 * @param directory - Directory containing local MDX files.
 * @param source - Human-readable content source used in diagnostics.
 * @returns The validated slugs in deterministic order.
 * @throws Error when files cannot be read or slugs are invalid or duplicated.
 */
export function discoverMdxSlugs(directory: string, source: string): string[] {
  const files = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".mdx"))
    .map((entry) => entry.name);

  const seen = new Map<string, string>();
  for (const file of files) {
    const slug = file.slice(0, -4);
    const key = slug.toLowerCase();
    const duplicate = seen.get(key);
    if (duplicate) {
      throw new Error(`${source}: duplicate slugs in ${join(directory, duplicate)} and ${join(directory, file)}`);
    }
    seen.set(key, file);
  }

  return files
    .map((file) => validateSlug(file.slice(0, -4), join(directory, file)))
    .sort((left, right) => left.localeCompare(right));
}
