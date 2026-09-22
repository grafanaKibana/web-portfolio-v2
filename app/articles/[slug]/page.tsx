import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getArticleSlugs, loadArticle } from "@/lib/content/articles/server";

const publishedDate = new Intl.DateTimeFormat("en", {
  dateStyle: "long",
  timeZone: "UTC",
});

/** Restricts article detail routes to statically generated slugs. */
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
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-4xl flex-1 px-6 py-12 focus:outline-none lg:py-20">
      <article className="mx-auto max-w-[68ch]">
        <header className="pb-12">
          <p className="font-mono text-xs leading-[1.125rem] text-muted-foreground" data-page-motion-intro>
            <time dateTime={article.metadata.published}>
              {publishedDate.format(new Date(`${article.metadata.published}T00:00:00Z`))}
            </time>
            {` · ${String(article.readingMinutes)} min read`}
          </p>
          <h1 className="mt-3 [overflow-wrap:anywhere] text-4xl leading-[1.15] font-semibold tracking-[-0.025em] md:text-5xl" data-page-motion-intro>
            {article.metadata.title}
          </h1>
          <p className="mt-6 text-lg leading-[1.875rem] text-content-foreground" data-page-motion-intro>
            {article.metadata.description}
          </p>
          {article.metadata.tags?.length ? (
            <p className="mt-6 font-mono text-xs leading-[1.125rem] text-muted-foreground" data-page-motion-intro>
              {article.metadata.tags.join(" · ")}
            </p>
          ) : null}
        </header>
        <hr aria-hidden="true" className="m-0 border-0 border-b" data-page-motion-intro />

        <div className="pt-6 text-base leading-7 [overflow-wrap:anywhere] [&>*:first-child]:mt-0" data-page-motion-rows="children" data-page-motion-section data-page-motion-trigger>
          <article.Content />
        </div>
      </article>
    </main>
  );
}
