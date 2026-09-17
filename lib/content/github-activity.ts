import "server-only";

import { githubActivityConfig } from "./github-activity.config";
import type {
  CodeContribution, CodeContributionStatus, ContributionDay,
  GitHubActivityDependencies, GitHubActivityResult, GitHubFetch,
} from "./github-activity.models";
import { parseContributionCalendar, parsePullRequestPage } from "./github-activity-parsing";

/** Loads public GitHub activity with independent fail-open data availability. */
export class GitHubActivityService {
  /** Empty pull-request groups used when live GitHub data is unavailable. */
  private static readonly unavailablePullRequests = { merged: [], underReview: [], draft: [] } as const;

  private readonly fetcher: GitHubFetch;
  private readonly resolveToken: () => string | undefined;

  /**
   * Retains operations without capturing credentials or per-load state.
   * @param dependencies - Optional fetch and invocation-time token resolver.
   */
  constructor(dependencies: GitHubActivityDependencies = {}) {
    this.fetcher = dependencies.fetcher ?? ((input, init) => fetch(input, init));
    this.resolveToken = dependencies.resolveToken ?? (() => process.env.GITHUB_TOKEN);
  }

  /**
   * Loads live GitHub pull requests and the public contribution calendar independently.
   *
   * @param username - GitHub account displayed by the Code section.
   * @returns Live activity with independent fail-open availability flags.
   */
  async load(
    username: string,
  ): Promise<GitHubActivityResult> {
    const token = this.resolveToken();
    let pullRequests: {
      merged: readonly CodeContribution[];
      underReview: readonly CodeContribution[];
      draft: readonly CodeContribution[];
    } = GitHubActivityService.unavailablePullRequests;
    let pullRequestsAvailable = false;
    let calendar: readonly ContributionDay[] = [];
    let calendarAvailable = false;

    try {
      const merged = await this.fetchPullRequests(username, "merged", token);
      const underReview = await this.fetchPullRequests(username, "under-review", token);
      const draft = await this.fetchPullRequests(username, "draft", token);
      pullRequests = { merged, underReview, draft };
      pullRequestsAvailable = true;
    } catch {
      console.warn("GitHub pull requests unavailable");
    }

    try {
      calendar = await this.fetchContributionCalendar(username);
      calendarAvailable = true;
    } catch {
      console.warn("GitHub contribution calendar unavailable");
    }

    return { pullRequestsAvailable, ...pullRequests, calendarAvailable, calendar };
  }

  /**
   * Fetches and validates one live pull-request group.
   *
   * @param username - GitHub account whose external contributions are queried.
   * @param status - Pull-request state to fetch.
   * @param token - Server-only GitHub token.
   * @returns Validated pull requests.
   * @throws When GitHub fails or returns an invalid response.
   */
  private async fetchPullRequests(
    username: string,
    status: CodeContributionStatus,
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
    for (let page = 1; page <= githubActivityConfig.searchPageLimit; page += 1) {
      const body = JSON.stringify({ query: githubActivityConfig.pullRequestQuery, variables: { query: searchQuery, cursor } });
      const response = await this.fetcher("https://api.github.com/graphql", {
        method: "POST",
        headers,
        body,
        cache: "force-cache",
        next: { revalidate: githubActivityConfig.revalidateSeconds },
        signal: AbortSignal.timeout(githubActivityConfig.requestTimeoutMilliseconds),
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
   * @returns Chronological contribution days.
   * @throws When GitHub fails or returns an invalid calendar.
   */
  private async fetchContributionCalendar(
    username: string,
  ): Promise<readonly ContributionDay[]> {
    const response = await this.fetcher(`https://github.com/users/${encodeURIComponent(username)}/contributions`, {
      headers: { Accept: "text/html", "User-Agent": "web-portfolio-v2" },
      next: { revalidate: githubActivityConfig.revalidateSeconds },
      signal: AbortSignal.timeout(githubActivityConfig.requestTimeoutMilliseconds),
    });
    if (!response.ok) throw new Error(`GitHub contributions returned ${String(response.status)}`);
    const parsed = parseContributionCalendar(await response.text());
    if (!parsed) throw new Error("GitHub contributions returned invalid data");
    return parsed;
  }
}
