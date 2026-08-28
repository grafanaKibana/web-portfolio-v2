import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { clsx } from "clsx";
import { OpeningSplash } from "./_shell/opening-splash/opening-splash";
import { PageMotion } from "./_shell/page-motion/page-motion";
import motionStyles from "./_shell/page-motion/page-motion.module.scss";
import { SiteFooter } from "./_shell/site-footer/site-footer";
import { SiteHeader } from "./_shell/site-header/site-header";
import { ThemeProvider } from "./_shell/theme/theme";
import { home, profile } from "@/content/structured";
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

const splashPreflight = `
(() => {
  document.documentElement.dataset.pageMotionPending = "true";
  window.setTimeout(() => {
    delete document.documentElement.dataset.pageMotionPending;
  }, 4500);

  const debug = new URLSearchParams(window.location.search).has("debugSplash");
  if (!debug) {
    try {
      const key = "portfolio-opening-splash-seen";
      if (window.sessionStorage.getItem(key) === "true") return;
      window.sessionStorage.setItem(key, "true");
    } catch {
      return;
    }
  }
  document.documentElement.dataset.splashPending = "true";
  if (!debug) {
    window.setTimeout(() => {
      delete document.documentElement.dataset.splashPending;
    }, 3320);
  }
})();`;

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
  return (
    <html
      lang="en"
      className={clsx(geistSans.variable, geistMono.variable, "h-full antialiased")}
      suppressHydrationWarning
    >
      <head>
        <script id="opening-splash-preflight" dangerouslySetInnerHTML={{ __html: splashPreflight }} />
      </head>
      <body id="top" className={clsx(motionStyles.scope, "flex min-h-full flex-col")}>
        <ThemeProvider>
          <OpeningSplash name={profile.name} role={home.hero.descriptors[0] ?? ""} />
          <PageMotion />
          <a
            className={clsx(styles.skipLink, "sr-only fixed left-4 top-4 rounded-md bg-background px-4 py-3 font-medium shadow-md focus:not-sr-only focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2")}
            href="#main"
          >
            Skip to content
          </a>
          <SiteHeader />
          {children}
          <SiteFooter />
        </ThemeProvider>
      </body>
    </html>
  );
}
