import { ChevronRight } from "lucide-react";
import Image from "next/image";
import { home, profile } from "@/content/structured";
import { clsx } from "clsx";
import styles from "./home-experience.module.scss";

/**
 * Renders the chronological experience timeline and native disclosures.
 *
 * @returns The Home Experience section.
 */
export function HomeExperience() {
  return (
    <section id="experience" aria-labelledby="experience-heading" className={clsx(styles.experience, "page-shell-gutter w-full")}>
      <div className={clsx(styles.experienceHeader, "border-t font-mono uppercase text-muted-foreground")}>
        <h2 id="experience-heading">
          <span aria-hidden="true">{home.experience.sectionNumber} — </span>
          {home.experience.label}
        </h2>
        <p>{home.experience.range}</p>
      </div>
      <ol className={styles.timeline}>
        {profile.experience.map((experience, index) => {
          const [periodStart, periodEnd] = experience.period.split(" — ", 2);

          return (
            <li className={styles.experienceItem} key={`${experience.organization}-${experience.role}-${experience.period}`}>
              <p className={clsx(styles.experiencePeriod, "self-start font-mono text-muted-foreground")} data-slot="experience-period">
                <span
                  aria-hidden="true"
                  className={clsx(styles.timelineDot, index === 0 && styles.timelineDotCurrent)}
                  data-slot="timeline-dot"
                />
                <span className={styles.periodPart} data-slot="period-part">{periodStart}</span>
                <span aria-hidden="true" className={styles.periodSeparator} data-slot="period-separator">—</span>
                <span className={styles.periodPart} data-slot="period-part">{periodEnd}</span>
              </p>
              <article className={styles.experienceBody}>
                <div className="flex items-center gap-3 lg:gap-3.5">
                  <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full border bg-white" data-slot="company-logo">
                    <Image alt="" className="size-full rounded-full object-contain" height={32} src={experience.logo} width={32} />
                  </span>
                  <div data-slot="role-heading">
                    <h3 className={styles.roleTitle}>{experience.role}</h3>
                    <p className={clsx(styles.organization, "text-muted-foreground")}>
                      {experience.organization}
                    </p>
                  </div>
                </div>
                <p className={clsx(styles.roleSummary, "text-muted-foreground")}>
                  {experience.summary}
                </p>
                {experience.highlights.length > 0 && (
                  <details className={styles.roleDetails}>
                    <summary className="font-mono uppercase text-muted-foreground">
                      <ChevronRight aria-hidden="true" className={styles.detailsIcon} />
                      {home.experience.detailsLabel}
                    </summary>
                    <div className={styles.detailsContent} data-slot="details-content">
                      <ul className={styles.highlights}>
                        {experience.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}
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
