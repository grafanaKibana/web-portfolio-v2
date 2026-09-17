/** Display state assigned to a public pull request. */
export type CodeContributionStatus = "merged" | "under-review" | "draft";

/** Normalized public pull-request data used by the portfolio UI. */
export interface CodeContribution {
  repository: string;
  number: number;
  date: string;
  title: string;
  href: string;
  additions: number;
  deletions: number;
}

/** Normalized contribution-calendar cell. */
export interface ContributionDay {
  date: string;
  level: number;
  count: number;
}

/** Fail-open GitHub activity result with independent data availability. */
export interface GitHubActivityResult {
  pullRequestsAvailable: boolean;
  merged: readonly CodeContribution[];
  underReview: readonly CodeContribution[];
  draft: readonly CodeContribution[];
  calendarAvailable: boolean;
  calendar: readonly ContributionDay[];
}

/** Server fetch options preserving Next revalidation. */
export interface GitHubRequestInit extends RequestInit {
  next: { revalidate: number };
}

/** Fetch-compatible dependency used to retrieve GitHub activity. */
export type GitHubFetch = (input: string, init: GitHubRequestInit) => Promise<Response>;

/** Injectable stateless GitHub operations resolved at invocation time. */
export interface GitHubActivityDependencies {
  fetcher?: GitHubFetch;
  resolveToken?: () => string | undefined;
}
