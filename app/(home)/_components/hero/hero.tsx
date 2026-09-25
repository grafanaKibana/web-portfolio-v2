import type { CSSProperties } from "react";
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
import { heroContrast, heroNoise } from "./hero-background.config";
import lightImage from "./hero-light.generated.webp";
import darkImage from "./hero-dark.generated.webp";
import noiseImage from "./hero-noise.generated.webp";

/** Palette-derived colors are available before hydration and switch atomically with the theme. */
const heroColors = {
  "--hero-light-foreground": heroContrast.light.foreground,
  "--hero-light-surface": heroContrast.light.surface,
  "--hero-light-veil": heroContrast.light.veilOpacity,
  "--hero-dark-foreground": heroContrast.dark.foreground,
  "--hero-dark-surface": heroContrast.dark.surface,
  "--hero-dark-veil": heroContrast.dark.veilOpacity,
  "--hero-light-image": `url("${lightImage.src}")`,
  "--hero-dark-image": `url("${darkImage.src}")`,
  "--hero-noise-image": `url("${noiseImage.src}")`,
  "--hero-noise-opacity": heroNoise / 200,
} as CSSProperties;

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
      data-slot="hero"
      data-hero-light-foreground={heroContrast.light.foreground}
      data-hero-dark-foreground={heroContrast.dark.foreground}
      // Palette-derived CSS variables keep server rendering and theme changes in sync.
      // eslint-disable-next-line react/forbid-dom-props
      style={heroColors}
      className={clsx(styles.hero, "page-shell-gutter box-border flex w-full flex-col items-center justify-center pt-8 text-center")}
    >
      <link rel="preload" as="image" href={lightImage.src} fetchPriority="high" />
      <link rel="preload" as="image" href={darkImage.src} fetchPriority="high" />
      <div
        aria-hidden="true"
        data-hero-background="light"
        className={clsx(styles.background, styles.lightBackground)}
      />
      <div
        aria-hidden="true"
        data-hero-background="dark"
        className={clsx(styles.background, styles.darkBackground)}
      />
      <div data-page-motion-intro="immediate" className={clsx(styles.availability, "inline-flex items-center rounded-full py-1.5 text-xs font-medium")}>
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
      <h1 data-page-motion-intro="immediate" id="intro-heading" className={clsx(styles.heading, "m-0 font-medium")}>
        <span className="block">{home.hero.title}</span>
        <span className="block text-content-foreground">{home.hero.lead}</span>
      </h1>
      <div data-page-motion-intro="immediate" className={clsx(styles.descriptorSlot, "flex items-center justify-center")}>
        <DescriptorRotation
          descriptors={home.hero.descriptors}
          interval={home.hero.descriptorInterval}
        />
      </div>
      <div data-page-motion-intro="immediate" className={clsx(styles.actions, "w-full lg:w-auto")} data-slot="hero-actions">
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
