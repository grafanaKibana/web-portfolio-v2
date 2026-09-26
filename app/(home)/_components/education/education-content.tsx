import { clsx } from "clsx";
import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import type { CSSProperties } from "react";
import type { PortfolioProfile } from "@/lib/content/portfolio/validation";
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
    <li className="min-w-0 border-b last:border-b-0" data-slot="credential-item">
      <a
        aria-label={`Verify credential: ${certification.title}`}
        className="group flex min-h-16.5 w-full min-w-0 items-center gap-3 py-3 text-content-foreground no-underline transition-colors duration-150 ease-in-out hover:text-foreground focus-visible:rounded focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
        href={certification.href}
      >
        <span aria-hidden="true" className="grid size-10.5 shrink-0 place-items-center" data-slot="credential-mark">
          {certification.badge ? (
            <Image
              alt=""
              className="size-10.5 object-contain"
              data-slot="credential-badge"
              height={42}
              src={certification.badge}
              width={42}
            />
          ) : (
            // eslint-disable-next-line react/forbid-dom-props -- The validated local icon URL is dynamic and cannot live in a static CSS Module.
            <span className={clsx(styles.credentialIcon, "block size-9")} data-slot="credential-icon" style={iconStyle} />
          )}
        </span>
        <span className="block min-w-0">
          <span className="block text-base leading-6 font-medium text-foreground wrap-anywhere" data-slot="credential-title">{certification.title}</span>
          <span className="mt-1.25 block font-mono text-xs leading-4.5 text-muted-foreground" data-slot="credential-date">{certification.date}</span>
        </span>
        <span
          aria-hidden="true"
          className="ml-auto grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors duration-150 group-hover:text-foreground group-focus-visible:text-foreground motion-reduce:transition-none"
          data-slot="credential-link-cue"
        >
          <ArrowUpRight className="action-icon" />
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
      className="page-shell-gutter w-full scroll-mt-3 py-8 lg:-scroll-mt-5 lg:py-12 xl:-scroll-mt-1"
      data-page-motion-section
      id="education"
    >
      <h2
        className="m-0 mb-8 font-sans text-2xl leading-[1.12] font-semibold tracking-[-0.03em] text-balance wrap-anywhere text-foreground lg:mb-10"
        data-page-motion-row
        data-page-motion-trigger
        id="education-heading"
      >
        Education
      </h2>
      <div
        className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:data-[has-credentials=true]:grid-cols-[minmax(0,1fr)_fit-content(55%)] lg:data-[has-credentials=true]:gap-x-12"
        data-has-credentials={hasCredentials}
        data-slot="education-tracks"
      >
        <div className="min-w-0" data-page-motion-row data-slot="education-academic">
          <Subheading className="mb-6">Academic</Subheading>
          <p className="m-0 text-base leading-6 font-medium text-foreground">{education.qualification}</p>
          <p className="m-0 mt-3 text-sm leading-[1.6] text-pretty text-content-foreground">{education.institution}</p>
          <p className="m-0 mt-4 font-mono text-xs leading-4.5 text-muted-foreground">{education.period}</p>
        </div>

        {hasCredentials && (
          <div className="flex min-h-0 min-w-0 flex-col" data-page-motion-row data-slot="education-credentials">
            <Subheading className="mb-3">Professional credentials</Subheading>
            <div className="min-w-0 flex-none">
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
