import { Github, Leetcode, Linkedin, Telegram } from "@thesvg/react";
import { clsx } from "clsx";
import { ArrowUpRight, Calendar, Mail } from "lucide-react";

import sectionStyles from "@/app/(home)/_components/section.module.scss";
import { home, profile } from "@/lib/content/portfolio/server";
import { ContactForm } from "./contact-form";
import styles from "./contact.module.scss";

const socialIcons = {
  GitHub: <Github aria-hidden="true" className="size-4 opacity-65" variant="mono" />,
  LeetCode: <Leetcode aria-hidden="true" className="size-4 opacity-65" variant="mono" />,
  LinkedIn: <Linkedin aria-hidden="true" className={clsx(styles.monochromeIcon, "size-4 opacity-65")} />,
  Telegram: <Telegram aria-hidden="true" className="size-4 opacity-65" variant="mono" />,
} as const;

/**
 * Renders the server-owned Contact section around the native mailto form.
 *
 * @returns The Home Contact section.
 */
export function HomeContact() {
  const { contact } = home;

  return (
    <section
      aria-labelledby="contact-heading"
      className={clsx(sectionStyles.section, "page-shell-gutter w-full")}
      data-page-motion-section
      id="contact"
    >
      <p
        className={clsx(
          sectionStyles.label,
          sectionStyles.topLevelLabel,
          "mb-8 border-t pt-3 font-mono uppercase text-muted-foreground lg:mb-10 lg:pt-3.5",
        )}
        data-page-motion-row
      >
        Contact
      </p>
      <div className={styles.content}>
        <div data-page-motion-row>
          <h2 className={clsx(styles.title, "m-0 font-medium tracking-tight")} data-page-motion-trigger id="contact-heading">Let&apos;s talk</h2>
          <p className={clsx(styles.description, "mt-3 max-w-md text-content-foreground lg:mt-4")}>
            {contact.description}
          </p>
          <div className={styles.links}>
            <a
              aria-label={`E-Mail: ${contact.email}`}
              className="inline-flex min-h-12 max-w-full min-w-0 items-center gap-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 lg:text-base"
              href={`mailto:${contact.email}`}
            >
              <Mail aria-hidden="true" className="size-4 opacity-65" />
              <span>E-Mail</span>
              <ArrowUpRight aria-hidden="true" className="size-3.5 opacity-45" />
            </a>
            {profile.links.map((link) => (
              <a
                className="inline-flex min-h-12 min-w-0 items-center gap-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 lg:text-base"
                href={link.href}
                key={link.href}
                rel="noreferrer"
                target="_blank"
              >
                {socialIcons[link.label as keyof typeof socialIcons]}
                {link.label}
                <ArrowUpRight aria-hidden="true" className="size-3.5 opacity-45" />
              </a>
            ))}
            <span aria-disabled="true" className="inline-flex min-h-12 min-w-0 items-center gap-2.5 text-sm text-muted-foreground opacity-35 lg:text-base">
              <Calendar aria-hidden="true" className="size-4" />
              Book a call
            </span>
          </div>
        </div>
        <ContactForm emailAddress={contact.email} />
      </div>
    </section>
  );
}
