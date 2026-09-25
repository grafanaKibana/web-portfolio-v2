import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { compile } from "sass";
import type { PullRequestGroupStyles } from "@/app/(home)/_components/code-activity/pull-request-group";
import type { CodeContribution } from "@/lib/content/github-activity.models";

const activityCss = compile("app/(home)/_components/code-activity/code-activity.module.scss")
  .css.replaceAll(/:global\(([^)]+)\)/g, "$1");

const styles: PullRequestGroupStyles = {
  statusIcon: "statusIcon",
  additions: "additions",
  deletions: "deletions",
  disclosure: "disclosure",
  disclosureSummary: "disclosureSummary",
  remainder: "remainder",
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
    createElement(PullRequestGroup, { status: "draft", label: "Second", contributions: secondItems, icon: GitPullRequestDraft, styles },
      createElement("figure", { "data-slot": "activity-visualization", className: "mx-0 my-4 lg:my-6", "aria-label": "Synthetic calendar" },
        createElement("button", { type: "button" }, "Synthetic contribution day"))),
  )));
`;
const markup = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", renderer], {
  cwd: process.cwd(), encoding: "utf8", input: JSON.stringify({ firstItems, secondItems, styles }),
});

/**
 * Mounts the server-rendered production disclosure component.
 *
 * @param page - Browser page receiving the fixture.
 * @param fixtureMarkup - Server-rendered synthetic content.
 */
async function mount(page: Page, fixtureMarkup = markup) {
  await page.goto("/");
  const shell = await page.evaluate(() => ({
    styles: [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => link.outerHTML).join(""),
    bodyClass: document.body.className,
    htmlClass: document.documentElement.className,
  }));
  await page.route("**/__code-activity-fixture", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html class="${shell.htmlClass}"><head><meta charset="utf-8">${shell.styles}<style>${activityCss}</style></head><body class="${shell.bodyClass}"><main class="page-shell-gutter flex flex-col gap-8 lg:gap-12">${fixtureMarkup}<a data-slot="after-fixture" href="#after">After fixture</a></main></body></html>`,
  }));
  await page.goto("/__code-activity-fixture");
}

test("synthetic contribution disclosures remain independent, keyboard operable, and native @webkit", async ({ browser, browserName, page }) => {
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
  await page.keyboard.press(browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab");
  await expect(expandedRows.nth(initiallyVisible)).toBeFocused();
  await firstSummary.focus();
  await page.keyboard.press("Enter");
  await expect(first.locator('[data-slot="pull-request-row"]:visible')).toHaveCount(initiallyVisible);

  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: page.url(), reducedMotion: "reduce" });
  const nativePage = await context.newPage();
  try {
    await mount(nativePage);
    const nativeCalendar = nativePage.locator('[data-slot="activity-visualization"]');
    await expect(nativeCalendar).toBeHidden();
    await nativePage.locator('[data-slot="pull-request-disclosure-summary"]').last().click();
    await expect(nativeCalendar).toBeVisible();
    const nativeGroup = nativePage.locator('[data-slot="pull-request-group"]').first();
    const nativeSummary = nativeGroup.locator('[data-slot="pull-request-disclosure-summary"]');
    const nativeInitial = await nativeGroup.locator('[data-slot="pull-request-row"]:visible').count();
    await nativeSummary.click();
    expect(await nativeGroup.locator('[data-slot="pull-request-row"]:visible').count()).toBeGreaterThan(nativeInitial);
  } finally {
    await context.close();
  }
});


for (const count of [0, 2, 5]) {
  const calendarMarkup = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", renderer], {
    cwd: process.cwd(), encoding: "utf8", input: JSON.stringify({ firstItems, secondItems: secondItems.slice(0, count), styles }),
  });
  for (const width of [390, 1440]) {
    for (const theme of ["light", "dark"] as const) {
      test(`calendar follows all contributions only while expanded: ${String(count)} items, ${String(width)}px, ${theme} @webkit`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ reducedMotion: "reduce", colorScheme: theme });
        await mount(page, calendarMarkup);
        await page.locator("html").evaluate((root, theme) => { root.classList.remove("light", "dark"); root.classList.add(theme); }, theme);
        const group = page.locator('[data-slot="pull-request-group"]').last();
        const calendar = group.locator('[data-slot="activity-visualization"]');
        const summary = group.locator("summary");
        await expect(calendar).toBeHidden();
        await expect(summary).toHaveAccessibleName(count > 3 ? /Show more.*Second pull requests/ : /Show more Second activity/);
        await summary.focus();
        await page.keyboard.press("Enter");
        await expect(calendar).toBeVisible();
        await expect(group.locator('[data-slot="pull-request-row"]:visible')).toHaveCount(count);
        if (count > 0) {
          const row = await group.locator('[data-slot="pull-request-row"]').last().boundingBox();
          const chart = await calendar.boundingBox();
          expect(row).not.toBeNull();
          expect(chart).not.toBeNull();
          if (row && chart) expect(chart.y).toBeGreaterThanOrEqual(row.y + row.height);
        }
        await expect(page.locator("body")).toHaveJSProperty("scrollWidth", width);
        await page.screenshot({ path: `output/playwright/calendar-disclosure/${String(count)}-${String(width)}-${theme}.png`, fullPage: true });
        await summary.click();
        await expect(calendar).toBeHidden();
      });
    }
  }
}
