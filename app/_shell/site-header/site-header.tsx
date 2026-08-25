import { House } from "lucide-react";
import Link from "next/link";
import { home } from "@/content/structured";
import { clsx } from "clsx";
import { MobileNavigation } from "../mobile-navigation/mobile-navigation";
import { ThemeToggle } from "../theme/theme";
import styles from "./site-header.module.scss";

/**
 * Composes the server-rendered primary navigation and its interactive leaves.
 *
 * @returns The application header.
 */
export function SiteHeader() {
  const hasNavigation = home.navigation.length > 0;

  return (
    <header className={clsx(styles.header, "sticky top-0 z-40")} data-slot="site-header">
      <nav
        aria-label={home.accessibility.primaryNavigation}
        className={clsx(styles.navigation, "relative mx-auto flex h-full w-full items-center justify-between")}
      >
        <Link
          aria-label={home.accessibility.backToTop}
          className="inline-flex size-11 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 xl:size-8"
          href="/#top"
        >
          <House aria-hidden="true" className="size-ui-icon opacity-70" />
        </Link>
        {hasNavigation && (
          <>
            <MobileNavigation
              closeLabel={home.mobileNavigation.closeLabel}
              defaultSectionLabel={home.mobileNavigation.defaultSectionLabel}
              items={home.navigation}
              scrollThreshold={home.mobileNavigation.scrollThreshold}
              triggerLabel={home.mobileNavigation.triggerLabel}
              navigationLabel={home.accessibility.mobileNavigation}
            />
            <noscript>
              <details className="text-ui-xs absolute left-1/2 top-2 z-50 w-54 -translate-x-1/2 xl:hidden">
                <summary
                  className={clsx(styles.summary, "flex min-h-11 cursor-pointer list-none items-center justify-center font-medium")}
                >
                  {home.mobileNavigation.triggerLabel}
                </summary>
                <nav
                  aria-label={home.accessibility.compactNavigation}
                  className="floating-menu-shadow rounded-md border bg-popover p-1.5"
                >
                  {home.navigation.map((item) => (
                    <a
                      key={item.href}
                      className="flex min-h-11 items-center rounded-sm px-2.5 text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                      href={`/${item.href}`}
                    >
                      {item.label}
                    </a>
                  ))}
                </nav>
              </details>
            </noscript>
          </>
        )}
        <ThemeToggle labels={home.theme} />
      </nav>
    </header>
  );
}
