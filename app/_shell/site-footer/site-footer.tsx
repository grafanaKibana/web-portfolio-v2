import { formatLocalTime } from "@/content/format-time";
import { home, profile } from "@/content/structured";
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
    <footer className={`${styles.footer} page-shell-gutter border-t py-7 text-center font-mono text-muted-foreground lg:py-9 lg:text-xs`}>
      © {year} {profile.name}. {home.footer.rights} · {home.footer.localTimeLabel}:{" "}
      <LocalTime
        initialTime={initialTime}
        locale={home.footer.locale}
        timeZone={home.footer.timeZone}
      />
    </footer>
  );
}
