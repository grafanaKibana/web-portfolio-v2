import type { Metadata } from "next";
import Link from "next/link";

import { loadArticles } from "@/lib/content/articles/server";
import { home } from "@/lib/content/portfolio/server";

const publishedDate = new Intl.DateTimeFormat("en", {
  dateStyle: "long",
  timeZone: "UTC",
});

/** Search and sharing metadata for the article collection. */
export const metadata: Metadata = {
  title: "Articles",
  description: home.writing.indexDescription,
};

/**
 * Loads and renders the statically discovered article listing.
 *
 * @returns The article listing page.
 */
export default async function ArticlesPage() {
  const articles = (await loadArticles()).toSorted((left, right) =>
    right.metadata.published.localeCompare(left.metadata.published));

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-4xl flex-1 px-6 py-12 focus:outline-none lg:py-20">
      <h1 className="text-4xl font-semibold tracking-tight" data-page-motion-intro>Articles</h1>
      {articles.length ? (
        <ul className="mt-10 [&>li:not(:last-child)>a]:border-b">
          {articles.map(({ slug, metadata: article, readingMinutes }) => (
            <li
              data-ask-record-kind="article"
              data-ask-record-slug={slug}
              data-page-motion-section
              key={slug}
            >
              <Link
                aria-labelledby={`${slug}-article-title`}
                className="group block rounded-sm py-8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                data-page-motion-row
                data-slot="article-row"
                href={`/articles/${slug}`}
              >
                <article>
                  <p className="font-mono text-xs leading-[1.125rem] text-muted-foreground transition-colors group-hover:text-foreground group-focus-visible:text-foreground">
                    <time dateTime={article.published}>
                      {publishedDate.format(new Date(`${article.published}T00:00:00Z`))}
                    </time>
                    {` · ${String(readingMinutes)} min read`}
                  </p>
                  <h2 data-page-motion-trigger id={`${slug}-article-title`} className="mt-3 break-words text-2xl font-semibold tracking-tight">
                    {article.title}
                  </h2>
                  <p className="mt-3 max-w-3xl leading-7 text-content-foreground transition-colors group-hover:text-foreground group-focus-visible:text-foreground">
                    {article.description}
                  </p>
                </article>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-10 leading-7 text-content-foreground">No articles published yet.</p>
      )}
    </main>
  );
}
