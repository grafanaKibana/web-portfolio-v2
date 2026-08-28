import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getArticleSlugs, loadArticle } from "@/content/articles/server";

const publishedDate = new Intl.DateTimeFormat("en", {
  dateStyle: "long",
  timeZone: "UTC",
});

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
      <article>
        <header className="border-b pb-12">
          <p className="font-mono text-xs text-muted-foreground" data-page-motion-intro>
            <time dateTime={article.metadata.published}>
              {publishedDate.format(new Date(`${article.metadata.published}T00:00:00Z`))}
            </time>
            {` · ${String(article.readingMinutes)} min read`}
          </p>
          <h1 className="mt-3 break-normal text-3xl font-semibold tracking-tight sm:text-5xl" data-page-motion-intro>
            {article.metadata.title}
          </h1>
          <p className="mt-6 text-lg leading-8 text-muted-foreground" data-page-motion-intro>
            {article.metadata.description}
          </p>
          {article.metadata.tags?.length ? (
            <p className="mt-6 font-mono text-xs text-muted-foreground" data-page-motion-intro>
              {article.metadata.tags.join(" · ")}
            </p>
          ) : null}
        </header>

        <div className="pt-6" data-page-motion-rows="children" data-page-motion-section data-page-motion-trigger>
          <article.Content />
        </div>
      </article>
    </main>
  );
}
