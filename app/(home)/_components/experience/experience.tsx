import { ChevronRight, Navigation2 } from "lucide-react";
import Image from "next/image";
import { Subheading } from "@/app/(home)/_components/subheading";
import { profile } from "@/lib/content/portfolio/server";
import { clsx } from "clsx";
import { ExperienceItem } from "./experience-item";
import styles from "./experience.module.scss";
import { RecommendationTrack } from "./recommendation-track";

/**
 * Renders the chronological experience timeline, disclosures, and recommendations.
 *
 * @returns The Home Experience section.
 */
export function HomeExperience() {
  return (
    <section id="experience" aria-labelledby="experience-heading" className={clsx(styles.experience, "page-shell-gutter w-full scroll-mt-3 py-8 lg:-scroll-mt-5 lg:py-12 xl:-scroll-mt-1")} data-page-motion-section>
      <h2 className="m-0 mb-8 font-sans text-2xl leading-[1.12] font-semibold tracking-[-0.03em] text-balance wrap-anywhere text-foreground lg:mb-10" data-page-motion-row data-page-motion-trigger id="experience-heading">Experience</h2>
      <ol className={clsx(styles.timeline, "relative m-0 list-none p-0 pl-5.5 md:pl-0 md:[--experience-rail-width:8.75rem] xl:[--experience-rail-width:11.5rem]")}>
        {profile.experience.map((experience, index) => {
          const [periodStart, periodEnd] = experience.period.split(" — ", 2);

          return (
            <ExperienceItem className={clsx(styles.experienceItem, "relative pb-8 last:pb-0 has-[details]:cursor-pointer md:grid md:grid-cols-[var(--experience-rail-width)_minmax(0,1fr)] lg:pb-12 lg:last:pb-0")} key={`${experience.organization}-${experience.role}-${experience.period}`}>
              {index === 0 && (
                <span aria-hidden="true" className={clsx(styles.timelineDot, styles.timelineDotCurrent, "pointer-events-none z-10 size-2.25 text-[color:var(--brand-accent-text)]")} data-slot="timeline-dot">
                  <Navigation2 className="absolute top-1/2 left-1/2 size-5 -translate-1/2 fill-background" data-slot="timeline-icon" />
                </span>
              )}
              <p className={clsx(styles.experiencePeriod, "relative mb-2.5 flex flex-wrap self-start items-center gap-x-2 gap-y-1 font-mono text-xs leading-4.5 text-muted-foreground md:m-0 md:min-h-12 md:flex-col md:items-end md:justify-center md:gap-x-0 md:pr-8 md:text-right")} data-slot="experience-period" data-page-motion-item={index === 0 ? "" : undefined}>
                {index !== 0 && <span
                  aria-hidden="true"
                  className={clsx(styles.timelineDot, "size-2.25 rounded-full border border-muted-foreground bg-background transition-colors duration-150 motion-reduce:transition-none")}
                  data-slot="timeline-dot"
                />}
                <time className="whitespace-nowrap" data-slot="period-part" dateTime={experience.start}>{periodStart}</time>
                <span className="sr-only"> to </span>
                <span aria-hidden="true" className={clsx(styles.periodSeparator, "md:hidden")} data-slot="period-separator">—</span>
                {experience.end ? <time className="whitespace-nowrap" data-slot="period-part" dateTime={experience.end}>{periodEnd}</time> : <span className="whitespace-nowrap" data-slot="period-part">{periodEnd}</span>}
              </p>
              <article className="relative md:pl-8" data-page-motion-item={index === 0 ? "" : undefined}>
                <div className="flex items-center gap-3 lg:gap-3.5">
                  <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full border bg-white" data-slot="company-logo">
                    <Image alt="" className="size-full rounded-full object-contain" height={32} src={experience.logo} width={32} />
                  </span>
                  <div className="min-w-0 wrap-anywhere" data-slot="role-heading">
                    <h3 className="m-0 text-lg leading-6 font-semibold text-balance tracking-[-0.01em] text-foreground">{experience.role}</h3>
                    <p className="mt-0.75 text-xs leading-normal text-muted-foreground md:mt-1 md:text-[0.8125rem]">
                      {experience.organization}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-pretty text-content-foreground">
                  {experience.summary}
                </p>
                {experience.highlights.length > 0 && (
                  <details className={clsx(styles.roleDetails, "mt-2")}>
                    <summary aria-label={`Highlights for ${experience.role} at ${experience.organization}`} className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 font-mono text-xs leading-4.5 tracking-[0.08em] uppercase text-muted-foreground transition-colors duration-150 motion-reduce:transition-none">
                      <ChevronRight aria-hidden="true" className={clsx(styles.detailsIcon, "action-icon opacity-60 transition-transform duration-150 ease-in-out motion-reduce:transition-none")} />
                      Highlights
                    </summary>
                    <div className={clsx(styles.detailsContent, "min-h-0 overflow-hidden")} data-slot="details-content">
                      <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-content-foreground">
                        {experience.highlights.map((highlight) => <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 text-sm leading-6 before:text-muted-foreground before:content-['—']" key={highlight}>{highlight}</li>)}
                      </ul>
                    </div>
                  </details>
                )}
              </article>
            </ExperienceItem>
          );
        })}
      </ol>
      <section
        aria-labelledby="experience-recommendations-heading"
        className="mt-14 lg:mt-20"
        data-slot="experience-recommendations"
      >
        <RecommendationTrack heading={<Subheading className="min-w-0 max-w-full flex-1 basis-48" id="experience-recommendations-heading">Recommendations</Subheading>}>
          {profile.recommendations.map((recommendation) => (
            <li
              className="flex min-w-0 shrink-0 basis-[84%] snap-start md:basis-[65%] lg:basis-[48%]"
              data-page-motion-item
              key={recommendation.author}
            >
              <figure className="m-0 flex min-w-0 flex-1 flex-col">
                <blockquote className="m-0">
                  <span aria-hidden="true" className="block text-[2rem] font-bold leading-none text-border">
                    “
                  </span>
                  <p className="m-0 mt-4 text-sm leading-6 text-pretty text-content-foreground">
                    {recommendation.quote}
                  </p>
                </blockquote>
                <figcaption className="mt-auto pt-5 text-sm">
                  <span className="block text-base leading-6 font-medium" data-slot="recommendation-author">{recommendation.author}</span>
                  <span className="mt-1 block text-xs text-muted-foreground" data-slot="recommendation-position">
                    {recommendation.position}
                  </span>
                </figcaption>
              </figure>
            </li>
          ))}
        </RecommendationTrack>
      </section>
    </section>
  );
}
