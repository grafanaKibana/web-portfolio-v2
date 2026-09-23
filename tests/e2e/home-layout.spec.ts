import { expect, test, type Page } from "@playwright/test";
import { compile } from "sass";
import { readShellWidthContract } from "./shell-width";

const experienceCss = compile(
  "app/(home)/_components/experience/experience.module.scss",
).css.replaceAll(/:global\(([^)]+)\)/g, "$1");
const educationCss = compile(
  "app/(home)/_components/education/education.module.scss",
).css.replaceAll(/:global\(([^)]+)\)/g, "$1");

const shellWidths = [390, 767, 768, 1024, 1088, 1279, 1280, 1440, 1920] as const;

/**
 * Reads numeric horizontal padding from an element.
 *
 * @param page - Browser page containing the element.
 * @param selector - Selector for the element whose padding is measured.
 * @returns Left and right padding in CSS pixels.
 */
async function readHorizontalPadding(page: Page, selector: string) {
  return page.locator(selector).evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      left: Number.parseFloat(style.paddingLeft),
      right: Number.parseFloat(style.paddingRight),
    };
  });
}

/**
 * Parses the resolved pixel tracks of a computed grid template.
 *
 * @param value - Computed grid-template-columns value.
 * @returns Resolved grid-track widths in CSS pixels.
 */
function parseGridTracks(value: string) {
  return value.split(" ").map((track) => Number.parseFloat(track));
}

for (const width of shellWidths) {
  test(`Home shell preserves the editorial gutter contract at ${String(width)}px`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");

    const { pageGutter, headerGutter, maxContentWidth, maxWidthReached } = await readShellWidthContract(page);
    const pagePadding = await readHorizontalPadding(page, "#about");
    const footerPadding = await readHorizontalPadding(page, "footer");
    const navigationPadding = await readHorizontalPadding(
      page,
      '[data-slot="site-header"] nav',
    );

    expect(pagePadding.left).toBeCloseTo(pageGutter, 1);
    expect(pagePadding.right).toBeCloseTo(pageGutter, 1);
    expect(footerPadding.left).toBeCloseTo(pageGutter, 1);
    expect(footerPadding.right).toBeCloseTo(pageGutter, 1);
    expect(navigationPadding.left).toBeCloseTo(headerGutter, 1);
    expect(navigationPadding.right).toBeCloseTo(headerGutter, 1);

    if (maxWidthReached) {
      const contentWidth = await page.locator("#about").evaluate((element) => {
        const style = getComputedStyle(element);
        return element.clientWidth
          - Number.parseFloat(style.paddingLeft)
          - Number.parseFloat(style.paddingRight);
      });
      expect(contentWidth).toBeCloseTo(maxContentWidth, 0);
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`width tokens resize the page and header together in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    await page.locator("html").evaluate((root) => {
      root.style.setProperty("--page-shell-max-width", "54rem");
    });
    await expect.poll(async () => (await readHorizontalPadding(page, "#about")).left).toBeCloseTo(288, 1);
    await expect.poll(async () => (await readHorizontalPadding(page, '[data-slot="site-header"] nav')).left).toBeCloseTo(288, 1);
    await expect(page.locator("#intro-heading")).toHaveCSS("max-width", "none");

    await page.locator("html").evaluate((root) => {
      root.style.setProperty("--page-shell-max-width", "68ch");
    });
    const { pageGutter: characterWidthGutter } = await readShellWidthContract(page);
    await expect.poll(async () => (await readHorizontalPadding(page, "#about")).left).toBeCloseTo(characterWidthGutter, 1);

    await page.setViewportSize({ width: 1024, height: 900 });
    await page.locator("html").evaluate((root) => {
      root.style.removeProperty("--page-shell-max-width");
      root.style.setProperty("--page-shell-desktop-min-gutter", "6rem");
    });
    await expect.poll(async () => (await readHorizontalPadding(page, "#about")).left).toBeCloseTo(96, 1);
    await expect.poll(async () => (await readHorizontalPadding(page, '[data-slot="site-header"] nav')).left).toBeCloseTo(96, 1);

    await page.setViewportSize({ width: 390, height: 900 });
    await page.locator("html").evaluate((root) => {
      root.style.setProperty("--page-shell-mobile-gutter", "2rem");
    });
    await expect.poll(async () => (await readHorizontalPadding(page, "#about")).left).toBeCloseTo(32, 1);
    await expect.poll(async () => (await readHorizontalPadding(page, '[data-slot="site-header"] nav')).left).toBeCloseTo(28, 1);
  });
}

for (const width of [1279, 1280] as const) {
  test(`Experience rail geometry stays coordinated at ${String(width)}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    await page.setContent(`
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; }
        .timeline, .experienceItem { position: relative; }
        .experienceItem { display: grid; }
        ${experienceCss}
      </style>
      <main class="experience">
        <div class="timeline">
          <article class="experienceItem">
            <p class="experiencePeriod">2024 — Present</p>
            <span class="timelineDot timelineDotCurrent" aria-hidden="true"></span>
            <div><h2 class="roleTitle">Role</h2><p>Summary</p></div>
          </article>
        </div>
      </main>
    `);

    const expectedRail = width === 1280 ? 184 : 140;
    const expectedMarker = width === 1280 ? 180 : 136;
    const geometry = await page.locator(".experienceItem").evaluate((item) => {
      const timeline = item.closest(".timeline");
      const marker = item.querySelector(".timelineDotCurrent");
      if (!timeline || !marker) throw new Error("Experience fixture must be measurable");
      return {
        tracks: getComputedStyle(item).gridTemplateColumns,
        dividerLeft: Number.parseFloat(getComputedStyle(timeline, "::before").left),
        markerLeft: Number.parseFloat(getComputedStyle(marker).left),
      };
    });

    expect(parseGridTracks(geometry.tracks)[0]).toBeCloseTo(expectedRail, 1);
    expect(geometry.dividerLeft).toBeCloseTo(expectedRail, 1);
    expect(geometry.markerLeft).toBeCloseTo(expectedMarker, 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`Education rail geometry keeps stable insets at ${String(width)}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    await page.setContent(`
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; }
        .educationRow { display: grid; }
        ${educationCss}
      </style>
      <main class="educationRows">
        <article class="educationRow">
          <p class="rowLabel">2024</p>
          <div data-slot="education-row-content"><h2 class="qualification">Qualification</h2></div>
        </article>
      </main>
    `);

    const expectedRail = width === 1280 ? 184 : 140;
    const geometry = await page.locator(".educationRow").evaluate((row) => {
      const rows = row.closest(".educationRows");
      const label = row.querySelector(".rowLabel");
      const content = row.querySelector('[data-slot="education-row-content"]');
      if (!rows || !label || !content) throw new Error("Education fixture must be measurable");
      return {
        tracks: getComputedStyle(row).gridTemplateColumns,
        dividerLeft: Number.parseFloat(getComputedStyle(rows, "::before").left),
        labelInset: Number.parseFloat(getComputedStyle(label).paddingRight),
        contentInset: Number.parseFloat(getComputedStyle(content).paddingLeft),
      };
    });

    expect(parseGridTracks(geometry.tracks)[0]).toBeCloseTo(expectedRail, 1);
    expect(geometry.dividerLeft).toBeCloseTo(expectedRail, 1);
    expect(geometry.labelInset).toBeCloseTo(32, 1);
    expect(geometry.contentInset).toBeCloseTo(32, 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
