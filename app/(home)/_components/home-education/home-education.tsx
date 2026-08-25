import { MapPin } from "lucide-react";
import Image from "next/image";
import { home, profile } from "@/content/structured";
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
      <a aria-label={certification.title} className={styles.certificationLink} href={certification.href}>
        <span
          aria-hidden="true"
          className={clsx(styles.certificationIcon, "grid size-14 place-items-center rounded-md border md:size-16")}
          data-slot="certification-icon"
        >
          <Image alt="" height={26} src={certification.icon} width={26} />
        </span>
      </a>
      <span className={styles.certificationTitle}>{certification.title}</span>
      <span className={clsx(styles.certificationDate, "font-mono text-muted-foreground")}>
        {certification.date}
      </span>
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
      className={clsx(styles.education, "page-shell-gutter w-full")}
    >
      <h2
        id="education-heading"
        className={clsx(styles.sectionLabel, "border-t font-mono font-normal uppercase text-muted-foreground")}
      >
        {home.education.label}
      </h2>
      <div className={styles.educationRows}>
        <div className={styles.educationRow} data-slot="education-row">
          <h3
            className={clsx(styles.rowLabel, "font-mono font-normal uppercase text-muted-foreground")}
            data-slot="education-row-label"
          >
            {home.education.degreeLabel}
          </h3>
          <div className={styles.degree} data-slot="education-row-content">
            <p className={styles.qualification}>{profile.education.qualification}</p>
            <p className={clsx(styles.institution, "text-muted-foreground")}>{profile.education.institution}</p>
            <p className={clsx(styles.location, "font-mono text-muted-foreground")}>
              <MapPin aria-hidden="true" />
              {profile.education.location}
            </p>
          </div>
        </div>

        <div className={styles.educationRow} data-slot="education-row">
          <h3
            className={clsx(styles.rowLabel, "font-mono font-normal uppercase text-muted-foreground")}
            data-slot="education-row-label"
          >
            {home.education.certificationsLabel}
          </h3>
          <ul className={styles.certificationList} data-slot="education-row-content">
            {profile.certifications.map((certification) => (
              <CertificationItem certification={certification} key={certification.title} />
            ))}
          </ul>
        </div>

      </div>
    </section>
  );
}
