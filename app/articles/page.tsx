import type { Metadata } from "next";
import Link from "next/link";

import { loadArticles } from "@/content/articles/server";

export const metadata: Metadata = {
  title: "Articles",
  description: "Articles by Nikita Reshetnik about AI and software engineering.",
};

/**
 * Loads and renders the statically discovered article listing.
 *
 * @returns The article listing page.
 */
export default async function ArticlesPage() {
  const articles = await loadArticles();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-20">
      <header className="max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Writing
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">Articles</h1>
        <p className="mt-5 text-lg leading-8 text-muted-foreground">
          Notes on AI evaluation and software engineering.
        </p>
      </header>

      <ul className="mt-14 divide-y">
        {articles.map(({ slug, metadata: article }) => (
          <li key={slug}>
            <article className="py-8">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-xs text-muted-foreground">
                <time dateTime={article.published}>
                  {new Intl.DateTimeFormat("en", {
                    dateStyle: "long",
                    timeZone: "UTC",
                  }).format(new Date(`${article.published}T00:00:00Z`))}
                </time>
                {article.tags?.length ? (
                  <span>{article.tags.join(" · ")}</span>
                ) : null}
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                <Link
                  className="underline-offset-4 hover:text-primary-text hover:underline"
                  href={`/articles/${slug}`}
                >
                  {article.title}
                </Link>
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
                {article.description}
              </p>
            </article>
          </li>
        ))}
      </ul>
    </main>
  );
}
