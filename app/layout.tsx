import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { OpeningSplash } from "./_shell/opening-splash/opening-splash";
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
          <SiteHeader />
          {children}
          <SiteFooter />
        </ThemeProvider>
      </body>
    </html>
  );
}
