import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "Terms for using this personal portfolio and understanding source-code rights in linked repositories.",
};

/**
 * Renders the terms for using the portfolio.
 *
 * @returns The terms and conditions page.
 */
export default function TermsPage() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-4xl flex-1 px-6 py-12 focus:outline-none lg:py-20">
      <article className="max-w-3xl">
        <header>
          <h1 className="text-4xl font-semibold tracking-tight" data-page-motion-intro>Terms &amp; Conditions</h1>
          <p className="mt-4 font-mono text-xs text-muted-foreground" data-page-motion-intro>Last updated: August 29, 2026</p>
          <p className="mt-6 leading-7 text-muted-foreground" data-page-motion-intro>These terms describe how this personal portfolio and its public content may be used.</p>
        </header>

        <section className="mt-10" data-page-motion-rows="children" data-page-motion-section>
          <h2 className="text-2xl font-semibold tracking-tight" data-page-motion-trigger>Site purpose</h2>
          <p className="mt-4 leading-7 text-muted-foreground">The site presents professional experience, projects, articles, and contact information for general informational and professional-reference purposes.</p>
        </section>

        <section className="mt-10" data-page-motion-rows="children" data-page-motion-section>
          <h2 className="text-2xl font-semibold tracking-tight" data-page-motion-trigger>Content and code</h2>
          <p className="mt-4 leading-7 text-muted-foreground">Unless a page says otherwise, the original text and articles on this site are © Nikita Reshetnik. All rights reserved. You may view and link to public pages, but the site grants no broader license to reproduce, adapt, or redistribute its content.</p>
          <p className="mt-4 leading-7 text-muted-foreground">When a linked repository includes a license, that license governs its source code. If it does not, these website terms grant no license to that code.</p>
        </section>

        <section className="mt-10" data-page-motion-rows="children" data-page-motion-section>
          <h2 className="text-2xl font-semibold tracking-tight" data-page-motion-trigger>Accuracy and external links</h2>
          <p className="mt-4 leading-7 text-muted-foreground">I aim to keep the portfolio accurate, but older articles, project details, and external destinations may change over time. Third-party websites are controlled by their respective owners and operate under their own terms.</p>
        </section>

        <section className="mt-10" data-page-motion-rows="children" data-page-motion-section>
          <h2 className="text-2xl font-semibold tracking-tight" data-page-motion-trigger>Contact</h2>
          <p className="mt-4 leading-7 text-muted-foreground">
            Questions about these terms can be sent to{" "}
            <a className="underline underline-offset-4 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" href="mailto:reshetnik.nikita@gmail.com">reshetnik.nikita@gmail.com</a>.
          </p>
        </section>
      </article>
    </main>
  );
}
