import type { Metadata } from "next";
import { House } from "lucide-react";
import { Geist, Geist_Mono } from "next/font/google";
import { LocalTime } from "@/components/local-time";
import { MobileNavigation } from "@/components/mobile-navigation";
import { OpeningSplash } from "@/components/opening-splash";
import { formatLocalTime } from "@/content/format-time";
import { home, profile } from "@/content/structured";
import { ThemeProvider, ThemeToggle } from "./theme";
import "./globals.css";
import styles from "./layout.module.scss";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: profile.name,
    template: `%s | ${profile.name}`,
  },
  description: home.metadataDescription,
};

/**
 * Composes the application shell, theme boundary, and primary navigation.
 *
 * @param children - Route content rendered inside the application shell.
 * @returns The root document layout.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  const year = new Date().getFullYear();
  const initialTime = formatLocalTime(new Date(), home.footer.locale, home.footer.timeZone);
  const hasNavigation = home.navigation.length > 0;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body id="top" className="flex min-h-full flex-col">
        <ThemeProvider>
          <OpeningSplash name={profile.name} />
          <a
            className={`${styles.skipLink} sr-only fixed left-4 top-4 rounded-md bg-background px-4 py-3 font-medium shadow-md focus:not-sr-only focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`}
            href="#main"
          >
            {home.accessibility.skipToContent}
          </a>
          <header className={`${styles.header} sticky top-0 z-40`} data-slot="site-header">
            <nav
              aria-label={home.accessibility.primaryNavigation}
              className={`${styles.navigation} relative mx-auto flex h-full w-full items-center justify-between`}
            >
              <a
                aria-label={home.accessibility.backToTop}
                className="inline-flex size-11 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 lg:size-8"
                href="#top"
              >
                <House aria-hidden="true" className="size-ui-icon opacity-70" />
              </a>
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
                  <div className="desktop-link-row-gap text-ui-xs absolute left-1/2 hidden -translate-x-1/2 items-center whitespace-nowrap text-muted-foreground lg:flex">
                    {home.navigation.map((item) => (
                      <a
                        key={item.href}
                        className="rounded-sm py-3 transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                        href={item.href}
                      >
                        {item.label}
                      </a>
                    ))}
                  </div>
                </>
              )}
              <ThemeToggle labels={home.theme} />
            </nav>
            {hasNavigation && (
              <noscript>
                <details className="text-ui-xs absolute left-1/2 top-2 z-50 w-54 -translate-x-1/2 lg:hidden">
                  <summary className={`${styles.summary} flex min-h-11 cursor-pointer list-none items-center justify-center font-medium`}>
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
                        href={item.href}
                      >
                        {item.label}
                      </a>
                    ))}
                  </nav>
                </details>
              </noscript>
            )}
          </header>
          {children}
          <footer className={`${styles.footer} page-shell-gutter border-t py-7 text-center font-mono text-muted-foreground lg:py-9 lg:text-xs`}>
            © {year} {profile.name}. {home.footer.rights} · {home.footer.localTimeLabel}:{" "}
            <LocalTime
              initialTime={initialTime}
              locale={home.footer.locale}
              timeZone={home.footer.timeZone}
            />
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
