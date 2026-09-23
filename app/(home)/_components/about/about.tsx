import { profile } from "@/lib/content/portfolio/server";
import { clsx } from "clsx";
import sectionStyles from "@/app/(home)/_components/section.module.scss";
import styles from "./about.module.scss";

/**
 * Renders the portfolio summary and career chapters.
 *
 * @returns The Home About section.
 */
export function HomeAbout() {
  return (
    <section id="about" aria-labelledby="about-heading" className={clsx(sectionStyles.section, "page-shell-gutter w-full")} data-page-motion-section>
      <h2
        data-page-motion-row
        data-page-motion-trigger
        id="about-heading"
        className={clsx(styles.sectionLabel, sectionStyles.label, sectionStyles.topLevelLabel, "border-t font-mono uppercase text-muted-foreground")}
      >
        About
      </h2>
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-2 lg:gap-0" data-page-motion-row>
        <div className={clsx(styles.summary, "flex flex-col text-content-foreground")}>
          {profile.summary.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </div>
        <div className={clsx(styles.careerChapters, "flex flex-col")}>
          {profile.careerChapters.map((chapter) => (
            <div className={styles.careerChapter} key={chapter.id}>
              <p className={clsx(styles.chapterMeta, "font-mono text-muted-foreground")}>
                {chapter.meta}
              </p>
              <h3 className={styles.chapterTitle}>{chapter.title}</h3>
              <p className={clsx(styles.chapterSummary, "text-content-foreground")}>
                {chapter.summary}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
