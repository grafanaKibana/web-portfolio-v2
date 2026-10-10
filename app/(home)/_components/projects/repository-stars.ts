import "server-only";

import { repositoryStarsConfig } from "./repository-stars.config";
import type { RepositoryStarsDependencies, RepositoryStarsFetch } from "./repository-stars.models";

/** Loads the total stars across every public repository owned by one GitHub user. */
export class RepositoryStarsService {
  private readonly fetcher: RepositoryStarsFetch;
  private readonly resolveToken: () => string | undefined;

  /**
   * Retains operations without capturing credentials or request state.
   *
   * @param dependencies - Optional fetch and invocation-time token resolver.
   */
  constructor(dependencies: RepositoryStarsDependencies = {}) {
    this.fetcher = dependencies.fetcher ?? ((input, init) => fetch(input, init));
    this.resolveToken = dependencies.resolveToken ?? (() => process.env.GITHUB_TOKEN);
  }

  /**
   * Loads a complete public owned-repository star total.
   *
   * @param username - GitHub username whose repositories are counted.
   * @returns The total, including zero, or null when complete data is unavailable.
   */
  async load(username: string): Promise<number | null> {
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(username)) return null;

    try {
      return await this.fetchTotal(username, this.resolveToken());
    } catch {
      return null;
    }
  }

  /**
   * Fetches and validates every repository page before returning its aggregate.
   *
   * @param username - Validated GitHub username.
   * @param token - Optional server-only GitHub token.
   * @returns The complete star total.
   * @throws When any page, repository, total, or pagination link is invalid.
   */
  private async fetchTotal(username: string, token: string | undefined): Promise<number> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "web-portfolio-v2",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    const authenticationToken = token?.trim();
    if (authenticationToken) headers.Authorization = `Bearer ${authenticationToken}`;

    let total = 0;
    let url: string | null = RepositoryStarsService.firstPageUrl(username);
    const visited = new Set<string>();

    while (url) {
      if (visited.has(url)) throw new Error("GitHub repository pagination repeated a page");
      visited.add(url);
      const response = await this.fetcher(url, {
        cache: "force-cache",
        headers,
        next: { revalidate: repositoryStarsConfig.revalidateSeconds },
        signal: AbortSignal.timeout(repositoryStarsConfig.requestTimeoutMilliseconds),
      });
      if (!response.ok) throw new Error(`GitHub repositories returned ${String(response.status)}`);
      const page = await response.json() as unknown;
      total = RepositoryStarsService.addPage(total, page, username);
      url = RepositoryStarsService.nextPageUrl(response.headers.get("link"), username);
    }

    return total;
  }

  /**
   * Creates the first maximum-size owned-repository page URL.
   *
   * @param username - Validated GitHub username.
   * @returns The first REST API page URL.
   */
  private static firstPageUrl(username: string): string {
    return `https://api.github.com/users/${encodeURIComponent(username)}/repos?type=owner&per_page=100&page=1`;
  }

  /**
   * Adds one validated repository page to an existing total.
   *
   * @param total - Total accumulated from prior valid pages.
   * @param input - Untrusted GitHub response body.
   * @param username - Expected repository owner.
   * @returns The next safe integer total.
   * @throws When the page or a repository is invalid.
   */
  private static addPage(total: number, input: unknown, username: string): number {
    if (!Array.isArray(input)) throw new Error("GitHub repositories returned an invalid page");

    for (const value of input) {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("GitHub repositories returned an invalid repository");
      }
      const repository = value as Record<string, unknown>;
      const owner = repository.owner;
      const stars = repository.stargazers_count;
      const ownerLogin = owner !== null && typeof owner === "object" && !Array.isArray(owner)
        ? (owner as Record<string, unknown>).login
        : null;
      if (repository.private !== false
        || typeof ownerLogin !== "string"
        || ownerLogin.toLowerCase() !== username.toLowerCase()
        || typeof stars !== "number"
        || !Number.isSafeInteger(stars)
        || stars < 0
        || !Number.isSafeInteger(total + stars)) {
        throw new Error("GitHub repositories returned invalid star data");
      }
      total += stars;
    }
    return total;
  }

  /**
   * Reads and validates GitHub's next-page link.
   *
   * @param link - Untrusted HTTP Link header.
   * @param username - Expected repository owner.
   * @returns The next page URL, or null after the final page.
   * @throws When a next-page link does not target the same GitHub listing.
   */
  private static nextPageUrl(link: string | null, username: string): string | null {
    if (!link) return null;
    const match = [...link.matchAll(/<([^>]+)>;\s*rel="([^"]+)"/g)]
      .find(([, , relation]) => relation === "next");
    if (!match?.[1]) return null;

    const url = new URL(match[1]);
    const page = url.searchParams.get("page");
    if (url.protocol !== "https:"
      || url.hostname !== "api.github.com"
      || url.pathname !== `/users/${username}/repos`
      || url.searchParams.get("type") !== "owner"
      || url.searchParams.get("per_page") !== "100"
      || page === null
      || !/^[1-9]\d*$/.test(page)) {
      throw new Error("GitHub repositories returned an invalid next-page link");
    }
    return url.toString();
  }
}
