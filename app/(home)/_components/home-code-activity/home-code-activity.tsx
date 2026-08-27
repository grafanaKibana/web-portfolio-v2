import { Github } from "@thesvg/react";
import { clsx } from "clsx";

import { loadGitHubActivity, type ContributionDay } from "@/content/activity";
import { home } from "@/content/structured";
import styles from "./home-code-activity.module.scss";

const pullRequestPeriod = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" });
const activityMonth = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" });
const activityDate = new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/**
 * Builds one month label for each contribution-calendar week.
 *
 * @param days - Chronological GitHub contribution days beginning on Sunday.
 * @returns Week-aligned month labels.
 */
function calendarMonthLabels(days: readonly ContributionDay[]): readonly string[] {
  let lastMonth = -1;
  return Array.from({ length: Math.ceil(days.length / 7) }, (_, weekIndex) => {
    const week = days.slice(weekIndex * 7, weekIndex * 7 + 7);
    const candidate = weekIndex === 0
      ? week[0]
      : week.find((day) => {
          const date = new Date(`${day.date}T00:00:00Z`);
          return date.getUTCDate() <= 7 && date.getUTCMonth() !== lastMonth;
        });
    if (!candidate) return "";
    const date = new Date(`${candidate.date}T00:00:00Z`);
    lastMonth = date.getUTCMonth();
    return activityMonth.format(date);
  });
}

/**
 * Renders live external pull requests and GitHub's contribution calendar.
 *
 * @returns The Home Code activity section.
 */
export async function HomeCodeActivity() {
  const { codeActivity } = home;
  const activity = await loadGitHubActivity(codeActivity.username);
  const profileHref = `https://github.com/${codeActivity.username}`;
  const profileLabel = `github.com/${codeActivity.username}`;
  const groups = [
    { status: "merged", label: "Merged", contributions: activity.merged },
    { status: "under-review", label: "Under review", contributions: activity.underReview },
  ] as const;
  const summary = activity.pullRequestsAvailable
    ? `${String(activity.merged.length)} merged · ${String(activity.underReview.length)} under review`
    : null;
  const calendarDays = activity.calendar.map((day) => ({
    ...day,
    label: `${day.count === 0 ? "No contributions" : `${String(day.count)} ${day.count === 1 ? "contribution" : "contributions"}`} on ${activityDate.format(new Date(`${day.date}T00:00:00Z`))}`,
  }));

  return (
    <section id="code" aria-labelledby="code-heading" className={clsx(styles.code, "page-shell-gutter w-full")}>
      <div className="mb-7 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-t pt-3 lg:mb-14 lg:pt-3.5">
        <h2
          id="code-heading"
          className={clsx(styles.sectionLabel, "m-0 font-mono font-normal uppercase text-muted-foreground")}
        >
          Code activity
        </h2>
        {summary ? (
          <p
            className={clsx(styles.sectionLabel, "m-0 font-mono uppercase text-muted-foreground")}
            data-slot="activity-summary"
          >
            {summary}
          </p>
        ) : null}
      </div>

      {activity.pullRequestsAvailable ? groups.filter((group) => group.contributions.length > 0).map((group) => (
        <section className={styles.group} data-slot="pull-request-group" key={group.status}>
          <h3 className={clsx(styles.groupLabel, "m-0 font-mono font-normal uppercase text-muted-foreground")}>
            {group.label}
          </h3>
          <ul aria-label={`${group.label} contributions`} className="m-0 mt-4 list-none p-0">
            {group.contributions.map((contribution) => (
              <li className="border-t first:border-t-0" key={contribution.href}>
                <a
                  className={clsx(styles.contribution, "group block rounded-sm py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 lg:py-3")}
                  data-slot="pull-request-row"
                  href={contribution.href}
                  rel="noreferrer"
                  target="_blank"
                >
                  <span className={styles.meta}>
                    <span aria-hidden="true" className={styles.statusDot} data-status={group.status} />
                    <span className={clsx(styles.repository, "font-mono")}>{contribution.repository}</span>
                    <span className="font-mono text-muted-foreground">#{contribution.number}</span>
                    <span className={clsx(styles.period, "font-mono text-muted-foreground")}>
                      {pullRequestPeriod.format(new Date(contribution.date))}
                    </span>
                  </span>
                  <span
                    className={clsx(styles.title, "mt-2 block break-all font-medium tracking-tight")}
                    data-slot="pull-request-title"
                  >
                    {contribution.title}
                  </span>
                  {contribution.summary ? (
                    <span
                      className={clsx(styles.summary, "mt-2 block text-muted-foreground transition-colors group-hover:text-foreground group-focus-visible:text-foreground")}
                      data-slot="pull-request-summary"
                    >
                      {contribution.summary}
                    </span>
                  ) : null}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )) : null}

      {activity.calendarAvailable ? (
        <figure className={clsx(styles.activity, "m-0 border-t pt-5")} data-slot="activity-visualization">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <figcaption className={clsx(styles.groupLabel, "font-mono uppercase text-muted-foreground")}>
              GitHub activity · last 12 months
            </figcaption>
            <a className="project-action-link min-w-0 break-all" href={profileHref} rel="noreferrer" target="_blank">
              <Github aria-hidden="true" className="size-3.5 opacity-60" variant="mono" />
              {profileLabel}
            </a>
          </div>
          <div className={styles.chartScroll}>
            <div aria-hidden="true" className={styles.chart}>
              <div className={styles.chartMonths}>
                {calendarMonthLabels(activity.calendar).map((label, index) => (
                  <span key={`${String(index)}-${label}`}>{label}</span>
                ))}
              </div>
              <div className={styles.chartDays}>
                {calendarDays.map((day) => (
                  <span
                    className={styles.chartDay}
                    data-level={day.level}
                    data-slot="contribution-day"
                    key={day.date}
                    title={day.label}
                  />
                ))}
              </div>
            </div>
          </div>
          <ol className="sr-only">
            {calendarDays.map((day) => (
              <li key={day.date}>{day.label}</li>
            ))}
          </ol>
        </figure>
      ) : (
        <a className={clsx(styles.profileLink, "project-action-link border-t")} href={profileHref} rel="noreferrer" target="_blank">
          <Github aria-hidden="true" className="size-3.5 opacity-60" variant="mono" />
          {profileLabel}
        </a>
      )}
    </section>
  );
}
