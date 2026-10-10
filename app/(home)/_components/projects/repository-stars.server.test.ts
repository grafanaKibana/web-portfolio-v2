import assert from "node:assert/strict";
import test from "node:test";

import type { RepositoryStarsFetch, RepositoryStarsRequestInit } from "./repository-stars.models";
import { RepositoryStarsService } from "./repository-stars";

/**
 * Creates a valid public repository fixture.
 *
 * @param stars - Repository star count.
 * @param owner - Repository owner login.
 * @returns A repository response fixture.
 */
function repository(stars: number, owner = "fixture-user") {
  return { owner: { login: owner }, private: false, stargazers_count: stars };
}

/**
 * Creates a JSON response with optional pagination.
 *
 * @param body - JSON response body.
 * @param next - Optional next page number.
 * @param status - HTTP response status.
 * @returns A GitHub API response fixture.
 */
function response(body: unknown, next?: number, status = 200): Response {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (next) {
    headers.set(
      "Link",
      `<https://api.github.com/users/fixture-user/repos?type=owner&per_page=100&page=${String(next)}>; rel="next"`,
    );
  }
  return new Response(JSON.stringify(body), { headers, status });
}

test("RepositoryStarsService totals every public owned-repository page", async () => {
  const requests: Array<{ input: string; init: RepositoryStarsRequestInit }> = [];
  /**
   * Returns deterministic repository pages while recording request options.
   *
   * @param input - Requested GitHub URL.
   * @param init - Requested fetch options.
   * @returns The requested repository page.
   */
  const fetcher: RepositoryStarsFetch = (input, init) => {
    requests.push({ input, init });
    return Promise.resolve(input.endsWith("page=1")
      ? response([repository(3), repository(5)], 2)
      : response([repository(7)]));
  };

  const total = await new RepositoryStarsService({
    fetcher,
    /** @returns The server credential fixture. */
    resolveToken: () => " secret-token ",
  }).load("fixture-user");

  assert.equal(total, 15);
  assert.equal(requests.length, 2);
  assert.ok(requests[1]?.input.endsWith("page=2"));
  for (const { init } of requests) {
    const headers = new Headers(init.headers);
    assert.equal(headers.get("Authorization"), "Bearer secret-token");
    assert.equal(headers.get("X-GitHub-Api-Version"), "2022-11-28");
    assert.equal(init.cache, "force-cache");
    assert.deepEqual(init.next, { revalidate: 86_400 });
    assert.ok(init.signal instanceof AbortSignal);
  }
});

test("RepositoryStarsService preserves a real zero without requiring credentials", async () => {
  let authorization: string | null = "unexpected";
  const total = await new RepositoryStarsService({
    /**
     * Records request authorization and returns an empty repository page.
     *
     * @param _input - Requested GitHub URL.
     * @param init - Requested fetch options.
     * @returns An empty repository page.
     */
    fetcher: (_input, init) => {
      authorization = new Headers(init.headers).get("Authorization");
      return Promise.resolve(response([]));
    },
    /** @returns No credential for an unauthenticated public request. */
    resolveToken: () => undefined,
  }).load("fixture-user");

  assert.equal(total, 0);
  assert.equal(authorization, null);
});

test("RepositoryStarsService returns unavailable instead of a partial total", async () => {
  const service = new RepositoryStarsService({
    /**
     * Returns one valid page followed by an API failure.
     *
     * @param input - Requested GitHub URL.
     * @returns A successful first page or failed later page.
     */
    fetcher: (input) => Promise.resolve(input.endsWith("page=1")
      ? response([repository(11)], 2)
      : response({ message: "rate limited" }, undefined, 403)),
  });

  assert.equal(await service.load("fixture-user"), null);
});

test("RepositoryStarsService rejects invalid data on a later page", async () => {
  const service = new RepositoryStarsService({
    /**
     * Returns one valid page followed by invalid star data.
     *
     * @param input - Requested GitHub URL.
     * @returns A valid first page or malformed later page.
     */
    fetcher: (input) => Promise.resolve(input.endsWith("page=1")
      ? response([repository(11)], 2)
      : response([repository(-1)])),
  });

  assert.equal(await service.load("fixture-user"), null);
});

test("RepositoryStarsService resolves credentials independently for each load", async () => {
  let token = "first";
  const authorizations: string[] = [];
  /**
   * Records the per-request authorization header.
   *
   * @param _input - Requested GitHub URL.
   * @param init - Requested fetch options.
   * @returns A valid repository page.
   */
  const fetcher: RepositoryStarsFetch = (_input, init) => {
    authorizations.push(new Headers(init.headers).get("Authorization") ?? "");
    return Promise.resolve(response([repository(1)]));
  };
  const service = new RepositoryStarsService({
    fetcher,
    /** @returns The current credential fixture at invocation time. */
    resolveToken: () => token,
  });

  assert.equal(await service.load("fixture-user"), 1);
  token = "second";
  assert.equal(await service.load("fixture-user"), 1);
  assert.deepEqual(authorizations, ["Bearer first", "Bearer second"]);
});

test("RepositoryStarsService rejects invalid owners and pagination targets", async () => {
  let calls = 0;
  const service = new RepositoryStarsService({
    /** @returns A page with an invalid cross-origin pagination link. */
    fetcher: () => {
      calls += 1;
      return Promise.resolve(new Response(JSON.stringify([repository(1)]), {
        headers: {
          Link: '<https://example.com/users/fixture-user/repos?type=owner&per_page=100&page=2>; rel="next"',
        },
      }));
    },
  });

  assert.equal(await service.load("invalid--"), null);
  assert.equal(calls, 0);
  assert.equal(await service.load("fixture-user"), null);
  assert.equal(calls, 1);
});
