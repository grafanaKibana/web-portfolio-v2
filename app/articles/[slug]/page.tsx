import { clsx } from "clsx";
import { ArrowLeft, House } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import headerStyles from "@/app/_shell/site-header/site-header.module.scss";
import { ThemeToggle } from "@/app/_shell/theme/theme";
import { getArticleSlugs, loadArticle } from "@/content/articles/server";
import { home } from "@/content/structured";

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
    <>
      <header className={clsx(headerStyles.header, "sticky top-0 z-50")} data-slot="article-header">
        <nav
          aria-label={home.writing.navigationLabel}
          className={clsx(headerStyles.navigation, headerStyles.detailNavigation, "mx-auto h-full w-full items-center")}
        >
          <div className="flex items-center">
            <Link
              aria-label={home.writing.backLabel}
              className="inline-flex size-11 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 xl:size-8"
              href="/articles"
            >
              <ArrowLeft aria-hidden="true" className="size-ui-icon opacity-70" />
            </Link>
            <Link
              aria-label={home.writing.homeLabel}
              className="inline-flex size-11 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 xl:size-8"
              href="/"
            >
              <House aria-hidden="true" className="size-ui-icon opacity-70" />
            </Link>
          </div>
          <span aria-hidden="true" />
          <div className="justify-self-end">
            <ThemeToggle labels={home.theme} />
          </div>
        </nav>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-6 py-12 focus:outline-none lg:py-20">
        <article className="max-w-3xl">
          <header className="border-b pb-12">
            <time className="font-mono text-xs text-muted-foreground" dateTime={article.metadata.published}>
              {new Intl.DateTimeFormat("en", {
                dateStyle: "long",
                timeZone: "UTC",
              }).format(new Date(`${article.metadata.published}T00:00:00Z`))}
            </time>
            <h1 className="mt-3 break-words text-4xl font-semibold tracking-tight sm:text-5xl">
              {article.metadata.title}
            </h1>
            <p className="mt-6 text-lg leading-8 text-muted-foreground">
              {article.metadata.description}
            </p>
            {article.metadata.tags?.length ? (
              <p className="mt-6 font-mono text-xs text-muted-foreground">
                {article.metadata.tags.join(" · ")}
              </p>
            ) : null}
          </header>

          <div className="pt-6">
            <article.Content />
          </div>
        </article>
      </main>
    </>
  );
}
