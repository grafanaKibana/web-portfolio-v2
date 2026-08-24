import "server-only";

import { join } from "node:path";

import { discoverMdxSlugs } from "../discovery";
import { validateMdxModule } from "../load";
import { validateSlug } from "../slugs";
import type { ArticleMetadata, LoadedContent } from "../types";

const directory = join(process.cwd(), "content", "articles");

/**
 * Discovers validated article slugs in deterministic order.
 *
 * @returns The available article slugs.
 * @throws Error when article files cannot be read or contain invalid slugs.
 */
export function getArticleSlugs(): string[] {
  return discoverMdxSlugs(directory, "articles");
}

/**
 * Loads one known article module and validates its content contract.
 *
 * @param slug - Normalized article slug to load.
 * @returns The validated article, or `undefined` when the slug is unknown.
 * @throws Error when the slug or known article module is invalid.
 */
export async function loadArticle(
  slug: string,
): Promise<LoadedContent<ArticleMetadata> | undefined> {
  validateSlug(slug, "articles");
  if (!getArticleSlugs().includes(slug)) return undefined;

  const loadedModule: unknown = await import(`./${slug}.mdx`);
  const content = validateMdxModule(
    loadedModule,
    slug,
    join(directory, `${slug}.mdx`),
  );

  if (content.metadata.kind !== "article") {
    throw new Error(`${join(directory, `${slug}.mdx`)}: metadata.kind must be "article"`);
  }

  return { ...content, metadata: content.metadata };
}

/**
 * Loads every discovered article in deterministic order.
 *
 * @returns All validated articles.
 * @throws Error when discovered content cannot be loaded or validated.
 */
export async function loadArticles(): Promise<LoadedContent<ArticleMetadata>[]> {
  return Promise.all(
    getArticleSlugs().map(async (slug) => {
      const content = await loadArticle(slug);
      if (!content) throw new Error(`articles: discovered slug "${slug}" could not be loaded`);
      return content;
    }),
  );
}
