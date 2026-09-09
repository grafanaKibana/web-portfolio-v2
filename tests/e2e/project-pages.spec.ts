import { expect, test } from "@playwright/test";
import { readdirSync } from "node:fs";

const projectSlugs = readdirSync("content/projects")
  .filter((file) => file.endsWith(".mdx"))
  .map((file) => file.slice(0, -4));

test("project MDX renders shared sections, local figures, and existing metadata", async ({ page }) => {
  for (const slug of projectSlugs) {
    const response = await page.goto(`/projects/${slug}`);
    expect(response?.status()).toBe(200);
    const article = page.locator("main#main > article");
    await expect(article.locator("h1")).toHaveCount(1);
    await expect(article.locator("h2")).toHaveText(["About", "Highlights", "How it works", "Project details"]);
    await expect(article.getByRole("heading", { name: /^(my part|role|my role)$/i })).toHaveCount(0);

    for (const figure of await article.locator("figure:has(img)").all()) {
      const image = figure.locator("img");
      await image.scrollIntoViewIfNeeded();
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
      await expect(image).toHaveAttribute("alt", /\S+/);
      await expect(image).toHaveAttribute("loading", "lazy");
      await expect(figure.locator("figcaption")).toBeVisible();
    }
  }
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`project descriptions and figures remain readable without JavaScript in ${colorScheme}`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({
      colorScheme,
      javaScriptEnabled: false,
      viewport: { width: 375, height: 900 },
    });
    const page = await context.newPage();
    try {
      for (const slug of projectSlugs) {
        await page.goto(new URL(`/projects/${slug}`, testInfo.project.use.baseURL).href);
        await expect(page.locator('[data-slot="project-hero"] > p').first()).toBeVisible();
        for (const code of await page.locator("main pre").all()) await expect(code).toBeVisible();
        await expect(page.getByRole("heading", { name: "About", exact: true })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Project details", exact: true })).toBeVisible();
        for (const image of await page.locator("main figure img").all()) {
          await image.scrollIntoViewIfNeeded();
          await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
          expect(await image.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(375);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
        if (slug === "obsidian-tabsdown") {
          await page.evaluate(() => { window.scrollTo(0, 0); });
          await page.screenshot({ path: testInfo.outputPath(`tabsdown-mobile-${colorScheme}.png`), fullPage: true });
          await page.setViewportSize({ width: 1440, height: 1000 });
          await page.screenshot({ path: testInfo.outputPath(`tabsdown-desktop-${colorScheme}.png`), fullPage: true });
          await page.setViewportSize({ width: 375, height: 900 });
        }
      }
    } finally {
      await context.close();
    }
  });
}
