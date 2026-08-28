import { ChevronRight } from "lucide-react";
import Image from "next/image";
import { profile } from "@/content/structured";
import { clsx } from "clsx";
import styles from "./home-experience.module.scss";

/**
 * Renders the chronological experience timeline and native disclosures.
 *
 * @returns The Home Experience section.
 */
export function HomeExperience() {
  return (
    <section id="experience" aria-labelledby="experience-heading" className={clsx(styles.experience, "page-shell-gutter w-full")} data-page-motion-section>
      <div className={clsx(styles.experienceHeader, "border-t font-mono uppercase text-muted-foreground")} data-page-motion-row>
        <h2 data-page-motion-trigger id="experience-heading">Experience</h2>
      </div>
      <ol className={clsx(styles.timeline, "relative m-0 list-none p-0 pl-5.5 md:pl-0")}>
        {profile.experience.map((experience, index) => {
          const [periodStart, periodEnd] = experience.period.split(" — ", 2);

          return (
            <li className={clsx(styles.experienceItem, "relative pb-10 last:pb-0 md:grid md:pb-14")} data-page-motion-row key={`${experience.organization}-${experience.role}-${experience.period}`}>
              <p className={clsx(styles.experiencePeriod, "relative mb-2.5 flex self-start items-center gap-x-2 font-mono text-muted-foreground md:m-0 md:min-h-12 md:flex-col md:items-end md:justify-center md:gap-0 md:pr-8 md:text-right")} data-slot="experience-period">
                <span
                  aria-hidden="true"
                  className={clsx(styles.timelineDot, index === 0 && styles.timelineDotCurrent)}
                  data-slot="timeline-dot"
                />
                <span className="whitespace-nowrap" data-slot="period-part">{periodStart}</span>
                <span aria-hidden="true" className={clsx(styles.periodSeparator, "md:hidden")} data-slot="period-separator">—</span>
                <span className="whitespace-nowrap" data-slot="period-part">{periodEnd}</span>
              </p>
              <article className="relative md:pl-8">
                <div className="flex items-center gap-3 lg:gap-3.5">
                  <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full border bg-white" data-slot="company-logo">
                    <Image alt="" className="size-full rounded-full object-contain" height={32} src={experience.logo} width={32} />
                  </span>
                  <div data-slot="role-heading">
                    <h3 className={clsx(styles.roleTitle, "m-0 font-semibold")}>{experience.role}</h3>
                    <p className={clsx(styles.organization, "mt-0.75 text-muted-foreground md:mt-1")}>
                      {experience.organization}
                    </p>
                  </div>
                </div>
                <p className={clsx(styles.roleSummary, "mt-3 text-muted-foreground md:mt-4")}>
                  {experience.summary}
                </p>
                {experience.highlights.length > 0 && (
                  <details className={clsx(styles.roleDetails, "mt-2.5 md:mt-3")}>
                    <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 font-mono uppercase text-muted-foreground">
                      <ChevronRight aria-hidden="true" className={styles.detailsIcon} />
                      Details
                    </summary>
                    <div className={styles.detailsContent} data-slot="details-content">
                      <ul className="m-0 flex list-none flex-col gap-3 pt-3 md:pt-4">
                        {experience.highlights.map((highlight) => <li className="gap-3" key={highlight}>{highlight}</li>)}
                      </ul>
                    </div>
                  </details>
                )}
              </article>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
