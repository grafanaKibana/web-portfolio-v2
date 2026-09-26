import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { HomeEditorialRow } from "@/app/(home)/_components/editorial-row/editorial-row";
import { loadArticles } from "@/lib/content/articles/server";

const publishedDate = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

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
        className="m-0 mb-8 font-sans text-2xl leading-[1.12] font-semibold tracking-[-0.03em] text-balance wrap-anywhere text-foreground lg:mb-10"
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
                    <span className="sr-only">Read article</span>
                    <ArrowRight aria-hidden="true" className="action-icon opacity-60" />
                  </Link>
                )}
                description={article.description}
                metadata={<time dateTime={article.published}>{publishedDate.format(new Date(`${article.published}T00:00:00Z`))}</time>}
                title={article.title}
              />
            ))}
          </ul>
          <Link
            className="mt-2 inline-flex min-h-12 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            data-page-motion-row
            data-slot="more-articles-link"
            href="/articles"
          >
            See all articles
            <ArrowRight aria-hidden="true" className="action-icon opacity-60" />
          </Link>
        </>
      ) : (
        <p className="m-0 text-sm text-content-foreground" data-page-motion-row>No articles published yet.</p>
      )}
    </section>
  );
}
