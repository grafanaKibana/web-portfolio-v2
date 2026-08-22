import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { MobileNavigation } from "@/components/mobile-navigation";
import { OpeningSplash } from "@/components/opening-splash";
import { ThemeProvider, ThemeToggle } from "./theme";
import "./globals.css";

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
    default: "Nikita Reshetnik",
    template: "%s | Nikita Reshetnik",
  },
  description: "AI engineer with a software and .NET foundation.",
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
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <OpeningSplash />
          <header className="border-b">
            <nav
              aria-label="Primary navigation"
              className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5"
            >
              <Link className="font-medium" href="/">
                Nikita Reshetnik
              </Link>
              <div className="flex items-center gap-6 text-sm text-muted-foreground">
                <div className="hidden items-center gap-6 sm:flex">
                  <Link className="hover:text-foreground" href="/projects">
                    Projects
                  </Link>
                  <Link className="hover:text-foreground" href="/articles">
                    Articles
                  </Link>
                </div>
                <ThemeToggle />
                <MobileNavigation />
              </div>
            </nav>
          </header>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
