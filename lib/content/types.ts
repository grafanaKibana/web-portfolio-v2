import type { ComponentType } from "react";

/** Supported local MDX content families. */
export type ContentKind = "article" | "project";

interface BaseMetadata {
  title: string;
  description: string;
  updated?: string;
  tags?: readonly string[];
}

/** External action associated with a project. */
export interface ProjectLink {
  label: string;
  href: string;
}

/** Validated metadata required by article content. */
export interface ArticleMetadata extends BaseMetadata {
  kind: "article";
  published: string;
}

/** Validated metadata required by project content. */
export interface ProjectMetadata extends BaseMetadata {
  kind: "project";
  links?: readonly ProjectLink[];
}

/** Metadata accepted by the shared local-content loader. */
export type ContentMetadata = ArticleMetadata | ProjectMetadata;

/** Runtime shape required from an imported MDX module. */
export interface MdxModule {
  askText: unknown;
  default: ComponentType;
  metadata: unknown;
}

/**
 * Validated content paired with its route slug and render component.
 *
 * @typeParam TMetadata - Metadata family carried by the loaded content.
 */
export interface LoadedContent<TMetadata extends ContentMetadata = ContentMetadata> {
  askText: string;
  slug: string;
  metadata: TMetadata;
  Content: ComponentType;
}

/** Loaded article content with a derived reading duration. */
export interface LoadedArticle extends LoadedContent<ArticleMetadata> {
  readingMinutes: number;
}
