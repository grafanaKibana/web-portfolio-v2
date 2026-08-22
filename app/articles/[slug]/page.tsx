import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getArticleSlugs, loadArticle } from "@/content/articles/server";

export const dynamicParams = false;

/**
 * Provides every validated article slug for static generation.
 *
 * @returns Static article route parameters.
 */
export function generateStaticParams() {
  return getArticleSlugs().map((slug) => ({ slug }));
}

/**
 * Builds route metadata from a validated article.
 *
 * @param params - Promise containing the requested article slug.
 * @returns Metadata for the requested article.
 */
export async function generateMetadata({
  params,
}: PageProps<"/articles/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const article = await loadArticle(slug);
  if (!article) notFound();

  return {
    title: article.metadata.title,
    description: article.metadata.description,
    alternates: { canonical: `/articles/${slug}` },
    openGraph: {
      type: "article",
      title: article.metadata.title,
      description: article.metadata.description,
      publishedTime: article.metadata.published,
    },
  };
}

/**
 * Renders one validated, statically generated article.
 *
 * @param params - Promise containing the requested article slug.
 * @returns The article page.
 */
export default async function ArticlePage({
  params,
}: PageProps<"/articles/[slug]">) {
  const { slug } = await params;
  const article = await loadArticle(slug);
  if (!article) notFound();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-20">
      <article className="max-w-3xl">
        <header className="border-b pb-12">
          <Link
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            href="/articles"
          >
            All articles
          </Link>
          <p className="mt-8 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Writing
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            {article.metadata.title}
          </h1>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            {article.metadata.description}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-xs text-muted-foreground">
            <time dateTime={article.metadata.published}>
              {new Intl.DateTimeFormat("en", {
                dateStyle: "long",
                timeZone: "UTC",
              }).format(new Date(`${article.metadata.published}T00:00:00Z`))}
            </time>
            {article.metadata.tags?.length ? (
              <span>{article.metadata.tags.join(" · ")}</span>
            ) : null}
          </div>
        </header>

        <div className="pt-6">
          <article.Content />
        </div>
      </article>
    </main>
  );
}
