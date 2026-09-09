import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { loadArticles } from "@/content/articles/server";
import { HomeEditorialRow } from "../home-editorial-row/home-editorial-row";

const publishedDate = new Intl.DateTimeFormat("en", {
  dateStyle: "long",
  timeZone: "UTC",
});

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
      className="home-section page-shell-gutter w-full"
      data-page-motion-section
    >
      <h2
        data-page-motion-row
        data-page-motion-trigger
        id="writing-heading"
        className="text-section-label mb-8 border-t pt-3 font-mono font-normal uppercase text-muted-foreground lg:mb-16 lg:pt-3.5"
      >
        Writing
      </h2>
      {latestArticles.length ? (
        <>
          <ul className="m-0 list-none p-0">
            {latestArticles.map(({ slug, metadata: article }) => (
              <HomeEditorialRow
                dataSlot="home-article"
                key={slug}
                actions={(
                  <Link className="project-action-link" data-row-link href={`/articles/${slug}`}>
                    <ArrowUpRight aria-hidden="true" className="size-3.5 opacity-60" />
                    Read article
                  </Link>
                )}
                description={article.description}
                metadata={(
                  <p>
                    <time dateTime={article.published}>
                      {publishedDate.format(new Date(`${article.published}T00:00:00Z`))}
                    </time>
                  </p>
                )}
                title={article.title}
              />
            ))}
          </ul>
          <Link
            className="flex min-h-12 w-full items-center border-t text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            data-page-motion-row
            data-slot="more-articles-link"
            href="/articles"
          >
            See all articles
            <ArrowUpRight aria-hidden="true" className="ml-auto size-3.5 opacity-60" />
          </Link>
        </>
      ) : (
        <p className="m-0 text-sm text-content-foreground" data-page-motion-row>No articles published yet.</p>
      )}
    </section>
  );
}
