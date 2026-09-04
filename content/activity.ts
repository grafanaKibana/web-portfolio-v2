import "server-only";

export type CodeContributionStatus = "merged" | "under-review" | "draft";

export interface CodeContribution {
  repository: string;
  number: number;
  date: string;
  title: string;
  href: string;
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
const searchPageSize = 100;
const searchPageLimit = 10;
const unavailablePullRequests = { merged: [], underReview: [], draft: [] } as const;

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
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

/**
 * Validates a GitHub Search API response for one pull-request state.
 *
 * @param input - Untrusted GitHub JSON response.
 * @param status - State represented by the search query.
 * @returns Validated pull requests, or null when the response is incomplete or malformed.
 */
export function parsePullRequestSearch(
  input: unknown,
  status: CodeContributionStatus,
): readonly CodeContribution[] | null {
  const root = record(input);
  if (!root || root.incomplete_results !== false || !Array.isArray(root.items)) return null;

  const contributions: CodeContribution[] = [];
  for (const value of root.items) {
    const item = record(value);
    const pullRequest = record(item?.pull_request);
    const number = item?.number;
    const title = item?.title;
    const href = item?.html_url;
    const repositoryUrl = item?.repository_url;
    const createdAt = dateTime(item?.created_at);
    const date = status === "merged" ? dateTime(pullRequest?.merged_at) : createdAt;
    const repository = typeof repositoryUrl === "string"
      ? /^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)$/.exec(repositoryUrl)?.[1]
      : undefined;
    const expectedState = status === "merged" ? "closed" : "open";

    if (!Number.isInteger(number) || Number(number) <= 0
      || typeof title !== "string" || !title.trim()
      || typeof href !== "string" || !repository
      || !pullRequest
      || pullRequest.url !== `https://api.github.com/repos/${repository}/pulls/${String(number)}`
      || item?.state !== expectedState || !createdAt || !date
      || href !== `https://github.com/${repository}/pull/${String(number)}`) {
      return null;
    }

    contributions.push({
      repository,
      number: Number(number),
      date,
      title,
      href,
    });
  }
  return contributions;
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
 * @param token - Optional server-only GitHub token.
 * @returns Validated pull requests.
 * @throws When GitHub fails or returns an invalid response.
 */
async function fetchPullRequests(
  username: string,
  status: CodeContributionStatus,
  fetcher: GitHubFetch,
  token: string | undefined,
): Promise<readonly CodeContribution[]> {
  const url = new URL("https://api.github.com/search/issues");
  let state = "is:open draft:false";
  if (status === "merged") state = "is:merged";
  else if (status === "draft") state = "is:open draft:true";
  url.searchParams.set("q", `author:${username} is:pr ${state} is:public -user:${username}`);
  url.searchParams.set("sort", "updated");
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", String(searchPageSize));
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "web-portfolio-v2",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const contributions: CodeContribution[] = [];
  for (let page = 1; page <= searchPageLimit; page += 1) {
    url.searchParams.set("page", String(page));
    const response = await fetcher(url.toString(), { headers, next: { revalidate: revalidateSeconds } });
    if (!response.ok) throw new Error(`GitHub search returned ${String(response.status)}`);
    const parsed = parsePullRequestSearch(await response.json() as unknown, status);
    if (!parsed) throw new Error("GitHub search returned invalid data");
    contributions.push(...parsed);
    if (parsed.length < searchPageSize) break;
  }
  return contributions.toSorted((left, right) => right.date.localeCompare(left.date));
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
 * @param token - Optional server-only token for higher REST limits.
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
  } catch (error) {
    console.warn("GitHub pull requests unavailable", error);
  }

  try {
    calendar = await fetchContributionCalendar(username, fetcher);
    calendarAvailable = true;
  } catch (error) {
    console.warn("GitHub contribution calendar unavailable", error);
  }

  return { pullRequestsAvailable, ...pullRequests, calendarAvailable, calendar };
}
