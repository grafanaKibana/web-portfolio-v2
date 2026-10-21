import { expect, test, type Page } from "@playwright/test";

import { getSiteOrigin } from "@/lib/seo/site-url";

const siteOrigin = getSiteOrigin();

const collections = [
  { path: "/articles", rowSlot: "article-row" },
  { path: "/projects", rowSlot: "project-row" },
] as const;
const staticRoutes = ["/accessibility", "/privacy", "/terms", "/for-robots"] as const;

/**
 * Finds unique internal detail destinations exposed by a collection.
 *
 * @param page - Rendered collection page.
 * @param rowSlot - Collection row data slot.
 * @returns Discovered internal destinations in document order.
 */
async function discoverDetailPaths(page: Page, rowSlot: string) {
  return page.locator(`[data-slot="${rowSlot}"]`).evaluateAll((rows) => [...new Set(rows
    .map((row) => row instanceof HTMLAnchorElement
      ? row.getAttribute("href")
      : row.querySelector("a")?.getAttribute("href"))
    .filter((href): href is string => Boolean(href?.startsWith("/"))))]);
}

/**
 * Verifies the semantic page frame shared by visitor-facing routes.
 *
 * @param page - Rendered route.
 */
async function expectSemanticPage(page: Page) {
  const main = page.locator("main#main");
  await expect(main).toBeVisible();
  await expect(main.getByRole("heading", { level: 1 })).toHaveCount(1);
  expect(await page.locator("html").evaluate((root) => root.scrollWidth <= root.clientWidth)).toBe(true);
  const canonical = page.locator('link[rel="canonical"]');
  await expect(canonical).toHaveCount(1);
  await expect(canonical).toHaveAttribute("href", /.+/u);
  const canonicalHref = await canonical.getAttribute("href") ?? "";
  const canonicalUrl = new URL(canonicalHref, page.url());
  expect(canonicalUrl.pathname).toBe(new URL(page.url()).pathname);
  const sharing = page.locator('meta[property="og:url"]');
  await expect(sharing).toHaveAttribute("content", /.+/u);
  const sharingHref = await sharing.getAttribute("content") ?? "";
  expect(new URL(sharingHref, page.url()).href).toBe(canonicalUrl.href);
  if (siteOrigin) {
    expect(canonicalUrl.origin).toBe(siteOrigin);
    expect(new URL(canonicalHref).href).toBe(canonicalUrl.href);
    expect(new URL(sharingHref).href).toBe(canonicalUrl.href);
  }
}

test("visitor routes and discovered details resolve semantically", async ({ page }) => {
  for (const path of ["/", ...staticRoutes]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expectSemanticPage(page);
  }

  for (const collection of collections) {
    const response = await page.goto(collection.path);
    expect(response?.status()).toBe(200);
    await expectSemanticPage(page);
    const paths = await discoverDetailPaths(page, collection.rowSlot);
    for (const path of paths.slice(0, 1)) {
      const detailResponse = await page.goto(path);
      expect(detailResponse?.status()).toBe(200);
      await expectSemanticPage(page);
      await expect(page.locator("main#main > article")).toBeVisible();
    }
  }

});

test("Home evidence actions name their associated editorial headings", async ({ page }) => {
  await page.goto("/");
  for (const { rowSlot, prefix } of [
    { rowSlot: "home-project", prefix: "Read case study:" },
    { rowSlot: "home-article", prefix: "Read article:" },
  ]) {
    const rows = page.locator(`[data-slot="${rowSlot}"]`);
    for (const row of await rows.all()) {
      const heading = (await row.getByRole("heading").innerText()).trim();
      const action = row.getByRole("link", { name: `${prefix} ${heading}`, exact: true });
      await expect(action).toHaveCount(1);
      await expect(action).toHaveAttribute("href", /^\/(?:projects|articles)\/[a-z0-9-]+$/u);
    }
  }

  const firstAction = page.locator('[data-slot="home-project"] a[data-row-link], [data-slot="home-article"] a[data-row-link]').first();
  if (await firstAction.count()) {
    const href = await firstAction.getAttribute("href");
    if (!href) throw new Error("Home evidence action must expose a native destination");
    await firstAction.focus();
    await expect(firstAction).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  }
});

test("declared public guidance and image assets resolve", async ({ page, request }) => {
  const guidance = await request.get("/llms.txt");
  expect(guidance.status()).toBe(200);
  expect(guidance.headers()["content-type"]).toMatch(/^text\/plain/);
  expect((await guidance.text()).trim().length).toBeGreaterThan(0);

  await page.goto("/");
  const iconPaths = await page.locator('link[rel="icon"], link[rel="apple-touch-icon"]').evaluateAll((icons) => icons
    .map((icon) => icon.getAttribute("href"))
    .filter((href): href is string => Boolean(href)));
  expect(iconPaths.length).toBeGreaterThan(0);
  for (const path of new Set(iconPaths)) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toMatch(/^image\//);
    expect((await response.body()).byteLength).toBeGreaterThan(0);
  }
});

test("sitemap and robots publish the same configured canonical origin", async ({ request }) => {
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const urls = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/gu)]
    .map((match) => new URL(match[1] ?? ""));
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  const directives = await robots.text();
  if (!siteOrigin) {
    expect(urls).toHaveLength(0);
    expect(directives).not.toMatch(/^Sitemap:/mu);
    return;
  }
  expect(urls.length).toBeGreaterThan(0);
  expect(new Set(urls.map((url) => url.origin))).toEqual(new Set([siteOrigin]));
  expect(new Set(urls.map((url) => url.href)).size).toBe(urls.length);
  expect(directives).toContain(`Sitemap: ${siteOrigin}/sitemap.xml`);
});

test("unknown routes return readable non-indexable fallbacks", async ({ page }) => {
  for (const path of [
    "/__test-missing-page__",
    "/articles/__test-missing-content__",
    "/projects/__test-missing-content__",
  ]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading").first()).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/i);
  }
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("collections and discovered details retain native navigation", async ({ page }) => {
    await page.goto("/");
    const sectionLink = page.locator('a[href="/#skills"]').first();
    const href = await sectionLink.getAttribute("href");
    if (!href) throw new Error("Home must expose a native section destination");
    await sectionLink.click();
    await expect(page).toHaveURL(new RegExp(`${href.replace("/", "")}$`));
    const section = page.locator(`#${href.slice(2)}`);
    await expect(section).toBeVisible();
    const clearance = await section.locator("[data-page-motion-row]").first().evaluate((content) => {
      const header = document.querySelector<HTMLElement>('[data-slot="site-header"]');
      if (!header) throw new Error("Home must expose its sticky header");
      return content.getBoundingClientRect().top - header.getBoundingClientRect().bottom;
    });
    expect(clearance).toBeGreaterThanOrEqual(14);

    for (const collection of collections) {
      await page.goto(collection.path);
      await expectSemanticPage(page);
      const paths = await discoverDetailPaths(page, collection.rowSlot);
      if (paths.length === 0) continue;
      await page.goto(paths[0] ?? collection.path);
      await expect(page.locator("main#main > article")).toBeVisible();
      const back = page.getByRole("link", { name: "Back to list" });
      await expect(back).toHaveAttribute("href", collection.path);
      await back.click();
      await expect(page).toHaveURL(new RegExp(`${collection.path}$`));
    }
  });
});
