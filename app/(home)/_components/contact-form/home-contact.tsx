import { Github, Leetcode, Linkedin, Telegram } from "@thesvg/react";
import { clsx } from "clsx";
import { ArrowUpRight, Calendar, Mail } from "lucide-react";

import { home, profile } from "@/content/structured";
import { ContactForm } from "./contact-form";
import styles from "./home-contact.module.scss";

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
      className="page-shell-gutter w-full scroll-mt-1 py-14 pb-18 lg:-scroll-mt-11 lg:py-26 lg:pb-30 xl:-scroll-mt-7"
      data-page-motion-section
      id="contact"
    >
      <p className={clsx(styles.sectionLabel, "mb-7 border-t pt-3 font-mono font-normal uppercase text-muted-foreground lg:mb-14 lg:pt-3.5")} data-page-motion-row>
        Contact
      </p>
      <div className={clsx(styles.content, "grid gap-12")}>
        <div data-page-motion-row>
          <h2 className={clsx(styles.title, "m-0 font-medium tracking-tight")} data-page-motion-trigger id="contact-heading">Let&apos;s talk</h2>
          <p className={clsx(styles.description, "mt-3 max-w-md leading-relaxed text-muted-foreground lg:mt-4")}>
            {contact.description}
          </p>
          <div className="mt-7 flex flex-col lg:mt-8">
            <a
              className="inline-flex min-h-12 max-w-full min-w-0 w-fit items-center gap-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 lg:text-base"
              href={`mailto:${contact.email}`}
            >
              <Mail aria-hidden="true" className="size-4 opacity-65" />
              <span className="min-w-0 break-all">{contact.email}</span>
              <ArrowUpRight aria-hidden="true" className="size-3.5 opacity-45" />
            </a>
            {profile.links.map((link) => (
              <a
                className="inline-flex min-h-12 w-fit items-center gap-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 lg:text-base"
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
            <span aria-disabled="true" className="inline-flex min-h-12 w-fit items-center gap-2.5 text-sm text-muted-foreground opacity-35 lg:text-base">
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
