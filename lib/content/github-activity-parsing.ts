import "server-only";

import type { CodeContribution, CodeContributionStatus, ContributionDay } from "./github-activity.models";

/**
 * Returns an object record or null for an invalid API value.
 *
 * @param value - Untrusted remote value.
 * @returns The record when valid.
 */
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * Validates an ISO date-time from GitHub.
 *
 * @param value - Untrusted date-time value.
 * @returns The validated string or null.
 */
function dateTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/.exec(value);
  if (!match) return null;
  const parsed = new Date(value);
  const matchesValue = Number.isFinite(parsed.getTime())
    && parsed.getUTCFullYear() === Number(match[1])
    && parsed.getUTCMonth() + 1 === Number(match[2])
    && parsed.getUTCDate() === Number(match[3])
    && parsed.getUTCHours() === Number(match[4])
    && parsed.getUTCMinutes() === Number(match[5])
    && parsed.getUTCSeconds() === Number(match[6]);
  return matchesValue ? value : null;
}

/** Validated search page with its continuation cursor. */
interface PullRequestPage {
  contributions: readonly CodeContribution[];
  hasNextPage: boolean;
  endCursor: string | null;
}

/**
 * Validates a GitHub GraphQL response for one pull-request state.
 *
 * @param input - Untrusted GitHub JSON response.
 * @param status - State represented by the search query.
 * @returns A validated pull-request page, or null when the response is malformed.
 */
export function parsePullRequestPage(
  input: unknown,
  status: CodeContributionStatus,
): PullRequestPage | null {
  const root = record(input);
  const errors = root?.errors;
  if (!root || errors !== undefined && (!Array.isArray(errors) || errors.length > 0)) return null;
  const search = record(record(root.data)?.search);
  const pageInfo = record(search?.pageInfo);
  const nodes = search?.nodes;
  const hasNextPage = pageInfo?.hasNextPage;
  const endCursor = pageInfo?.endCursor;
  if (!Array.isArray(nodes)
    || typeof hasNextPage !== "boolean"
    || endCursor !== null && (typeof endCursor !== "string" || !endCursor.trim())
    || hasNextPage && typeof endCursor !== "string") return null;

  const contributions: CodeContribution[] = [];
  const merged = status === "merged";
  const draft = status === "draft";
  for (const value of nodes) {
    const node = record(value);
    const repositoryRecord = record(node?.repository);
    const repository = repositoryRecord?.nameWithOwner;
    const number = node?.number;
    const title = node?.title;
    const href = node?.url;
    const createdAt = dateTime(node?.createdAt);
    const mergedAt = dateTime(node?.mergedAt);
    const additions = node?.additions;
    const deletions = node?.deletions;
    const date = merged ? mergedAt : createdAt;

    if (node?.__typename !== "PullRequest"
      || repositoryRecord?.isPrivate !== false
      || typeof repository !== "string"
      || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9._-]{1,100}$/.test(repository)
      || typeof number !== "number" || !Number.isSafeInteger(number) || number <= 0
      || typeof title !== "string" || !title.trim()
      || typeof href !== "string"
      || !createdAt || !date
      || node.state !== (merged ? "MERGED" : "OPEN")
      || node.isDraft !== draft
      || !merged && node.mergedAt !== null
      || typeof additions !== "number" || !Number.isSafeInteger(additions) || additions < 0
      || typeof deletions !== "number" || !Number.isSafeInteger(deletions) || deletions < 0
      || href !== `https://github.com/${repository}/pull/${String(number)}`) {
      return null;
    }

    contributions.push({
      repository,
      number,
      date,
      title,
      href,
      additions,
      deletions,
    });
  }
  return { contributions, hasNextPage, endCursor };
}

/**
 * Reads one attribute from a GitHub contribution-cell tag.
 *
 * @param tag - Raw contribution-cell tag.
 * @param name - Attribute name.
 * @returns The attribute value or null.
 */
function attribute(tag: string, name: string): string | null {
  return new RegExp(`\\b${name}="([^"]+)"`).exec(tag)?.[1] ?? null;
}

/**
 * Parses a valid UTC calendar date.
 *
 * @param value - Candidate YYYY-MM-DD value.
 * @returns Its epoch milliseconds or null.
 */
function calendarDate(value: string): number | null {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return date.toISOString().slice(0, 10) === value ? date.getTime() : null;
}

/**
 * Extracts the exact contribution count from GitHub's tooltip text.
 *
 * @param tooltip - Public contribution-cell tooltip.
 * @returns The contribution count or null.
 */
function contributionCount(tooltip: string): number | null {
  if (/^No contributions on /.test(tooltip)) return 0;
  const count = /^([\d,]+) contributions? on /.exec(tooltip)?.[1];
  return count ? Number(count.replaceAll(",", "")) : null;
}

/**
 * Validates GitHub's public contribution-calendar HTML.
 *
 * @param html - Untrusted GitHub contribution markup.
 * @returns Chronological contribution days, or null when the calendar shape changes.
 */
export function parseContributionCalendar(html: string): readonly ContributionDay[] | null {
  const tooltips = new Map<string, string>();
  for (const match of html.matchAll(/<tool-tip\b[^>]*\bfor="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g)) {
    if (match[1] && match[2]) tooltips.set(match[1], match[2]);
  }

  const days: ContributionDay[] = [];
  for (const match of html.matchAll(/<td\b(?=[^>]*\bContributionCalendar-day\b)[^>]*>/g)) {
    const tag = match[0];
    const id = attribute(tag, "id");
    const date = attribute(tag, "data-date");
    const level = Number(attribute(tag, "data-level"));
    const epoch = date ? calendarDate(date) : null;
    const count = id ? contributionCount(tooltips.get(id) ?? "") : null;
    if (!date || epoch === null || !Number.isInteger(level) || level < 0 || level > 4 || count === null) return null;
    days.push({ date, level, count });
  }

  days.sort((left, right) => left.date.localeCompare(right.date));
  if (days.length < 350 || days.length > 371 || new Set(days.map(({ date }) => date)).size !== days.length) return null;
  const first = calendarDate(days[0]?.date ?? "");
  if (first === null || new Date(first).getUTCDay() !== 0) return null;
  for (let index = 1; index < days.length; index += 1) {
    const previous = calendarDate(days[index - 1]?.date ?? "");
    const current = calendarDate(days[index]?.date ?? "");
    if (previous === null || current !== previous + 86_400_000) return null;
  }
  return days;
}
