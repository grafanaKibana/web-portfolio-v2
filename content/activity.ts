import "server-only";

export type CodeContributionStatus = "merged" | "under-review" | "draft";

export interface CodeContribution {
  repository: string;
  number: number;
  date: string;
  title: string;
  href: string;
  additions: number;
  deletions: number;
}

export interface ContributionDay {
  date: string;
  level: number;
  count: number;
}

export interface GitHubActivityResult {
  pullRequestsAvailable: boolean;
  merged: readonly CodeContribution[];
  underReview: readonly CodeContribution[];
  draft: readonly CodeContribution[];
  calendarAvailable: boolean;
  calendar: readonly ContributionDay[];
}

interface GitHubRequestInit extends RequestInit {
  next: { revalidate: number };
}

export type GitHubFetch = (input: string, init: GitHubRequestInit) => Promise<Response>;

const revalidateSeconds = 300;
const searchPageLimit = 10;
const unavailablePullRequests = { merged: [], underReview: [], draft: [] } as const;
const pullRequestQuery = `query PullRequests($query: String!, $cursor: String) {
  search(query: $query, type: ISSUE, first: 100, after: $cursor) {
    nodes {
      __typename
      ... on PullRequest {
        number
        title
        url
        createdAt
        mergedAt
        state
        isDraft
        additions
        deletions
        repository {
          nameWithOwner
          isPrivate
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}`;

/**
 * Delegates a GitHub request to the platform fetch implementation.
 *
 * @param input - Absolute GitHub URL.
 * @param init - Server-only request options.
 * @returns The GitHub response.
 */
function defaultFetch(input: string, init: GitHubRequestInit): Promise<Response> {
  return fetch(input, init);
}

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

/**
 * Fetches and validates one live pull-request group.
 *
 * @param username - GitHub account whose external contributions are queried.
 * @param status - Pull-request state to fetch.
 * @param fetcher - Server fetch implementation.
 * @param token - Server-only GitHub token.
 * @returns Validated pull requests.
 * @throws When GitHub fails or returns an invalid response.
 */
async function fetchPullRequests(
  username: string,
  status: CodeContributionStatus,
  fetcher: GitHubFetch,
  token: string | undefined,
): Promise<readonly CodeContribution[]> {
  const authenticationToken = token?.trim();
  if (!authenticationToken) throw new Error("GitHub token is required");
  let state = "is:open draft:false";
  if (status === "merged") state = "is:merged";
  else if (status === "draft") state = "is:open draft:true";
  const searchQuery = `author:${username} is:pr ${state} is:public -user:${username} sort:updated-desc`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${authenticationToken}`,
    "Content-Type": "application/json",
    "User-Agent": "web-portfolio-v2",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const contributions: CodeContribution[] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  for (let page = 1; page <= searchPageLimit; page += 1) {
    const body = JSON.stringify({ query: pullRequestQuery, variables: { query: searchQuery, cursor } });
    const response = await fetcher("https://api.github.com/graphql", {
      method: "POST",
      headers,
      body,
      cache: "force-cache",
      next: { revalidate: revalidateSeconds },
    });
    if (!response.ok) throw new Error(`GitHub GraphQL returned ${String(response.status)}`);
    const parsed = parsePullRequestPage(await response.json() as unknown, status);
    if (!parsed) throw new Error("GitHub GraphQL returned invalid data");
    contributions.push(...parsed.contributions);
    if (!parsed.hasNextPage) break;
    if (!parsed.endCursor || cursors.has(parsed.endCursor)) {
      throw new Error("GitHub GraphQL returned an invalid cursor");
    }
    cursors.add(parsed.endCursor);
    cursor = parsed.endCursor;
  }
  return contributions.toSorted((left, right) => Date.parse(right.date) - Date.parse(left.date));
}

/**
 * Fetches and validates GitHub's live public contribution calendar.
 *
 * @param username - GitHub account whose graph is requested.
 * @param fetcher - Server fetch implementation.
 * @returns Chronological contribution days.
 * @throws When GitHub fails or returns an invalid calendar.
 */
async function fetchContributionCalendar(
  username: string,
  fetcher: GitHubFetch,
): Promise<readonly ContributionDay[]> {
  const response = await fetcher(`https://github.com/users/${encodeURIComponent(username)}/contributions`, {
    headers: { Accept: "text/html", "User-Agent": "web-portfolio-v2" },
    next: { revalidate: revalidateSeconds },
  });
  if (!response.ok) throw new Error(`GitHub contributions returned ${String(response.status)}`);
  const parsed = parseContributionCalendar(await response.text());
  if (!parsed) throw new Error("GitHub contributions returned invalid data");
  return parsed;
}

/**
 * Loads live GitHub pull requests and the public contribution calendar independently.
 *
 * @param username - GitHub account displayed by the Code section.
 * @param fetcher - Injectable server fetch implementation.
 * @param token - Server-only token required for pull-request rows.
 * @returns Live activity with independent fail-open availability flags.
 */
export async function loadGitHubActivity(
  username: string,
  fetcher: GitHubFetch = defaultFetch,
  token = process.env.GITHUB_TOKEN,
): Promise<GitHubActivityResult> {
  let pullRequests: {
    merged: readonly CodeContribution[];
    underReview: readonly CodeContribution[];
    draft: readonly CodeContribution[];
  } = unavailablePullRequests;
  let pullRequestsAvailable = false;
  let calendar: readonly ContributionDay[] = [];
  let calendarAvailable = false;

  try {
    const merged = await fetchPullRequests(username, "merged", fetcher, token);
    const underReview = await fetchPullRequests(username, "under-review", fetcher, token);
    const draft = await fetchPullRequests(username, "draft", fetcher, token);
    pullRequests = { merged, underReview, draft };
    pullRequestsAvailable = true;
  } catch {
    console.warn("GitHub pull requests unavailable");
  }

  try {
    calendar = await fetchContributionCalendar(username, fetcher);
    calendarAvailable = true;
  } catch (error) {
    console.warn("GitHub contribution calendar unavailable", error);
  }

  return { pullRequestsAvailable, ...pullRequests, calendarAvailable, calendar };
}
