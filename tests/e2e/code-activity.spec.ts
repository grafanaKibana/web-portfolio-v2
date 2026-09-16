import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { compile } from "sass";

import type { PullRequestGroupStyles } from "@/app/(home)/_components/code-activity/pull-request-group";
import type {
  CodeContribution,
  CodeContributionStatus,
} from "@/lib/content/github-activity";

const styles: PullRequestGroupStyles = {
  group: "group",
  groupLabel: "groupLabel",
  contribution: "contribution",
  statusIcon: "statusIcon",
  copy: "copy",
  repository: "repository",
  title: "title",
  meta: "meta",
  period: "period",
  diff: "diff",
  additions: "additions",
  deletions: "deletions",
  disclosure: "disclosure",
  disclosureSummary: "disclosureSummary",
  remainder: "remainder",
};
const statusFixtures: ReadonlyArray<{
  status: CodeContributionStatus;
  label: string;
}> = [
  { status: "under-review", label: "Under review" },
  { status: "draft", label: "Draft" },
  { status: "merged", label: "Merged" },
];
const moduleCss = compile(
  "app/(home)/_components/code-activity/code-activity.module.scss",
).css.replaceAll(/:global\(([^)]+)\)/g, "$1");

/**
 * Recursively reads built production CSS assets used by the Home page.
 *
 * @param directory - Build-output directory to scan.
 * @returns Concatenated production CSS.
 */
function readProductionCss(directory: string): string {
  if (!existsSync(directory)) return "";
  return readdirSync(directory, { withFileTypes: true }).map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? readProductionCss(path) : entry.name.endsWith(".css") ? readFileSync(path, "utf8") : "";
  }).join("\n");
}

const productionCss = readProductionCss(".next/static/css");

test.beforeAll(() => {
  expect(productionCss, "Build production CSS before running Code activity browser tests").not.toBe("");
});

/**
 * Creates descending, uniquely addressable pull-request fixtures.
 *
 * @param count - Number of contributions to create.
 * @param prefix - Repository and URL discriminator.
 * @returns Synthetic contributions in newest-first order.
 */
function contributions(count: number, prefix = "fixture"): readonly CodeContribution[] {
  return Array.from({ length: count }, (_, index) => ({
    repository: `example/${prefix}-repository-${String(index + 1)}`,
    number: 100 + index,
    date: `2026-${String(12 - index).padStart(2, "0")}-01T00:00:00Z`,
    title: index === 0
      ? "Implement an intentionally long pull request title that wraps without clipping at narrow widths"
      : `Contribution ${String(index + 1)}`,
    href: `https://github.com/example/${prefix}-repository-${String(index + 1)}/pull/${String(100 + index)}`,
    additions: 1_000 + index,
    deletions: 200 + index,
  }));
}

/** Input for one server-rendered pull-request group fixture. */
interface GroupFixtureRequest {
  status: CodeContributionStatus;
  label: string;
  items: readonly CodeContribution[];
}

const groupFixtureRequests: readonly GroupFixtureRequest[] = [
  ...statusFixtures.flatMap(({ status, label }) => [0, 1, 3, 4, 7].map((count) => ({
    status,
    label,
    items: contributions(count, status),
  }))),
  { status: "merged", label: "Merged", items: contributions(7) },
];
// Playwright rewrites JSX for component tests; render real React markup in a separate Node process.
const renderer = `
  import { createElement } from "react";
  import { renderToStaticMarkup } from "react-dom/server";
  import { GitPullRequest, GitPullRequestDraft, MessageCircleMore } from "lucide-react";
  import { PullRequestGroup } from "./app/(home)/_components/code-activity/pull-request-group.tsx";
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const { requests, styles } = JSON.parse(chunks.join(""));
  const icons = { merged: GitPullRequest, draft: GitPullRequestDraft, "under-review": MessageCircleMore };
  process.stdout.write(JSON.stringify(Object.fromEntries(requests.map((request) => [
    JSON.stringify(request),
    renderToStaticMarkup(createElement(PullRequestGroup, {
      status: request.status,
      label: request.label,
      contributions: request.items,
      icon: icons[request.status],
      styles,
    })),
  ]))));
`;
const renderedGroups = JSON.parse(execFileSync(
  process.execPath,
  ["--import", "tsx", "--input-type=module", "--eval", renderer],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    input: JSON.stringify({ requests: groupFixtureRequests, styles }),
  },
)) as Record<string, string>;

/**
 * Renders the production group component without a framework runtime.
 *
 * @param status - Contribution status represented by the group.
 * @param label - Visible group label.
 * @param items - Contributions rendered in existing order.
 * @returns Static production component markup.
 */
function groupMarkup(
  status: CodeContributionStatus,
  label: string,
  items: readonly CodeContribution[],
): string {
  const markup = renderedGroups[JSON.stringify({ status, label, items })];
  if (markup === undefined) throw new Error("Missing pre-rendered PullRequestGroup fixture");
  return markup;
}

/**
 * Mounts deterministic component output with production CSS.
 *
 * @param page - Active browser page.
 * @param markup - Static group markup to mount.
 * @param theme - Explicit color scheme.
 * @param loadPageAssets - Whether to serve the fixture with production fonts at the configured origin.
 */
async function mount(
  page: Page,
  markup: string,
  theme: "light" | "dark" = "light",
  loadPageAssets = false,
) {
  const fontClasses = loadPageAssets
    ? ((await (await page.request.get("/")).text()).match(/<html[^>]*class="([^"]*)"/)?.[1] ?? "")
    : "";
  const documentMarkup = `<!doctype html>
    <html class="${fontClasses} ${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <style>${productionCss}\n${moduleCss}</style></head>
    <body><main class="page-shell-gutter">${markup}<a data-slot="after-fixture" href="#after">After fixture</a></main></body></html>`;
  if (loadPageAssets) {
    await page.route("**/__code-activity-fixture", (route) => route.fulfill({ contentType: "text/html", body: documentMarkup }));
    await page.goto("/__code-activity-fixture");
    await page.evaluate(() => document.fonts.ready);
  } else {
    await page.setContent(documentMarkup);
  }
}

for (const fixture of statusFixtures) {
  for (const count of [0, 1, 3, 4, 7]) {
    test(`${fixture.label} with ${String(count)} pull requests shows the disclosure threshold`, async ({ page }) => {
      await mount(page, groupMarkup(fixture.status, fixture.label, contributions(count, fixture.status)));
      const group = page.locator('[data-slot="pull-request-group"]');
      if (count === 0) {
        await expect(group).toHaveCount(0);
        return;
      }

      await expect(group.locator('[data-slot="pull-request-row"]:visible')).toHaveCount(Math.min(count, 3));
      expect(await group.locator('[data-slot="pull-request-row"]:visible').evaluateAll((rows) =>
        rows.map((row) => row.getAttribute("href")))).toEqual(
        contributions(count, fixture.status).slice(0, 3).map(({ href }) => href),
      );
      const summary = group.locator('[data-slot="pull-request-disclosure-summary"]');
      await expect(summary).toHaveCount(count > 3 ? 1 : 0);
      if (count > 3) {
        await expect(summary).toHaveAccessibleName(`Show more (${String(count - 3)}) ${fixture.label} pull requests`);
      }
    });
  }
}

test("disclosure reveals every remaining pull request once and collapses to three", async ({ page }) => {
  const items = contributions(7);
  await mount(page, groupMarkup("merged", "Merged", items));
  const group = page.locator('[data-slot="pull-request-group"]');
  const summary = group.locator('[data-slot="pull-request-disclosure-summary"]');

  await summary.click();
  await expect(group.locator('[data-slot="pull-request-row"]:visible')).toHaveCount(7);
  expect(await group.locator('[data-slot="pull-request-row"]:visible').evaluateAll((rows) =>
    rows.map((row) => row.getAttribute("href")))).toEqual(items.map(({ href }) => href));
  await expect(summary).toHaveAccessibleName("Show less Merged pull requests");

  await summary.click();
  await expect(group.locator('[data-slot="pull-request-row"]:visible')).toHaveCount(3);
});

test("each pull-request group expands independently", async ({ page }) => {
  const merged = groupMarkup("merged", "Merged", contributions(7, "merged"));
  const draft = groupMarkup("draft", "Draft", contributions(4, "draft"));
  await mount(page, `${merged}${draft}`);
  const groups = page.locator('[data-slot="pull-request-group"]');

  await groups.nth(0).locator('[data-slot="pull-request-disclosure-summary"]').click();
  await expect(groups.nth(0).locator('[data-slot="pull-request-row"]:visible')).toHaveCount(7);
  await expect(groups.nth(1).locator('[data-slot="pull-request-row"]:visible')).toHaveCount(3);
  await expect(groups.nth(1).locator('[data-slot="pull-request-disclosure"]')).not.toHaveAttribute("open", "");
  await groups.nth(1).locator('[data-slot="pull-request-disclosure-summary"]').click();
  await groups.nth(0).locator('[data-slot="pull-request-disclosure-summary"]').click();
  await expect(groups.nth(0).locator('[data-slot="pull-request-row"]:visible')).toHaveCount(3);
  await expect(groups.nth(1).locator('[data-slot="pull-request-row"]:visible')).toHaveCount(4);
});

test("keyboard toggles disclosure and enters the revealed links in order", async ({ browserName, page }) => {
  await mount(page, groupMarkup("merged", "Merged", contributions(7)));
  const rows = page.locator('[data-slot="pull-request-row"]');
  const summary = page.locator('[data-slot="pull-request-disclosure-summary"]');
  // Safari's native setting uses Option+Tab for link navigation.
  const linkTab = browserName === "webkit" ? "Alt+Tab" : "Tab";
  const linkShiftTab = browserName === "webkit" ? "Alt+Shift+Tab" : "Shift+Tab";

  await rows.nth(2).focus();
  await page.keyboard.press("Tab");
  await expect(summary).toBeFocused();
  await page.keyboard.press(linkTab);
  await expect(page.locator('[data-slot="after-fixture"]')).toBeFocused();
  await page.keyboard.press(linkShiftTab);
  await expect(summary).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(summary).toBeFocused();
  await expect(page.locator('[data-slot="pull-request-row"]:visible')).toHaveCount(7);
  await page.keyboard.press("Space");
  await expect(summary).toBeFocused();
  await expect(page.locator('[data-slot="pull-request-row"]:visible')).toHaveCount(3);
  await page.keyboard.press("Space");
  await page.keyboard.press(linkTab);
  await expect(rows.nth(3)).toBeFocused();
});

test("native disclosure remains operable when JavaScript is disabled", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await mount(page, groupMarkup("merged", "Merged", contributions(7)));
    const summary = page.locator('[data-slot="pull-request-disclosure-summary"]');
    await expect(page.locator('[data-slot="pull-request-row"]:visible')).toHaveCount(3);
    await summary.press("Enter");
    await expect(page.locator('[data-slot="pull-request-row"]:visible')).toHaveCount(7);
    await summary.press("Space");
    await expect(page.locator('[data-slot="pull-request-row"]:visible')).toHaveCount(3);
  } finally {
    await context.close();
  }
});

test("reduced motion reveals overflow without hidden or animating rows", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mount(page, groupMarkup("merged", "Merged", contributions(7)));
  await page.locator('[data-slot="pull-request-disclosure-summary"]').press("Enter");
  expect(await page.locator('[data-slot="pull-request-disclosure"]').evaluate((element) =>
    element.getAnimations({ subtree: true }).length)).toBe(0);
  const remainderRows = page.locator('[data-slot="pull-request-remainder"] [data-slot="pull-request-row"]');

  await expect(remainderRows).toHaveCount(4);
  for (const row of await remainderRows.all()) await expect(row).toBeVisible();
  expect(await remainderRows.evaluateAll((rows) => rows.every((row) => {
    const item = row.closest("li");
    return item !== null
      && getComputedStyle(item).opacity === "1"
      && !item.hasAttribute("data-page-motion-row")
      && item.getAnimations().length === 0;
  }))).toBe(true);
});

for (const theme of ["light", "dark"] as const) {
  test(`synthetic activity keeps success and brand accents independent in ${theme} mode`, async ({ page }) => {
    const calendarMarkup = `<div class="chart"><div class="chartDays" role="group" aria-label="Synthetic contribution calendar">
      <button aria-label="Synthetic contribution day" class="chartDay" data-level="4" data-slot="contribution-day" type="button"></button>
    </div></div>`;
    await mount(page, `${groupMarkup("merged", "Merged", contributions(1, "merged"))}${calendarMarkup}`, theme);

    const status = page.locator('[data-slot="pull-request-status"][data-status="merged"]');
    const additions = page.locator('[data-slot="pull-request-diff"] > span:first-child');
    const day = page.locator('[data-slot="contribution-day"][data-level="4"]');
    const successColor = await additions.evaluate((element) => getComputedStyle(element).color);
    const dayBefore = await day.evaluate((element) => getComputedStyle(element).backgroundImage);

    await expect(status).toHaveCSS("stroke", successColor);
    await expect(additions).toHaveCSS("background-image", "none");
    await expect(day).toHaveCSS("background-image", /linear-gradient.*58%/);
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--brand-accent", "rgb(120, 70, 190)");
      document.documentElement.style.setProperty("--brand-accent-end", "rgb(235, 85, 45)");
    });
    await expect(day).not.toHaveCSS("background-image", dayBefore);
    await expect(status).toHaveCSS("stroke", successColor);
    await expect(additions).toHaveCSS("color", successColor);

    await page.evaluate(() => {
      document.documentElement.style.setProperty("--success", "rgb(20, 120, 60)");
    });
    await expect(status).toHaveCSS("stroke", "rgb(20, 120, 60)");
    await expect(additions).toHaveCSS("color", "rgb(20, 120, 60)");
  });
}

test("disclosure animates both directions and keeps its control below the visible list", async ({ page }) => {
  await mount(page, groupMarkup("merged", "Merged", contributions(7)));
  const disclosure = page.locator('[data-slot="pull-request-disclosure"]');
  const closedHeight = await disclosure.evaluate((element) => element.getBoundingClientRect().height);

  for (const open of [true, false]) {
    const heights = await disclosure.evaluate(async (element, expanded) => {
      const details = element as HTMLDetailsElement;
      const frames = [details.getBoundingClientRect().height];
      details.open = expanded;
      const started = performance.now();
      while (performance.now() - started < 350) {
        await new Promise(requestAnimationFrame);
        frames.push(details.getBoundingClientRect().height);
      }
      return frames;
    }, open);
    const start = heights[0];
    const end = heights.at(-1);
    if (start === undefined || end === undefined) throw new Error("Disclosure animation must produce frame samples");
    expect(open ? end > start : end < start).toBe(true);
    expect(heights.some((height) => height > Math.min(start, end) + 1 && height < Math.max(start, end) - 1)).toBe(true);
    if (!open) expect(end).toBeCloseTo(closedHeight, 0);
  }

  await disclosure.evaluate(async (element) => {
    const details = element as HTMLDetailsElement;
    details.open = true;
    await new Promise(requestAnimationFrame);
    details.open = false;
    await new Promise(requestAnimationFrame);
    details.open = true;
  });
  await expect(disclosure.locator('[data-slot="pull-request-row"]:visible')).toHaveCount(4);
  await expect.poll(() => disclosure.evaluate((element) => {
    const control = element.querySelector("summary");
    const lastRow = element.querySelector("li:last-child");
    if (!control || !lastRow) throw new Error("Expanded disclosure must contain a control and rows");
    return control.getBoundingClientRect().top - lastRow.getBoundingClientRect().bottom;
  })).toBeGreaterThanOrEqual(0);
});

for (const viewport of [{ width: 390, height: 900 }, { width: 1280, height: 900 }]) {
  for (const theme of ["light", "dark"] as const) {
    test(`${theme} disclosure at ${String(viewport.width)}px has focus, touch target, wrapping, and no overflow`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await mount(page, groupMarkup("merged", "Merged", contributions(7)), theme, true);
      const summary = page.locator('[data-slot="pull-request-disclosure-summary"]');
      await summary.focus();
      const summaryBox = await summary.boundingBox();
      if (!summaryBox) throw new Error("Disclosure summary must be measurable");
      expect(summaryBox.height).toBeGreaterThanOrEqual(44);
      expect(await summary.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await testInfo.attach(`${theme}-${String(viewport.width)}-closed`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });

      await summary.click();
      await expect.poll(() => summary.evaluate((element) => {
        const lastRow = element.parentElement?.querySelector("li:last-child");
        if (!lastRow) throw new Error("Expanded disclosure must contain rows");
        return element.getBoundingClientRect().top - lastRow.getBoundingClientRect().bottom;
      })).toBeGreaterThanOrEqual(0);
      const boundaries = await page.locator('[data-slot="pull-request-disclosure"]').evaluate((disclosure) => {
        const control = disclosure.querySelector("summary");
        if (!control) throw new Error("Disclosure control must be measurable");
        return [getComputedStyle(disclosure).borderTopWidth, getComputedStyle(control).borderTopWidth];
      });
      expect(boundaries).toEqual(["1px", "1px"]);
      expect(await page.locator('[data-slot="pull-request-title"]').first().evaluate((title) =>
        title.scrollWidth <= title.clientWidth && title.scrollHeight <= title.clientHeight)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await testInfo.attach(`${theme}-${String(viewport.width)}-open`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
    });
  }
}
