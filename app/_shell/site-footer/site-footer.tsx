import { formatLocalTime } from "@/content/format-time";
import { home, profile } from "@/content/structured";
import { clsx } from "clsx";
import Link from "next/link";
import { LocalTime } from "../local-time/local-time";
import styles from "./site-footer.module.scss";

/**
 * Renders portfolio ownership and the hydrated local-time leaf.
 *
 * @returns The application footer.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();
  const initialTime = formatLocalTime(new Date(), home.footer.locale, home.footer.timeZone);

  return (
    <footer className={clsx(styles.footer, "page-shell-gutter border-t py-7 text-center font-mono text-muted-foreground lg:py-9 lg:text-xs")}>
      <nav aria-label="Site information" className="mt-3 flex flex-wrap justify-center gap-x-6">
        <Link className="inline-flex min-h-11 items-center rounded-sm transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" href="/privacy">
          Privacy Policy
        </Link>
        <Link className="inline-flex min-h-11 items-center rounded-sm transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" href="/terms">
          Terms &amp; Conditions
        </Link>
        <Link className="inline-flex min-h-11 items-center rounded-sm transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" href="/accessibility">
          Accessibility
        </Link>
        <Link className="inline-flex min-h-11 items-center rounded-sm transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" href="/for-robots">
          For Robots
        </Link>
      </nav>
      <p className="mt-3">
        © {year} {profile.name}. All rights reserved. · Local Time:{" "}
        <LocalTime
          initialTime={initialTime}
          locale={home.footer.locale}
          timeZone={home.footer.timeZone}
        />
      </p>
    </footer>
  );
}
