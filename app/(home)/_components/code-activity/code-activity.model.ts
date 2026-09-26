import type { ContributionDay, GitHubActivityResult } from "@/lib/content/github-activity.models";

const calendarPeriod = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Display context derived from the returned contribution calendar. */
export interface CalendarContext {
  range: string;
  total: number;
}

/** Availability state used by the Code activity presentation. */
export type CodeActivityState = "available" | "calendar-only" | "pull-requests-only" | "unavailable";

/**
 * Describes which independently loaded activity sources are available.
 *
 * @param activity - Normalized public GitHub activity.
 * @returns Presentation state for the available source combination.
 */
export function codeActivityState(activity: GitHubActivityResult): CodeActivityState {
  const hasCalendar = activity.calendarAvailable && activity.calendar.length > 0;
  if (activity.pullRequestsAvailable && hasCalendar) return "available";
  if (hasCalendar) return "calendar-only";
  if (activity.pullRequestsAvailable) return "pull-requests-only";
  return "unavailable";
}

/**
 * Formats the non-zero pull-request counts shown beside the section heading.
 *
 * @param activity - Normalized public GitHub activity.
 * @returns Compact summary, or a factual zero-result label.
 */
export function pullRequestSummary(activity: GitHubActivityResult): string | null {
  if (!activity.pullRequestsAvailable) return null;

  const counts = [
    { count: activity.merged.length, label: "merged" },
    { count: activity.underReview.length, label: "open" },
    { count: activity.draft.length, label: "draft" },
  ].filter(({ count }) => count > 0);

  if (counts.length === 0) return "No recent pull requests";
  return counts.map(({ count, label }) => `${String(count)} ${label}`).join(" · ");
}

/**
 * Derives the exact displayed range and total from chronological calendar days.
 *
 * @param days - Chronological contribution days.
 * @returns Calendar context, or null when no days were returned.
 */
export function contributionCalendarContext(days: readonly ContributionDay[]): CalendarContext | null {
  const first = days[0];
  const last = days.at(-1);
  if (!first || !last) return null;

  return {
    range: `${calendarPeriod.format(new Date(`${first.date}T00:00:00Z`))}–${calendarPeriod.format(new Date(`${last.date}T00:00:00Z`))}`,
    total: days.reduce((sum, day) => sum + day.count, 0),
  };
}
