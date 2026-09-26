import assert from "node:assert/strict";
import test from "node:test";

import type { GitHubActivityResult } from "@/lib/content/github-activity.models";

import {
  codeActivityState,
  contributionCalendarContext,
  pullRequestSummary,
} from "./code-activity.model";

/**
 * Creates deterministic activity data for presentation-model tests.
 *
 * @param overrides - Fixture fields replacing the unavailable baseline.
 * @returns Complete normalized activity fixture.
 */
function activityFixture(overrides: Partial<GitHubActivityResult> = {}): GitHubActivityResult {
  return {
    pullRequestsAvailable: false,
    merged: [],
    underReview: [],
    draft: [],
    calendarAvailable: false,
    calendar: [],
    ...overrides,
  };
}

test("activity availability distinguishes useful fallback states", () => {
  assert.equal(codeActivityState(activityFixture()), "unavailable");
  assert.equal(codeActivityState(activityFixture({ calendarAvailable: true })), "unavailable");
  assert.equal(codeActivityState(activityFixture({
    calendarAvailable: true,
    calendar: [{ date: "2026-01-01", count: 0, level: 0 }],
  })), "calendar-only");
  assert.equal(codeActivityState(activityFixture({ pullRequestsAvailable: true })), "pull-requests-only");
});

test("pull-request summary uses established status language and omits zero counts", () => {
  const contribution = {
    repository: "example/repository",
    number: 1,
    date: "2026-01-01T00:00:00Z",
    title: "Synthetic contribution",
    href: "https://example.com/pull/1",
    additions: 2,
    deletions: 1,
  };
  const activity = activityFixture({
    pullRequestsAvailable: true,
    merged: [contribution],
    underReview: [contribution, contribution],
  });

  assert.equal(pullRequestSummary(activity), "1 merged · 2 open");
  assert.equal(pullRequestSummary(activityFixture({ pullRequestsAvailable: true })), "No recent pull requests");
  assert.equal(pullRequestSummary(activityFixture()), null);
});

test("calendar context uses the exact returned period and contribution total", () => {
  const context = contributionCalendarContext([
    { date: "2026-01-01", count: 0, level: 0 },
    { date: "2026-01-02", count: 3, level: 2 },
    { date: "2026-01-03", count: 1, level: 1 },
  ]);

  assert.deepEqual(context, { range: "Jan 1, 2026–Jan 3, 2026", total: 4 });
  assert.equal(contributionCalendarContext([]), null);
});
