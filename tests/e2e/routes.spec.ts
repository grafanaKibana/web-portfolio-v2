import { expect, test, type Page } from "@playwright/test";

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
    const sectionLink = page.locator('a[href^="/#"]').first();
    const href = await sectionLink.getAttribute("href");
    if (!href) throw new Error("Home must expose a native section destination");
    await sectionLink.click();
    await expect(page).toHaveURL(new RegExp(`${href.replace("/", "")}$`));
    await expect(page.locator(`#${href.slice(2)}`)).toBeVisible();

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
