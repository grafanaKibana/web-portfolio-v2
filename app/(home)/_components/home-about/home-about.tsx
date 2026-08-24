import { profile } from "@/content/structured";
import { clsx } from "clsx";
import styles from "./home-about.module.scss";

/**
 * Renders the portfolio summary, career chapters, and profile facts.
 *
 * @returns The Home About section.
 */
export function HomeAbout() {
  return (
    <section id="about" aria-labelledby="about-heading" className={clsx(styles.about, "page-shell-gutter w-full")}>
      <h2
        id="about-heading"
        className={clsx(styles.sectionLabel, "border-t font-mono font-normal uppercase text-muted-foreground")}
      >
        <span aria-hidden="true">01 — </span>About
      </h2>
      <div className={styles.aboutContent}>
        <div className={styles.summary}>
          {profile.summary.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </div>
        <div className={styles.careerChapters}>
          {profile.careerChapters.map((chapter) => (
            <div className={styles.careerChapter} key={chapter.title}>
              <p className={clsx(styles.chapterMeta, "font-mono text-muted-foreground")}>
                {chapter.meta}
              </p>
              <h3 className={styles.chapterTitle}>{chapter.title}</h3>
              <p className={clsx(styles.chapterSummary, "text-muted-foreground")}>
                {chapter.summary}
              </p>
            </div>
          ))}
        </div>
      </div>
      <dl className={clsx(styles.facts, "border-t")}>
        {profile.facts.map((fact) => (
          <div key={fact.label}>
            <dt className={clsx(styles.factLabel, "font-mono uppercase text-muted-foreground")}>
              {fact.label}
            </dt>
            <dd className={styles.factValue}>{fact.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
