import {
  type LucideIcon,
  TelescopeIcon,
  MailIcon,
  ArrowBigDownDashIcon
} from "lucide-react";
import { home } from "@/lib/content/portfolio/server";
import { buttonVariants } from "@/components/ui/button";
import { clsx } from "clsx";
import { DescriptorRotation } from "./descriptor-rotation/descriptor-rotation";
import styles from "./hero.module.scss";

const icons: Record<string, LucideIcon> = {
  contact: MailIcon,
  download: ArrowBigDownDashIcon,
  experience: TelescopeIcon,
};

/**
 * Resolves one Home Hero icon key through the local allowlist.
 *
 * @param name - Local icon identifier.
 * @returns The matching decorative icon.
 * @throws When local markup requests an unsupported icon identifier.
 */
function Icon({ name }: { name: string }) {
  const Component = icons[name];
  if (!Component) throw new Error(`Unknown portfolio icon: ${name}`);
  return <Component aria-hidden="true" />;
}

/**
 * Renders the portfolio introduction and primary contact and résumé actions.
 *
 * @returns The Home Hero section.
 */
export function HomeHero() {
  return (
    <section
      aria-labelledby="intro-heading"
      className={clsx(styles.hero, "page-shell-gutter box-border flex w-full flex-col items-center justify-center pt-8 text-center")}
    >
      <div className={clsx(styles.availability, "inline-flex items-center rounded-full py-1.5 text-xs font-medium")} data-page-motion-intro>
        <span
          aria-hidden="true"
          className={clsx(styles.availabilityDot, "size-1.5 animate-pulse rounded-full motion-reduce:animate-none")}
          data-slot="availability-dot"
        />
        <span className="text-foreground">{home.hero.availability.status}</span>
        <span className="font-normal text-muted-foreground">
          {home.hero.availability.qualifier}
        </span>
      </div>
      <h1 id="intro-heading" className={clsx(styles.heading, "m-0 font-medium")} data-page-motion-intro>
        <span className="block">{home.hero.title}</span>
        <span className="block text-content-foreground">{home.hero.lead}</span>
      </h1>
      <div className={clsx(styles.descriptorSlot, "flex items-center justify-center")} data-page-motion-intro>
        <DescriptorRotation
          descriptors={home.hero.descriptors}
          interval={home.hero.descriptorInterval}
        />
      </div>
      <div className={clsx(styles.actions, "w-full lg:w-auto")} data-page-motion-intro data-slot="hero-actions">
        <a className={clsx(buttonVariants(), styles.resumeButton)} download href={home.hero.resumeHref}>
          <Icon name="download" />
          Résumé
        </a>
        <a className={buttonVariants({ variant: "ghost" })} href="#contact">
          <Icon name="contact" />
          Get in touch
        </a>
        <a className={buttonVariants({ variant: "ghost" })} href="#experience">
          <Icon name="experience" />
          Explore Experience
        </a>
      </div>
    </section>
  );
}
