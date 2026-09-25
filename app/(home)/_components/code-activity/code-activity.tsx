import { clsx } from "clsx";
import { GitPullRequest, GitPullRequestDraft, MessageCircleMore } from "lucide-react";

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
  statusIcon: styles.statusIcon,
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

  const calendar = activity.calendarAvailable ? (
    <figure aria-label="GitHub activity, last 12 months" className="mx-0 my-4 lg:my-6" data-slot="activity-visualization">
      <div className={clsx(styles.chartScroll, "overflow-x-auto")}>
        <div className="w-[39.625rem] lg:w-full">
          <div className={clsx(styles.chartMonths, "mb-1.25 grid gap-[0.1875rem] font-mono text-xs leading-4.5 text-muted-foreground")}>
            {calendarMonthLabels(activity.calendar).map((label, index) => (
              <span key={`${String(index)}-${label}`}>{label}</span>
            ))}
          </div>
          <CalendarDays days={calendarDays} />
        </div>
      </div>
    </figure>
  ) : null;
  const visibleGroups = activity.pullRequestsAvailable
    ? groups.filter((group) => group.contributions.length > 0)
    : [];

  return (
    <section id="code" aria-labelledby="code-heading" className="page-shell-gutter w-full scroll-mt-3 py-8 lg:-scroll-mt-5 lg:py-12 xl:-scroll-mt-1" data-page-motion-section>
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-t pt-3 lg:mb-10 lg:pt-3.5" data-page-motion-row>
        <h2
          data-page-motion-trigger
          id="code-heading"
          className="m-0 font-mono text-xs leading-4.5 font-semibold tracking-[0.08em] uppercase text-muted-foreground"
        >
          Code activity
        </h2>
        {summary ? (
          <p
            className="m-0 font-mono text-xs leading-4.5 font-normal tracking-[0.08em] uppercase text-muted-foreground"
            data-slot="activity-summary"
          >
            {summary}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-8 lg:gap-12">
        {visibleGroups.map((group, index) => (
          <PullRequestGroup
            contributions={group.contributions}
            icon={group.icon}
            key={group.status}
            label={group.label}
            status={group.status}
            styles={pullRequestGroupStyles}
          >
            {index === visibleGroups.length - 1 ? calendar : null}
          </PullRequestGroup>
        ))}
        {visibleGroups.length === 0 && calendar ? (
          <PullRequestGroup contributions={[]} icon={GitPullRequest} label="GitHub" status="merged" styles={pullRequestGroupStyles}>
            {calendar}
          </PullRequestGroup>
        ) : null}
      </div>
    </section>
  );
}
