import { Github, Leetcode, Linkedin, Telegram } from "@thesvg/react";
import { ArrowUpRight, Calendar, Mail } from "lucide-react";

import { home, profile } from "@/lib/content/portfolio/server";

const socialIcons = {
  GitHub: <Github aria-hidden="true" className="action-icon opacity-65" variant="mono" />,
  LeetCode: <Leetcode aria-hidden="true" className="action-icon opacity-65" variant="mono" />,
  LinkedIn: <Linkedin aria-hidden="true" className="action-icon opacity-65 [&_path]:fill-current" />,
  Telegram: <Telegram aria-hidden="true" className="action-icon opacity-65" variant="mono" />,
} as const;

/**
 * Renders the server-owned Contact section and direct profile links.
 *
 * @returns The Home Contact section.
 */
export function HomeContact() {
  const { contact } = home;

  return (
    <section
      aria-labelledby="contact-heading"
      className="page-shell-gutter w-full scroll-mt-3 py-8 lg:-scroll-mt-5 lg:py-12 xl:-scroll-mt-1"
      data-page-motion-section
      id="contact"
    >
      <p
        className="m-0 mb-8 border-t pt-3 font-mono text-xs leading-4.5 font-semibold tracking-[0.08em] uppercase text-muted-foreground lg:mb-10 lg:pt-3.5"
        data-page-motion-row
      >
        Contact
      </p>
      <div className="grid items-start gap-8 min-[56.25rem]:grid-cols-[minmax(0,1fr)_max-content] lg:gap-12">
        <div data-page-motion-row>
          <h2 className="m-0 text-[1.625rem] leading-[1.2] font-medium tracking-tight min-[56.25rem]:text-[2rem]" data-page-motion-trigger id="contact-heading">Let&apos;s talk</h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-pretty text-content-foreground lg:mt-4">
            {contact.description}
          </p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,max(7rem,calc(50%_-_0.75rem))),1fr))] gap-x-6 gap-y-2 min-[56.25rem]:grid-cols-[repeat(2,max-content)]" data-page-motion-row>
          <a
            aria-label={`E-Mail: ${contact.email}`}
            className="px-3 inline-flex min-h-12 max-w-full min-w-0 items-center gap-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            href={`mailto:${contact.email}`}
          >
            <Mail aria-hidden="true" className="action-icon opacity-65" />
            <span>E-Mail</span>
            <ArrowUpRight aria-hidden="true" className="ml-auto action-icon opacity-45" />
          </a>
          {profile.links.map((link) => (
            <a
              className="px-3 inline-flex min-h-12 min-w-0 items-center gap-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              href={link.href}
              key={link.href}
              rel="noreferrer"
              target="_blank"
            >
              {socialIcons[link.label as keyof typeof socialIcons]}
              {link.label}
              <ArrowUpRight aria-hidden="true" className="ml-auto action-icon opacity-45" />
            </a>
          ))}
          <span aria-disabled="true" className="px-3 inline-flex min-h-12 min-w-0 items-center gap-2.5 text-sm text-muted-foreground opacity-35">
            <Calendar aria-hidden="true" className="action-icon" />
            Book a call
            <ArrowUpRight aria-hidden="true" className="ml-auto action-icon opacity-45" />
          </span>
        </div>
      </div>
    </section>
  );
}
