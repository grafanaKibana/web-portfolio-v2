import { expect, test, type Page } from "@playwright/test";

/**
 * Discovers rendered project-detail destinations without assuming content inventory.
 *
 * @param page - Browser page used to render the project collection.
 * @returns Unique project-detail paths in rendered order.
 */
async function discoverProjectPaths(page: Page) {
  await page.goto("/projects");
  return page.locator('a[href^="/projects/"]').evaluateAll((links) => [...new Set(links
    .map((link) => link.getAttribute("href"))
    .filter((href): href is string => Boolean(href)))]);
}

test("rendered project links resolve to semantic, locally sourced case studies", async ({ page }) => {
  const paths = await discoverProjectPaths(page);
  for (const path of paths) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    const article = page.locator("main#main > article");
    await expect(article).toBeVisible();
    await expect(article.getByRole("heading", { level: 1 })).toHaveCount(1);
    const headingLevels = await article.locator("h1, h2, h3, h4, h5, h6").evaluateAll((headings) =>
      headings.map((heading) => Number(heading.tagName.slice(1))));
    expect(headingLevels[0]).toBe(1);
    expect(headingLevels.every((level, index) => index === 0 || level > 1)).toBe(true);

    for (const figure of await article.locator("figure:has(img)").all()) {
      const image = figure.locator("img");
      await expect(image).toHaveAttribute("src", /^\/(?!\/).+/);
      await expect(image).toHaveAttribute("alt", /\S/);
      await expect(figure.locator("figcaption")).toBeVisible();
    }
  }
});

test.describe("project details without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("keep any rendered case study readable", async ({ page }) => {
    const paths = await discoverProjectPaths(page);
    test.skip(paths.length === 0, "Project collection is empty");
    await page.goto(paths[0] ?? "/projects");

    const article = page.locator("main#main > article");
    await expect(article).toBeVisible();
    await expect(article.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.locator("html").evaluate((root) => root.scrollWidth <= root.clientWidth)).toBe(true);
  });
});
