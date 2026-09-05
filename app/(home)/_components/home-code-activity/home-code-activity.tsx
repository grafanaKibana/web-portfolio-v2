import { Github } from "@thesvg/react";
import { clsx } from "clsx";
import { GitPullRequest, GitPullRequestDraft, MessageCircleMore } from "lucide-react";

import { loadGitHubActivity, type ContributionDay } from "@/content/activity";
import { home } from "@/content/structured";
import styles from "./home-code-activity.module.scss";

const pullRequestPeriod = new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" });
const pullRequestCount = new Intl.NumberFormat("en-US");
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
    { status: "under-review", label: "Under review", contributions: activity.underReview, icon: MessageCircleMore },
    { status: "draft", label: "Draft", contributions: activity.draft, icon: GitPullRequestDraft },
    { status: "merged", label: "Merged", contributions: activity.merged, icon: GitPullRequest },
  ] as const;
  const summary = activity.pullRequestsAvailable
    ? `${String(activity.merged.length)} merged · ${String(activity.underReview.length)} under review · ${String(activity.draft.length)} draft`
    : null;
  const calendarDays = activity.calendar.map((day) => ({
    ...day,
    label: `${day.count === 0 ? "No contributions" : `${String(day.count)} ${day.count === 1 ? "contribution" : "contributions"}`} on ${activityDate.format(new Date(`${day.date}T00:00:00Z`))}`,
  }));

  return (
    <section id="code" aria-labelledby="code-heading" className={clsx(styles.code, "page-shell-gutter w-full")} data-page-motion-section>
      <div className="mb-7 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-t pt-3 lg:mb-14 lg:pt-3.5" data-page-motion-row>
        <h2
          data-page-motion-trigger
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

      {activity.pullRequestsAvailable ? groups.filter((group) => group.contributions.length > 0).map((group) => {
        const StatusIcon = group.icon;
        return (
          <section className={styles.group} data-slot="pull-request-group" key={group.status}>
            <h3 className={clsx(styles.groupLabel, "m-0 font-mono font-normal uppercase text-muted-foreground")} data-page-motion-row>
              {group.label}
            </h3>
            <ul aria-label={`${group.label} contributions`} className="m-0 mt-4 list-none p-0">
              {group.contributions.map((contribution) => (
                <li className="border-t first:border-t-0" data-page-motion-row key={contribution.href}>
                  <a
                    className={clsx(styles.contribution, "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2")}
                    data-slot="pull-request-row"
                    href={contribution.href}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <StatusIcon
                      aria-hidden="true"
                      className={styles.statusIcon}
                      data-slot="pull-request-status"
                      data-status={group.status}
                    />
                    <span className={styles.copy} data-slot="pull-request-copy">
                      <span className={clsx(styles.repository, "font-mono")}>
                        {contribution.repository} #{contribution.number}
                      </span>
                      <span className={clsx(styles.title, "font-medium tracking-tight")} data-slot="pull-request-title">
                        {contribution.title}
                      </span>
                    </span>
                    <span className={clsx(styles.meta, "font-mono")} data-slot="pull-request-meta">
                      <time
                        className={styles.period}
                        dateTime={contribution.date}
                        data-slot="pull-request-date"
                      >
                        {pullRequestPeriod.format(new Date(contribution.date))}
                      </time>
                      <span className={styles.diff} data-slot="pull-request-diff">
                        <span aria-hidden="true" className={styles.additions}>
                          +{pullRequestCount.format(contribution.additions)}
                        </span>
                        <span aria-hidden="true" className={styles.deletions}>
                          −{pullRequestCount.format(contribution.deletions)}
                        </span>
                        <span className="sr-only">
                          {pullRequestCount.format(contribution.additions)} {contribution.additions === 1 ? "addition" : "additions"} and {pullRequestCount.format(contribution.deletions)} {contribution.deletions === 1 ? "deletion" : "deletions"}
                        </span>
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        );
      }) : null}

      {activity.calendarAvailable ? (
        <figure className={clsx(styles.activity, "m-0 border-t pt-5")} data-page-motion-row data-slot="activity-visualization">
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
        <a className={clsx(styles.profileLink, "project-action-link border-t")} data-page-motion-row href={profileHref} rel="noreferrer" target="_blank">
          <Github aria-hidden="true" className="size-3.5 opacity-60" variant="mono" />
          {profileLabel}
        </a>
      )}
    </section>
  );
}
