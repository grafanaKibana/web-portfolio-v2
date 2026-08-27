import { home } from "@/content/structured";
import { clsx } from "clsx";
import { MobileNavigation } from "../mobile-navigation/mobile-navigation";
import styles from "./site-header.module.scss";

const navigationItems = [
  { label: "About", href: "#about" },
  { label: "Experience", href: "#experience" },
  { label: "Education", href: "#education" },
  { label: "Skills", href: "#skills" },
  { label: "Projects", href: "#projects" },
  { label: "Code", href: "#code" },
  { label: "Writing", href: "#writing" },
  { label: "Contact", href: "#contact" },
] as const;

/**
 * Composes the server-rendered primary navigation and its interactive leaves.
 *
 * @returns The application header.
 */
export function SiteHeader() {
  return (
    <header className={clsx(styles.header, "sticky top-0 z-40")} data-slot="site-header">
      <MobileNavigation
        backToTopLabel="Back to top"
        closeLabel="Close navigation"
        compactNavigationLabel="Compact navigation"
        defaultSectionLabel="About"
        detailRoutes={[
          {
            routePrefix: "/projects/",
            backHref: "/projects",
            backLabel: "Back to list",
            homeLabel: "Home",
            navigationLabel: "Project navigation",
          },
          {
            routePrefix: "/articles/",
            backHref: "/articles",
            backLabel: "Back to list",
            homeLabel: "Home",
            navigationLabel: "Article navigation",
          },
        ]}
        items={navigationItems}
        navigationLabel="Mobile navigation"
        primaryNavigationLabel="Primary navigation"
        scrollThreshold={home.mobileNavigation.scrollThreshold}
        themeLabels={{
          change: "Change color theme",
          switchToDark: "Switch to dark theme",
          switchToLight: "Switch to light theme",
        }}
        triggerLabel="Jump to section"
      />
    </header>
  );
}
