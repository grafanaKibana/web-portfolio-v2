import { clsx } from "clsx";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { loadArticles } from "@/content/articles/server";
import { home } from "@/content/structured";
import styles from "./home-writing.module.scss";

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
      className="page-shell-gutter w-full scroll-mt-1 py-14 lg:-scroll-mt-11 lg:py-26"
    >
      <h2
        id="writing-heading"
        className={clsx(styles.sectionLabel, "mb-6 border-t pt-3 font-mono font-normal uppercase text-muted-foreground lg:mb-14 lg:pt-3.5")}
      >
        {home.writing.label}
      </h2>
      {latestArticles.length ? (
        <>
          <ul className="m-0 list-none p-0">
            {latestArticles.map(({ slug, metadata: article, readingMinutes }) => (
              <li className="border-t lg:first:border-t-0" key={slug}>
                <article>
                  <Link
                    className="group block py-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 lg:py-5"
                    href={`/articles/${slug}`}
                  >
                    <p className={clsx(styles.metadata, "font-mono text-muted-foreground lg:text-xs")}>
                      <time dateTime={article.published}>
                        {publishedDate.format(new Date(`${article.published}T00:00:00Z`))}
                      </time>
                      {` · ${String(readingMinutes)} ${home.writing.readingTimeLabel}`}
                    </p>
                    <h3 className="mt-2.5 max-w-3xl break-words text-xl font-medium leading-tight tracking-tight">
                      {article.title}
                    </h3>
                    <p className={clsx(styles.description, "mt-2.5 text-sm leading-relaxed text-muted-foreground transition-colors group-hover:text-foreground group-focus-visible:text-foreground")}>
                      {article.description}
                    </p>
                  </Link>
                </article>
              </li>
            ))}
          </ul>
          <Link
            className="flex min-h-12 w-full items-center border-t text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            data-slot="more-articles-link"
            href="/articles"
          >
            {home.writing.moreArticlesLabel}
            <ArrowUpRight aria-hidden="true" className="ml-auto size-3.5 opacity-60" />
          </Link>
        </>
      ) : (
        <p className="m-0 text-sm text-muted-foreground">{home.writing.empty}</p>
      )}
    </section>
  );
}
