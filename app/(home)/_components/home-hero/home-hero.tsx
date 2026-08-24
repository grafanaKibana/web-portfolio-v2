import { ArrowDown, Download, type LucideIcon } from "lucide-react";
import { home } from "@/content/structured";
import { clsx } from "clsx";
import { DescriptorRotation } from "../descriptor-rotation/descriptor-rotation";
import styles from "./home-hero.module.scss";

const icons: Record<string, LucideIcon> = {
  "arrow-down": ArrowDown,
  download: Download,
};

const brandPaths: Record<string, string> = {
  linkedin: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  telegram: "M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z",
  github: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
  leetcode: "M13.483 0a1.374 1.374 0 0 0-.961.438L7.116 6.226l-3.854 4.126a5.266 5.266 0 0 0-1.209 2.104 5.35 5.35 0 0 0-.125.513 5.527 5.527 0 0 0 .062 2.362 5.83 5.83 0 0 0 .349 1.017 5.938 5.938 0 0 0 1.271 1.818l4.277 4.193.039.038c2.248 2.165 5.852 2.133 8.063-.074l2.396-2.392c.54-.54.54-1.414.003-1.955a1.378 1.378 0 0 0-1.951-.003l-2.396 2.392a3.021 3.021 0 0 1-4.205.038l-.02-.019-4.276-4.193c-.652-.64-.972-1.469-.948-2.263a2.68 2.68 0 0 1 .066-.523 2.545 2.545 0 0 1 .619-1.164L9.13 8.114c1.058-1.134 3.204-1.27 4.43-.278l3.501 2.831c.593.48 1.461.387 1.94-.207a1.384 1.384 0 0 0-.207-1.943l-3.5-2.831c-.8-.647-1.766-1.045-2.774-1.202l2.015-2.158A1.384 1.384 0 0 0 13.483 0zm-2.866 12.815a1.38 1.38 0 0 0-1.38 1.382 1.38 1.38 0 0 0 1.38 1.382H20.79a1.38 1.38 0 0 0 1.38-1.382 1.38 1.38 0 0 0-1.38-1.382z",
};

/**
 * Resolves one YAML icon key through the Home Hero allowlist.
 *
 * @param name - YAML icon identifier.
 * @param className - Optional classes applied to the icon.
 * @returns The matching decorative icon.
 * @throws When YAML contains an unsupported icon identifier.
 */
function Icon({ name, className }: { name: string; className?: string }) {
  const path = brandPaths[name];
  if (path) {
    return (
      <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
        <path d={path} />
      </svg>
    );
  }
  const Component = icons[name];
  if (!Component) throw new Error(`Unknown portfolio icon: ${name}`);
  return <Component aria-hidden="true" className={className} />;
}

/**
 * Renders the portfolio introduction, actions, and social links.
 *
 * @returns The Home Hero section.
 */
export function HomeHero() {
  const [primaryAction, secondaryAction] = home.hero.actions;
  if (!primaryAction || !secondaryAction) {
    throw new Error("Home Hero requires exactly two actions");
  }

  return (
    <section
      aria-labelledby="intro-heading"
      className={clsx(styles.hero, "page-shell-gutter box-border flex w-full flex-col items-center justify-center pt-8 text-center")}
    >
      <div className={clsx(styles.availability, "inline-flex items-center rounded-full py-1.5 text-xs font-medium")}>
        <span
          aria-hidden="true"
          className={clsx(styles.availabilityDot, "size-1.5 animate-pulse rounded-full motion-reduce:animate-none")}
          data-slot="availability-dot"
        />
        {home.hero.availability.status}
        <span className="font-normal text-muted-foreground">
          {home.hero.availability.qualifier}
        </span>
      </div>
      <h1 id="intro-heading" className={clsx(styles.heading, "m-0 font-medium")}>
        <span className="block whitespace-nowrap">{home.hero.title}</span>
        <span className="block whitespace-nowrap text-muted-foreground">{home.hero.lead}</span>
      </h1>
      <div className={clsx(styles.descriptorSlot, "flex items-center justify-center")}>
        <DescriptorRotation
          descriptors={home.hero.descriptors}
          interval={home.hero.descriptorInterval}
        />
      </div>
      <div className={clsx(styles.actions, "flex w-full flex-col lg:w-auto lg:flex-row lg:items-center")}>
        <a
          className={clsx(styles.action, "inline-flex w-full items-center justify-center gap-2 rounded-md border border-transparent bg-primary font-medium text-primary-foreground hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 lg:w-auto lg:px-4 lg:leading-5")}
          download
          href={primaryAction.href}
        >
          <Icon name={primaryAction.icon} className={clsx(styles.primaryActionIcon)} />
          {primaryAction.label}
        </a>
        <a
          className={clsx(styles.action, "group mt-1.5 inline-flex w-full items-center justify-center gap-2 rounded-md font-medium transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 lg:mt-0 lg:w-auto")}
          href={secondaryAction.href}
        >
          {secondaryAction.label}
          <Icon
            name={secondaryAction.icon}
            className="-order-1 size-3.5 opacity-60 transition-transform duration-150 group-hover:translate-y-0.5 motion-reduce:group-hover:translate-none motion-reduce:transition-none lg:order-none"
          />
        </a>
      </div>
      <ul className={clsx(styles.socialLinks, "desktop-link-row-gap grid w-full grid-cols-2 justify-items-center gap-x-1 gap-y-1 sm:flex sm:flex-wrap sm:justify-center sm:gap-y-0 lg:w-auto")}>
        {home.hero.socialLinks.map((link) => (
          <li key={link.href}>
            <a
              className="text-ui-xs inline-flex min-h-11 items-center gap-2 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              href={link.href}
            >
              <Icon name={link.icon} className="size-3.5 opacity-65" />
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
