import { expect, test, type Page } from "@playwright/test";

const collectionRoutes = [
  { path: "/articles", rowSlot: "article-row" },
  { path: "/projects", rowSlot: "project-row" },
] as const;

/**
 * Reads unique detail destinations from a rendered collection.
 *
 * @param page - Browser page containing the collection.
 * @param rowSlot - Data slot used by linked collection rows.
 * @returns Unique internal detail paths in rendered order.
 */
async function discoverDetailPaths(page: Page, rowSlot: string) {
  return page.locator(`[data-slot="${rowSlot}"]`).evaluateAll((rows) => [...new Set(rows
    .map((row) => row instanceof HTMLAnchorElement ? row.getAttribute("href") : row.querySelector("a")?.getAttribute("href"))
    .filter((href): href is string => Boolean(href?.startsWith("/"))))]);
}

for (const collection of collectionRoutes) {
  test(`${collection.path} renders a semantic collection whose available links resolve`, async ({ page }) => {
    const response = await page.goto(collection.path);
    expect(response?.status()).toBe(200);
    const main = page.locator("main#main");
    await expect(main).toBeVisible();
    await expect(main.getByRole("heading", { level: 1 })).toHaveCount(1);

    const paths = await discoverDetailPaths(page, collection.rowSlot);
    for (const path of paths) {
      expect(path).toMatch(new RegExp(`^${collection.path}/[a-z0-9-]+$`));
      const detailResponse = await page.goto(path);
      expect(detailResponse?.status()).toBe(200);
      const article = page.locator("main#main > article");
      await expect(article).toBeVisible();
      await expect(article.getByRole("heading", { level: 1 })).toHaveCount(1);
    }
  });
}

for (const family of ["articles", "projects"] as const) {
  test(`unknown ${family} slugs return a non-indexable static 404`, async ({ page }) => {
    const response = await page.goto(`/${family}/__test-missing-content__`);
    expect(response?.status()).toBe(404);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/i);
    await expect(page.getByRole("heading").first()).toBeVisible();
  });
}

test("available detail pages expose route-aware return navigation", async ({ page }) => {
  for (const collection of collectionRoutes) {
    await page.goto(collection.path);
    const paths = await discoverDetailPaths(page, collection.rowSlot);
    if (paths.length === 0) continue;

    await page.goto(paths[0] ?? collection.path);
    const back = page.getByRole("link", { name: "Back to list" });
    await expect(back).toHaveAttribute("href", collection.path);
    await expect(back).toBeVisible();
    await back.click();
    await expect(page).toHaveURL(new RegExp(`${collection.path}$`));
  }
});

test("available detail shells remain centered and overflow-safe", async ({ page }) => {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const collection of collectionRoutes) {
      await page.goto(collection.path);
      const paths = await discoverDetailPaths(page, collection.rowSlot);
      if (paths.length === 0) continue;
      await page.goto(paths[0] ?? collection.path);

      const article = page.locator("main#main > article");
      const box = await article.boundingBox();
      if (!box) throw new Error("Rendered detail article must be measurable");
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(await page.locator("html").evaluate((root) => root.scrollWidth <= root.clientWidth)).toBe(true);
    }
  }
});

test("Home in-page navigation references existing unique section targets", async ({ page }) => {
  await page.goto("/");
  const links = page.locator('a[href^="/#"]');
  const targets = await links.evaluateAll((elements) => elements
    .map((element) => element.getAttribute("href")?.slice(2))
    .filter((id): id is string => Boolean(id)));

  for (const target of new Set(targets)) {
    expect(await page.locator("[id]").evaluateAll((elements, id) =>
      elements.filter((element) => element.id === id).length, target)).toBe(1);
  }
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  for (const collection of collectionRoutes) {
    test(`${collection.path} and any rendered detail remain usable`, async ({ page }) => {
      await page.goto(collection.path);
      await expect(page.locator("main#main")).toBeVisible();
      const paths = await discoverDetailPaths(page, collection.rowSlot);
      if (paths.length === 0) return;

      await page.goto(paths[0] ?? collection.path);
      await expect(page.locator("main#main > article")).toBeVisible();
      await expect(page.getByRole("link", { name: "Back to list" })).toHaveAttribute("href", collection.path);
    });
  }
});
