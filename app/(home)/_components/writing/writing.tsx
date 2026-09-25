import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { HomeEditorialRow } from "@/app/(home)/_components/editorial-row/editorial-row";
import { loadArticles } from "@/lib/content/articles/server";

/**
 * Renders validated local articles as links to their static routes.
 *
 * @returns The Home Writing section.
 */
export async function HomeWriting() {
  const latestArticles = (await loadArticles())
    .toSorted((left, right) => right.metadata.published.localeCompare(left.metadata.published))
    .slice(0, 3);

  return (
    <section
      id="writing"
      aria-labelledby="writing-heading"
      className="page-shell-gutter w-full scroll-mt-3 py-8 lg:-scroll-mt-5 lg:py-12 xl:-scroll-mt-1"
      data-page-motion-section
    >
      <h2
        data-page-motion-row
        data-page-motion-trigger
        id="writing-heading"
        className="m-0 mb-8 border-t pt-3 font-mono text-xs leading-4.5 font-semibold tracking-[0.08em] uppercase text-muted-foreground lg:mb-10 lg:pt-3.5"
      >
        Writing
      </h2>
      {latestArticles.length ? (
        <>
          <ul className="m-0 list-none p-0">
            {latestArticles.map(({ slug, metadata: article }) => (
              <HomeEditorialRow
                askRecord={{ kind: "article", slug }}
                dataSlot="home-article"
                key={slug}
                actions={(
                  <Link className="action-link" data-row-link href={`/articles/${slug}`}>
                    Read article
                    <ArrowUpRight aria-hidden="true" className="action-icon opacity-60" />
                  </Link>
                )}
                description={article.description}
                title={article.title}
              />
            ))}
          </ul>
          <Link
            className="flex min-h-12 w-full items-center text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            data-page-motion-row
            data-slot="more-articles-link"
            href="/articles"
          >
            See all articles
            <ArrowUpRight aria-hidden="true" className="ml-auto action-icon opacity-60" />
          </Link>
        </>
      ) : (
        <p className="m-0 text-sm text-content-foreground" data-page-motion-row>No articles published yet.</p>
      )}
    </section>
  );
}
