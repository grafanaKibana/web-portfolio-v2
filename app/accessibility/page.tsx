import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Accessibility",
  description: "Accessibility measures, current assessment status, known limitations, and feedback contact for this portfolio.",
};

/**
 * Renders the portfolio accessibility statement.
 *
 * @returns The accessibility statement page.
 */
export default function AccessibilityPage() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-4xl flex-1 px-6 py-12 focus:outline-none lg:py-20">
      <article className="max-w-3xl">
        <header>
          <h1 className="text-4xl font-semibold tracking-tight" data-page-motion-intro>Accessibility</h1>
          <p className="mt-4 font-mono text-xs text-muted-foreground" data-page-motion-intro>Last updated: August 29, 2026</p>
          <p className="mt-6 leading-7 text-muted-foreground" data-page-motion-intro>I aim to make this portfolio usable across devices, input methods, themes, and motion preferences.</p>
        </header>

        <section className="mt-10" data-page-motion-rows="children" data-page-motion-section>
          <h2 className="text-2xl font-semibold tracking-tight" data-page-motion-trigger>Measures used</h2>
          <p className="mt-4 leading-7 text-muted-foreground">The site currently includes:</p>
          <ul className="mt-4 list-disc space-y-2 pl-6 leading-7 text-muted-foreground">
            <li>semantic landmarks and ordered headings;</li>
            <li>keyboard-operable navigation and visible focus indicators;</li>
            <li>responsive text reflow and readable content widths;</li>
            <li>light and dark themes covered by automated contrast checks;</li>
            <li>reduced-motion behavior for animated features; and</li>
            <li>server-rendered content and useful no-JavaScript fallbacks.</li>
          </ul>
        </section>

        <section className="mt-10" data-page-motion-rows="children" data-page-motion-section>
          <h2 className="text-2xl font-semibold tracking-tight" data-page-motion-trigger>Conformance status</h2>
          <p className="mt-4 leading-7 text-muted-foreground">WCAG 2.2 Level AA is a design target for this site. The site has not completed a formal WCAG conformance assessment, and no conformance claim is made.</p>
          <p className="mt-4">
            <a className="inline-flex min-h-11 items-center text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" href="https://www.w3.org/WAI/planning/statements/">
              W3C guidance on accessibility statements
            </a>
          </p>
        </section>

        <section className="mt-10" data-page-motion-rows="children" data-page-motion-section>
          <h2 className="text-2xl font-semibold tracking-tight" data-page-motion-trigger>Known limitations</h2>
          <p className="mt-4 leading-7 text-muted-foreground">Some long code examples scroll horizontally within their own containers. Accessibility of third-party websites linked from this portfolio is outside my control. Other issues may still exist because the site has not received a formal accessibility audit.</p>
        </section>

        <section className="mt-10" data-page-motion-rows="children" data-page-motion-section>
          <h2 className="text-2xl font-semibold tracking-tight" data-page-motion-trigger>Feedback</h2>
          <p className="mt-4 leading-7 text-muted-foreground">
            If you encounter an accessibility problem, email{" "}
            <a className="underline underline-offset-4 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" href="mailto:reshetnik.nikita@gmail.com">reshetnik.nikita@gmail.com</a> and include the page, the problem, and the browser or assistive technology you were using.
          </p>
        </section>
      </article>
    </main>
  );
}
