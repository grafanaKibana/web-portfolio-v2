import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import type { PullRequestGroupStyles } from "@/app/(home)/_components/code-activity/pull-request-group";
import type { CodeContribution } from "@/lib/content/github-activity.models";

const styles: PullRequestGroupStyles = {
  group: "group", contribution: "contribution", statusIcon: "statusIcon",
  copy: "copy", repository: "repository", title: "title", meta: "meta", period: "period", diff: "diff",
  additions: "additions", deletions: "deletions", disclosure: "disclosure",
  disclosureSummary: "disclosureSummary", remainder: "remainder",
};

/**
 * Creates uniquely addressable synthetic contributions.
 *
 * @param prefix - Fixture identifier.
 * @returns Synthetic contributions in a stable order.
 */
function contributions(prefix: string): readonly CodeContribution[] {
  return Array.from({ length: 5 }, (_, index) => ({
    repository: `example/${prefix}-${String(index)}`,
    number: index + 1,
    date: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
    title: `Synthetic contribution ${String(index + 1)}`,
    href: `https://example.com/${prefix}/${String(index + 1)}`,
    additions: index + 1,
    deletions: index,
  }));
}

const firstItems = contributions("first");
const secondItems = contributions("second");
const renderer = `
  import { createElement, Fragment } from "react";
  import { renderToStaticMarkup } from "react-dom/server";
  import { GitPullRequest, GitPullRequestDraft } from "lucide-react";
  import { PullRequestGroup } from "./app/(home)/_components/code-activity/pull-request-group.tsx";
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const { firstItems, secondItems, styles } = JSON.parse(chunks.join(""));
  process.stdout.write(renderToStaticMarkup(createElement(Fragment, null,
    createElement(PullRequestGroup, { status: "merged", label: "First", contributions: firstItems, icon: GitPullRequest, styles }),
    createElement(PullRequestGroup, { status: "draft", label: "Second", contributions: secondItems, icon: GitPullRequestDraft, styles }),
  )));
`;
const markup = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", renderer], {
  cwd: process.cwd(), encoding: "utf8", input: JSON.stringify({ firstItems, secondItems, styles }),
});

/**
 * Mounts the server-rendered production disclosure component.
 *
 * @param page - Browser page receiving the fixture.
 */
async function mount(page: Page) {
  await page.setContent(`<!doctype html><main>${markup}<a data-slot="after-fixture" href="#after">After fixture</a></main>`);
}

test("synthetic contribution disclosures remain independent, keyboard operable, and native", async ({ browser, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mount(page);
  const groups = page.locator('[data-slot="pull-request-group"]');
  await expect(groups).toHaveCount(2);
  const first = groups.nth(0);
  const second = groups.nth(1);
  const firstSummary = first.locator('[data-slot="pull-request-disclosure-summary"]');
  const initiallyVisible = await first.locator('[data-slot="pull-request-row"]:visible').count();
  const secondInitiallyVisible = await second.locator('[data-slot="pull-request-row"]:visible').count();
  expect(initiallyVisible).toBeGreaterThan(0);
  await firstSummary.focus();
  await page.keyboard.press("Enter");
  const expandedRows = first.locator('[data-slot="pull-request-row"]:visible');
  expect(await expandedRows.count()).toBeGreaterThan(initiallyVisible);
  await expect(second.locator('[data-slot="pull-request-row"]:visible')).toHaveCount(secondInitiallyVisible);
  expect(await expandedRows.evaluateAll((rows) => new Set(rows.map((row) => row.getAttribute("href"))).size))
    .toBe(firstItems.length);
  await page.keyboard.press("Tab");
  await expect(expandedRows.nth(initiallyVisible)).toBeFocused();
  await firstSummary.focus();
  await page.keyboard.press("Enter");
  await expect(first.locator('[data-slot="pull-request-row"]:visible')).toHaveCount(initiallyVisible);

  const context = await browser.newContext({ javaScriptEnabled: false });
  const nativePage = await context.newPage();
  try {
    await mount(nativePage);
    const nativeGroup = nativePage.locator('[data-slot="pull-request-group"]').first();
    const nativeSummary = nativeGroup.locator('[data-slot="pull-request-disclosure-summary"]');
    const nativeInitial = await nativeGroup.locator('[data-slot="pull-request-row"]:visible').count();
    await nativeSummary.click();
    expect(await nativeGroup.locator('[data-slot="pull-request-row"]:visible').count()).toBeGreaterThan(nativeInitial);
  } finally {
    await context.close();
  }
});
