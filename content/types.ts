import type { ComponentType } from "react";

export type ContentKind = "article" | "project";

interface BaseMetadata {
  title: string;
  description: string;
  updated?: string;
  tags?: readonly string[];
}

export interface ProjectLink {
  label: string;
  href: string;
}

export interface ArticleMetadata extends BaseMetadata {
  kind: "article";
  published: string;
}

export interface ProjectMetadata extends BaseMetadata {
  kind: "project";
  links?: readonly ProjectLink[];
}

export type ContentMetadata = ArticleMetadata | ProjectMetadata;

export interface MdxModule {
  default: ComponentType;
  metadata: unknown;
}

export interface LoadedContent<TMetadata extends ContentMetadata = ContentMetadata> {
  slug: string;
  metadata: TMetadata;
  Content: ComponentType;
}

export interface LoadedArticle extends LoadedContent<ArticleMetadata> {
  readingMinutes: number;
}
