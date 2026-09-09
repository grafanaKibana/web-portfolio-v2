import { MapPin } from "lucide-react";
import { profile } from "@/content/structured";
import { clsx } from "clsx";
import styles from "./home-education.module.scss";

type Certification = (typeof profile.certifications)[number];

/**
 * Renders one validated certification with its credential destination.
 *
 * @param certification - Validated certification content.
 * @returns A certification list item.
 */
function CertificationItem({ certification }: { certification: Certification }) {
  return (
    <li data-slot="certification">
      <a
        aria-label={certification.title}
        className={clsx(styles.certificationLink, "group flex h-full w-full flex-col items-center rounded-md text-center text-inherit no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4")}
        href={certification.href}
      >
        <span
          aria-hidden="true"
          className="grid size-14 place-items-center text-content-foreground transition-colors group-hover:text-foreground group-focus-visible:text-foreground motion-reduce:transition-none md:size-16"
          data-slot="certification-icon"
        >
          <span
            className={clsx(styles.certificationGlyph, "block size-9 bg-current [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] md:size-10")}
            data-icon={certification.icon}
          />
        </span>
        <span className={styles.certificationTitle}>{certification.title}</span>
        <span className={clsx(styles.certificationDate, "font-mono text-muted-foreground")}>
          {certification.date}
        </span>
      </a>
    </li>
  );
}

/**
 * Renders validated education and certification facts.
 *
 * @returns The Home Education section.
 */
export function HomeEducation() {
  return (
    <section
      id="education"
      aria-labelledby="education-heading"
      className="home-section page-shell-gutter w-full"
      data-page-motion-section
    >
      <h2
        data-page-motion-row
        data-page-motion-trigger
        id="education-heading"
        className={clsx(styles.sectionLabel, "text-section-label border-t font-mono font-normal uppercase text-muted-foreground")}
      >
        Education
      </h2>
      <div className={clsx(styles.educationRows, "flex flex-col gap-11 md:gap-16 lg:gap-20")}>
        <div className={clsx(styles.educationRow, "flex flex-col gap-4 md:grid md:gap-0")} data-page-motion-row data-slot="education-row">
          <h3
            className={clsx(styles.rowLabel, "font-mono font-normal uppercase text-muted-foreground")}
            data-slot="education-row-label"
          >
            University degree
          </h3>
          <div data-slot="education-row-content">
            <p className={clsx(styles.qualification, "m-0 font-semibold")}>{profile.education.qualification}</p>
            <p className={clsx(styles.institution, "text-content-foreground")}>{profile.education.institution}</p>
            <p className={clsx(styles.location, "flex items-center font-mono text-muted-foreground")}>
              <MapPin aria-hidden="true" />
              {profile.education.location}
            </p>
          </div>
        </div>

        <div className={clsx(styles.educationRow, "flex flex-col gap-4 md:grid md:gap-0")} data-page-motion-row data-slot="education-row">
          <h3
            className={clsx(styles.rowLabel, "font-mono font-normal uppercase text-muted-foreground")}
            data-slot="education-row-label"
          >
            Industry certifications
          </h3>
          <ul
            className={clsx(styles.certificationList, "m-0 grid list-none grid-cols-2 gap-8 p-0 md:gap-16")}
            data-slot="education-row-content"
          >
            {profile.certifications.map((certification) => (
              <CertificationItem certification={certification} key={certification.title} />
            ))}
          </ul>
        </div>

      </div>
    </section>
  );
}
