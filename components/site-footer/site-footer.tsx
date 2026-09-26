import { formatLocalTime } from "./format-time";
import { home, profile } from "@/lib/content/portfolio/server";
import { clsx } from "clsx";
import Link from "next/link";
import { LocalTime } from "./local-time";
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
    <footer className={clsx(styles.footer, "page-shell-gutter border-t font-mono text-muted-foreground")}>
      <div className={styles.layout}>
        <nav aria-label="Site information" className={styles.navigation}>
          <Link className={styles.link} href="/privacy">
            Privacy Policy
          </Link>
          <Link className={styles.link} href="/terms">
            Terms &amp; Conditions
          </Link>
          <Link className={styles.link} href="/accessibility">
            Accessibility
          </Link>
          <Link className={styles.link} href="/for-robots">
            For Robots
          </Link>
        </nav>
        <div className={styles.metadata}>
          <p>
            <span className="inline-block">© {year} {profile.name}.</span>{" "}
            <span className="inline-block">All rights reserved.</span>
          </p>
          <p className={styles.time}>My local time:{" "}
            <LocalTime
              initialTime={initialTime}
              locale={home.footer.locale}
              timeZone={home.footer.timeZone}
            />
          </p>
        </div>
      </div>
    </footer>
  );
}
