import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "For Robots",
  description: "How llms.txt and robots.txt describe this portfolio to automated agents and crawlers.",
};

/**
 * Explains the portfolio's machine-readable navigation files.
 *
 * @returns The For Robots page.
 */
export default function ForRobotsPage() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-4xl flex-1 px-6 py-12 focus:outline-none lg:py-20">
      <article className="max-w-3xl">
        <header>
          <h1 className="text-4xl font-semibold tracking-tight" data-page-motion-intro>For Robots</h1>
          <p className="mt-4 font-mono text-xs text-muted-foreground" data-page-motion-intro>Last updated: August 29, 2026</p>
          <p className="mt-6 leading-7 text-muted-foreground" data-page-motion-intro>This page explains the two machine-readable text files published by this portfolio.</p>
        </header>

        <section className="mt-10" data-page-motion-rows="children" data-page-motion-section>
          <h2 className="text-2xl font-semibold tracking-tight" data-page-motion-trigger>llms.txt</h2>
          <p className="mt-4 leading-7 text-muted-foreground">The root llms.txt file is a concise Markdown guide that helps language-model agents find the site&apos;s public profile, projects, articles, and site information. It follows the proposal&apos;s minimal structure and is informational only.</p>
          <p className="mt-4">
            <Link className="inline-flex min-h-11 items-center text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" href="/llms.txt">Open llms.txt</Link>
          </p>
        </section>

        <section className="mt-10" data-page-motion-rows="children" data-page-motion-section>
          <h2 className="text-2xl font-semibold tracking-tight" data-page-motion-trigger>robots.txt</h2>
          <p className="mt-4 leading-7 text-muted-foreground">The root robots.txt file contains crawler directives and the sitemap location when a deployment origin is configured.</p>
          <p className="mt-4">
            <Link className="inline-flex min-h-11 items-center text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" href="/robots.txt">Open robots.txt</Link>
          </p>
        </section>

        <section className="mt-10" data-page-motion-rows="children" data-page-motion-section>
          <h2 className="text-2xl font-semibold tracking-tight" data-page-motion-trigger>Permissions and reuse</h2>
          <p className="mt-4 leading-7 text-muted-foreground">llms.txt does not replace robots.txt and does not grant permission to crawl, index, train on, reproduce, or redistribute content. Site-content use is described in the Terms &amp; Conditions. A linked repository&apos;s license governs its source code when present; otherwise, these website terms grant no code license.</p>
          <p className="mt-4">
            <Link className="inline-flex min-h-11 items-center text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" href="/terms">Read the Terms &amp; Conditions</Link>
          </p>
        </section>
      </article>
    </main>
  );
}
