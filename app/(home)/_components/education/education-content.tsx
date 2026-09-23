import { clsx } from "clsx";
import { MapPin } from "lucide-react";
import Image from "next/image";
import type { CSSProperties } from "react";
import type { PortfolioProfile } from "@/lib/content/portfolio/validation";
import sectionStyles from "../section.module.scss";
import { Subheading } from "../subheading";
import { CredentialTrack } from "./credential-track";
import styles from "./education.module.scss";

type Certification = PortfolioProfile["certifications"][number];

/**
 * Renders one validated credential as a full-row verification link.
 *
 * @param certification - Credential and its local visual asset.
 * @returns A credential list item.
 */
function CertificationItem({ certification }: { certification: Certification }) {
  const iconStyle = certification.icon
    ? { "--credential-icon-url": `url("${certification.icon}")` } as CSSProperties
    : undefined;

  return (
    <li className={styles.credentialItem} data-slot="credential-item">
      <a aria-label={certification.title} className={styles.credentialLink} href={certification.href}>
        <span aria-hidden="true" className={styles.credentialMark} data-slot="credential-mark">
          {certification.badge ? (
            <Image
              alt=""
              className={styles.credentialBadge}
              data-slot="credential-badge"
              height={42}
              src={certification.badge}
              width={42}
            />
          ) : (
            // eslint-disable-next-line react/forbid-dom-props -- The validated local icon URL is dynamic and cannot live in a static CSS Module.
            <span className={styles.credentialIcon} data-slot="credential-icon" style={iconStyle} />
          )}
        </span>
        <span className={styles.credentialCopy}>
          <span className={styles.credentialTitle}>{certification.title}</span>
          <span className={styles.credentialDate}>{certification.date}</span>
        </span>
      </a>
    </li>
  );
}

/**
 * Renders the Education composition from validated or synthetic content.
 *
 * @param education - Degree facts.
 * @param certifications - Credentials in source order.
 * @returns The Home Education section.
 */
export function EducationContent({
  education,
  certifications,
}: Pick<PortfolioProfile, "education" | "certifications">) {
  const hasCredentials = certifications.length > 0;

  return (
    <section
      aria-labelledby="education-heading"
      className={clsx(sectionStyles.section, "page-shell-gutter w-full")}
      data-page-motion-section
      id="education"
    >
      <h2
        className={clsx(styles.sectionLabel, sectionStyles.label, sectionStyles.topLevelLabel, "border-t font-mono uppercase text-muted-foreground")}
        data-page-motion-row
        data-page-motion-trigger
        id="education-heading"
      >
        Education
      </h2>
      <div className={clsx(styles.tracks, !hasCredentials && styles.academicOnly)} data-slot="education-tracks">
        <div className={styles.academic} data-page-motion-row data-slot="education-academic">
          <Subheading className="mb-6">Academic</Subheading>
          <p className={styles.qualification}>{education.qualification}</p>
          <p className={styles.institution}>{education.institution}</p>
          <p className={styles.academicMeta}>
            <span>{education.period}</span>
            <span aria-hidden="true">·</span>
            <MapPin aria-hidden="true" />
            <span>{education.location}</span>
          </p>
        </div>

        {hasCredentials && (
          <div className={styles.credentials} data-page-motion-row data-slot="education-credentials">
            <Subheading className="mb-5">Professional credentials</Subheading>
            <div className={styles.credentialFrame}>
              <CredentialTrack potentialOverflow={certifications.length > 2} singleColumn={certifications.length <= 2}>
                {certifications.map((certification) => (
                  <CertificationItem certification={certification} key={`${certification.title}:${certification.href}`} />
                ))}
              </CredentialTrack>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
