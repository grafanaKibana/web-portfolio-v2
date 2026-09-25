import { profile } from "@/lib/content/portfolio/server";

/**
 * Renders the portfolio summary and career chapters.
 *
 * @returns The Home About section.
 */
export function HomeAbout() {
  return (
    <section id="about" aria-labelledby="about-heading" className="page-shell-gutter w-full scroll-mt-3 py-8 lg:-scroll-mt-5 lg:py-12 xl:-scroll-mt-1" data-page-motion-section>
      <h2
        data-page-motion-row
        data-page-motion-trigger
        id="about-heading"
        className="m-0 mb-8 border-t pt-3 font-mono text-xs leading-4.5 font-semibold tracking-[0.08em] uppercase text-muted-foreground lg:mb-10 lg:pt-3.5"
      >
        About
      </h2>
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-2 lg:gap-0" data-page-motion-row>
        <div className="flex flex-col gap-4 text-content-foreground lg:pr-8">
          {profile.summary.map((paragraph) => <p className="m-0 text-sm leading-6" key={paragraph}>{paragraph}</p>)}
        </div>
        <div className="flex flex-col gap-8 lg:gap-12 lg:border-l lg:pl-8">
          {profile.careerChapters.map((chapter) => (
            <div key={chapter.id}>
              <p className="m-0 font-mono text-xs leading-4.5 text-muted-foreground">
                {chapter.meta}
              </p>
              <h3 className="m-0 mt-2 text-lg leading-6 font-semibold tracking-[-0.01em]">{chapter.title}</h3>
              <p className="m-0 mt-2 text-sm leading-6 text-content-foreground">
                {chapter.summary}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
