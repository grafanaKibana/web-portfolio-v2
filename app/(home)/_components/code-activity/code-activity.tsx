import { Github } from "@thesvg/react";
import { clsx } from "clsx";
import { GitPullRequest, GitPullRequestDraft, MessageCircleMore } from "lucide-react";

import sectionStyles from "@/app/(home)/_components/section.module.scss";
import { home } from "@/lib/content/portfolio/server";
import { GitHubActivityService } from "@/lib/content/github-activity";
import type { ContributionDay } from "@/lib/content/github-activity.models";
import { CalendarDays } from "./calendar-days";
import styles from "./code-activity.module.scss";
import { PullRequestGroup, type PullRequestGroupStyles } from "./pull-request-group";

const githubActivity = new GitHubActivityService();
const activityMonth = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" });
const activityDate = new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const pullRequestGroupStyles = {
  group: styles.group,
  groupLabel: styles.groupLabel,
  contribution: styles.contribution,
  statusIcon: styles.statusIcon,
  copy: styles.copy,
  repository: styles.repository,
  title: styles.title,
  meta: styles.meta,
  period: styles.period,
  diff: styles.diff,
  additions: styles.additions,
  deletions: styles.deletions,
  disclosure: styles.disclosure,
  disclosureSummary: styles.disclosureSummary,
  remainder: styles.remainder,
} satisfies PullRequestGroupStyles;

/**
 * Builds week-aligned month labels, skipping a cramped opening partial month.
 *
 * @param days - Chronological GitHub contribution days beginning on Sunday.
 * @returns Week-aligned month labels.
 */
function calendarMonthLabels(days: readonly ContributionDay[]): readonly string[] {
  let lastMonth = -1;
  const labels = Array.from({ length: Math.ceil(days.length / 7) }, (_, weekIndex) => {
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
  if (labels[1]) labels[0] = "";
  return labels;
}

/**
 * Renders live external pull requests and GitHub's contribution calendar.
 *
 * @returns The Home Code activity section.
 */
export async function HomeCodeActivity() {
  const { codeActivity } = home;
  const activity = await githubActivity.load(codeActivity.username);
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
    <section id="code" aria-labelledby="code-heading" className={clsx(sectionStyles.section, "page-shell-gutter w-full")} data-page-motion-section>
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-t pt-3 lg:mb-10 lg:pt-3.5" data-page-motion-row>
        <h2
          data-page-motion-trigger
          id="code-heading"
          className={clsx(sectionStyles.label, sectionStyles.topLevelLabel, "m-0 font-mono uppercase text-muted-foreground")}
        >
          Code activity
        </h2>
        {summary ? (
          <p
            className={clsx(sectionStyles.label, "m-0 font-mono uppercase text-muted-foreground")}
            data-slot="activity-summary"
          >
            {summary}
          </p>
        ) : null}
      </div>

      {activity.pullRequestsAvailable ? groups.map((group) => (
        <PullRequestGroup
          contributions={group.contributions}
          icon={group.icon}
          key={group.status}
          label={group.label}
          status={group.status}
          styles={pullRequestGroupStyles}
        />
      )) : null}

      {activity.calendarAvailable ? (
        <figure className={clsx(styles.activity, "m-0 border-t pt-5")} data-page-motion-row data-slot="activity-visualization">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <figcaption className={clsx(styles.groupLabel, "font-mono uppercase text-muted-foreground")}>
              GitHub activity · last 12 months
            </figcaption>
            <a className="action-link min-w-0 break-all" href={profileHref} rel="noreferrer" target="_blank">
              <Github aria-hidden="true" className="size-3.5 opacity-60" variant="mono" />
              {profileLabel}
            </a>
          </div>
          <div className={styles.chartScroll}>
            <div className={styles.chart}>
              <div className={styles.chartMonths}>
                {calendarMonthLabels(activity.calendar).map((label, index) => (
                  <span key={`${String(index)}-${label}`}>{label}</span>
                ))}
              </div>
              <CalendarDays days={calendarDays} />
            </div>
          </div>
        </figure>
      ) : (
        <a className={clsx(styles.profileLink, "action-link border-t")} data-page-motion-row href={profileHref} rel="noreferrer" target="_blank">
          <Github aria-hidden="true" className="size-3.5 opacity-60" variant="mono" />
          {profileLabel}
        </a>
      )}
    </section>
  );
}
