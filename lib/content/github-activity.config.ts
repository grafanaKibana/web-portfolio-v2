import "server-only";

/** GitHub transport limits and unchanged public search document. */
export const githubActivityConfig = {
  revalidateSeconds: 300,
  requestTimeoutMilliseconds: 4_000,
  searchPageLimit: 10,
  pullRequestQuery: `query PullRequests($query: String!, $cursor: String) {
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
}`,
} as const;
