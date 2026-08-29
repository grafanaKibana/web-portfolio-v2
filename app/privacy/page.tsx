import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How this personal portfolio handles analytics, performance measurements, and information sent by email.",
};

/**
 * Renders the portfolio privacy policy.
 *
 * @returns The privacy policy page.
 */
export default function PrivacyPage() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-4xl flex-1 px-6 py-12 focus:outline-none lg:py-20">
      <article className="max-w-3xl">
        <header>
          <h1 className="text-4xl font-semibold tracking-tight" data-page-motion-intro>Privacy Policy</h1>
          <p className="mt-4 font-mono text-xs text-muted-foreground" data-page-motion-intro>Last updated: August 29, 2026</p>
          <p className="mt-6 leading-7 text-muted-foreground" data-page-motion-intro>This Privacy Policy explains what information this personal portfolio uses and why.</p>
        </header>

        <section className="mt-10" data-page-motion-rows="children" data-page-motion-section>
          <h2 className="text-2xl font-semibold tracking-tight" data-page-motion-trigger>Analytics and performance</h2>
          <p className="mt-4 leading-7 text-muted-foreground">
            This site uses Vercel Web Analytics to understand aggregated page traffic. Vercel documents Web Analytics as cookie-free and says it may process the visited page, filtered query parameters, referrer, approximate location, browser, operating system, device type, and event time. Vercel also says its visitor identifier changes daily and is not used to track people across days or websites.
          </p>
          <p className="mt-4">
            <a className="inline-flex min-h-11 items-center text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" href="https://vercel.com/docs/analytics/privacy-policy">
              Vercel Web Analytics privacy information
            </a>
          </p>
          <p className="mt-4 leading-7 text-muted-foreground">
            This site also uses Vercel Speed Insights to measure real-user performance through browser Web Vitals. Vercel documents information such as the visited route, network type, browser, device, operating system, country, Web Vital values and attribution, SDK version, and event time. Vercel says Speed Insights does not store information that can reconstruct a browsing session or identify a visitor or IP address.
          </p>
          <p className="mt-4">
            <a className="inline-flex min-h-11 items-center text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" href="https://vercel.com/docs/speed-insights/privacy-policy">
              Vercel Speed Insights privacy information
            </a>
          </p>
          <p className="mt-4 leading-7 text-muted-foreground">
            This site also uses Google Search Console to understand how it appears in Google Search. Search Console provides aggregated information such as search queries, impressions, clicks, page URLs, countries, and device types. It does not add its own analytics script or cookies to this site. Google processes the underlying Google Search activity under its own privacy terms.
          </p>
          <p className="mt-4">
            <a className="inline-flex min-h-11 items-center text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" href="https://support.google.com/webmasters/answer/10268906?hl=en">
              Google Search Console information
            </a>
          </p>
        </section>

        <section className="mt-10" data-page-motion-rows="children" data-page-motion-section>
          <h2 className="text-2xl font-semibold tracking-tight" data-page-motion-trigger>Contact by email</h2>
          <p className="mt-4 leading-7 text-muted-foreground">The contact form does not submit information to a portfolio server. Its fields stay in your browser until you choose to open your email application. If you then send the message, your email provider and mine handle the information you include as ordinary email.</p>
          <p className="mt-4 leading-7 text-muted-foreground">
            You can also email me directly at{" "}
            <a className="underline underline-offset-4 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" href="mailto:reshetnik.nikita@gmail.com">reshetnik.nikita@gmail.com</a>.
          </p>
        </section>

        <section className="mt-10" data-page-motion-rows="children" data-page-motion-section>
          <h2 className="text-2xl font-semibold tracking-tight" data-page-motion-trigger>External links</h2>
          <p className="mt-4 leading-7 text-muted-foreground">This portfolio links to third-party websites and services. Their own privacy notices apply when you visit them.</p>
        </section>

        <section className="mt-10" data-page-motion-rows="children" data-page-motion-section>
          <h2 className="text-2xl font-semibold tracking-tight" data-page-motion-trigger>Questions and changes</h2>
          <p className="mt-4 leading-7 text-muted-foreground">
            Questions about this policy can be sent to{" "}
            <a className="underline underline-offset-4 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" href="mailto:reshetnik.nikita@gmail.com">reshetnik.nikita@gmail.com</a>. Material changes will be published on this page with a revised last-updated date.
          </p>
        </section>
      </article>
    </main>
  );
}
