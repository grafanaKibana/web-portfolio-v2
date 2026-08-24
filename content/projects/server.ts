import "server-only";

import { join } from "node:path";

import { discoverMdxSlugs } from "../discovery";
import { validateMdxModule } from "../load";
import { validateSlug } from "../slugs";
import type { LoadedContent, ProjectMetadata } from "../types";

const directory = join(process.cwd(), "content", "projects");

/**
 * Discovers validated project slugs in deterministic order.
 *
 * @returns The available project slugs.
 * @throws Error when project files cannot be read or contain invalid slugs.
 */
export function getProjectSlugs(): string[] {
  return discoverMdxSlugs(directory, "projects");
}

/**
 * Loads one known project module and validates its content contract.
 *
 * @param slug - Normalized project slug to load.
 * @returns The validated project, or `undefined` when the slug is unknown.
 * @throws Error when the slug or known project module is invalid.
 */
export async function loadProject(
  slug: string,
): Promise<LoadedContent<ProjectMetadata> | undefined> {
  validateSlug(slug, "projects");
  if (!getProjectSlugs().includes(slug)) return undefined;

  const loadedModule: unknown = await import(`./${slug}.mdx`);
  const content = validateMdxModule(
    loadedModule,
    slug,
    join(directory, `${slug}.mdx`),
  );

  if (content.metadata.kind !== "project") {
    throw new Error(`${join(directory, `${slug}.mdx`)}: metadata.kind must be "project"`);
  }

  return { ...content, metadata: content.metadata };
}

/**
 * Loads every discovered project in deterministic order.
 *
 * @returns All validated projects.
 * @throws Error when discovered content cannot be loaded or validated.
 */
export async function loadProjects(): Promise<LoadedContent<ProjectMetadata>[]> {
  return Promise.all(
    getProjectSlugs().map(async (slug) => {
      const content = await loadProject(slug);
      if (!content) throw new Error(`projects: discovered slug "${slug}" could not be loaded`);
      return content;
    }),
  );
}
