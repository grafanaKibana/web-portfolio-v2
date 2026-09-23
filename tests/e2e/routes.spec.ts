import { expect, test, type Locator, type Page } from "@playwright/test";
import { readShellWidthContract } from "./shell-width";

const collectionRoutes = [
  { path: "/articles", rowSlot: "article-row" },
  { path: "/projects", rowSlot: "project-row" },
] as const;

const staticReadingRoutes = [
  "/accessibility",
  "/privacy",
  "/terms",
  "/for-robots",
] as const;

const routeShellViewports = [390, 768, 1280, 1920] as const;

/**
 * Reads the rendered shell box and its inner content edges.
 *
 * @param shell - Route element that owns shared shell padding.
 * @returns Numeric padding and content-edge geometry.
 */
async function readShellGeometry(shell: Locator) {
  return shell.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const paddingLeft = Number.parseFloat(style.paddingLeft);
    const paddingRight = Number.parseFloat(style.paddingRight);

    return {
      paddingLeft,
      paddingRight,
      contentLeft: box.left + paddingLeft,
      contentRight: box.right - paddingRight,
    };
  });
}

/**
 * Asserts shared route-shell padding and page-level overflow safety.
 *
 * @param page - Browser page rendering the route.
 * @param shell - Route element that owns shared shell padding.
 * @returns Resolved shell geometry for child-alignment assertions.
 */
async function expectSharedRouteShell(page: Page, shell: Locator) {
  const { pageGutter } = await readShellWidthContract(page);
  const geometry = await readShellGeometry(shell);

  expect(geometry.paddingLeft).toBeCloseTo(pageGutter, 1);
  expect(geometry.paddingRight).toBeCloseTo(pageGutter, 1);
  expect(await page.locator("html").evaluate((root) => root.scrollWidth <= root.clientWidth)).toBe(true);

  return geometry;
}

/**
 * Asserts that visible route content occupies the shared shell frame.
 *
 * @param content - Visible route content expected to span the shell.
 * @param geometry - Shared shell content-edge geometry.
 */
async function expectContentToSpanShell(
  content: Locator,
  geometry: Awaited<ReturnType<typeof readShellGeometry>>,
) {
  const box = await content.boundingBox();
  if (!box) throw new Error("Rendered route content must be measurable");

  expect(box.x).toBeCloseTo(geometry.contentLeft, 1);
  expect(box.x + box.width).toBeCloseTo(geometry.contentRight, 1);
}

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
    for (const metadata of await main.locator("p.font-mono").all()) {
      await expect(metadata).toHaveCSS("font-size", "12px");
      await expect(metadata).toHaveCSS("line-height", "18px");
    }

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

for (const collection of collectionRoutes) {
  test(`${collection.path} collection rows follow the shared editorial shell`, async ({ page }) => {
    for (const width of routeShellViewports) {
      await page.setViewportSize({ width, height: 900 });
      const response = await page.goto(collection.path);
      expect(response?.status()).toBe(200);

      const main = page.locator("main#main");
      const geometry = await expectSharedRouteShell(page, main);
      const rows = page.locator(`[data-slot="${collection.rowSlot}"]`);

      for (const row of await rows.all()) {
        const box = await row.boundingBox();
        if (!box) throw new Error("Rendered collection row must be measurable");
        expect(box.x).toBeCloseTo(geometry.contentLeft, 1);
        expect(box.x + box.width).toBeCloseTo(geometry.contentRight, 1);
      }
    }
  });
}

for (const path of staticReadingRoutes) {
  test(`${path} content spans the shared editorial shell`, async ({ page }) => {
    for (const width of routeShellViewports) {
      await page.setViewportSize({ width, height: 900 });
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);

      const main = page.locator("main#main");
      const geometry = await expectSharedRouteShell(page, main);
      const article = main.locator(":scope > article");
      await expect(article.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expectContentToSpanShell(article, geometry);
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

test("available detail content spans the shared editorial shell", async ({ page }) => {
  for (const collection of collectionRoutes) {
    await page.setViewportSize({ width: routeShellViewports[0], height: 900 });
    await page.goto(collection.path);
    const paths = await discoverDetailPaths(page, collection.rowSlot);
    if (paths.length === 0) continue;

    for (const width of routeShellViewports) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(paths[0] ?? collection.path);

      const main = page.locator("main#main");
      const geometry = await expectSharedRouteShell(page, main);
      const article = main.locator(":scope > article");
      await expectContentToSpanShell(article, geometry);
      await expect(page.getByRole("link", { name: "Back to list" })).toBeVisible();
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
test("rendered Project pagination divider aligns to the shared shell", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/projects");
  const paths = await discoverDetailPaths(page, "project-row");

  for (const path of paths) {
    await page.goto(path);
    const pagination = page.locator('[data-slot="project-pagination"]');
    if (!await pagination.count()) continue;

    const main = page.locator("main#main");
    const geometry = await expectSharedRouteShell(page, main);
    const divider = pagination.locator('[data-slot="next-project"]');
    const box = await divider.boundingBox();
    if (!box) throw new Error("Rendered Project pagination divider must be measurable");
    expect(box.x).toBeCloseTo(geometry.contentLeft, 1);
    expect(box.x + box.width).toBeCloseTo(geometry.contentRight, 1);
    return;
  }
});


test("reading roles retain shared width, hierarchy and first-block spacing", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const collection of collectionRoutes) {
    await page.goto(collection.path);
    const paths = await discoverDetailPaths(page, collection.rowSlot);
    if (!paths.length) continue;
    for (const width of routeShellViewports) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(paths[0] ?? collection.path);
      const main = page.locator("main#main");
      const geometry = await expectSharedRouteShell(page, main);
      const article = main.locator(":scope > article");
      await expectContentToSpanShell(article, geometry);
      const title = article.locator("h1");
      await expect(title).toHaveCSS("font-size", width < 768 ? "36px" : "48px");
      await expect(article.locator("header")).toHaveCSS("padding-bottom", "48px");
      const content = article.locator('[data-page-motion-rows="children"]').first();
      await expect(content).toHaveCSS("padding-top", "24px");
      await expect(content).toHaveCSS("font-size", "16px");
      await expect(content).toHaveCSS("line-height", "28px");
      if (await content.locator(":scope > *").count()) {
        await expect(content.locator(":scope > *").first()).toHaveCSS("margin-top", "0px");
      }
      for (const heading of await content.locator("h2, h3").all()) {
        const level = await heading.evaluate((node) => node.tagName);
        await expect(heading).toHaveCSS("font-size", level === "H2" ? "24px" : "20px");
        await expect(heading).toHaveCSS("line-height", level === "H2" ? "30px" : "26px");
      }
      await title.evaluate((heading) => { heading.textContent = "LongUnbrokenTitle".repeat(15); });
      expect(await page.locator("html").evaluate((root) => root.scrollWidth <= root.clientWidth)).toBe(true);
    }
    const content = page.locator('main#main > article [data-page-motion-rows="children"]').first();
    const paragraph = content.locator("p").first();
    if (await paragraph.count()) {
      await paragraph.evaluate((sample) => {
        const parent = sample.closest('[data-page-motion-rows="children"]');
        if (!parent) throw new Error("Reading content owner must exist");
        const first = sample.cloneNode(false) as HTMLElement;
        const second = sample.cloneNode(false) as HTMLElement;
        first.textContent = "First synthetic paragraph.";
        second.textContent = "Second synthetic paragraph.";
        first.dataset.readingProbe = "first";
        second.dataset.readingProbe = "second";
        parent.replaceChildren(first, second);
      });
      await expect(content.locator('[data-reading-probe="first"]')).toHaveCSS("margin-top", "0px");
      await expect(content.locator('[data-reading-probe="second"]')).toHaveCSS("margin-top", "16px");
      await expect(content.locator('[data-reading-probe="second"]')).toHaveCSS("line-height", "28px");
      await page.setViewportSize({ width: 390, height: 900 });
      await page.locator("html").evaluate((root) => { root.style.fontSize = "200%"; });
      await content.locator('[data-reading-probe="second"]').evaluate((sample) => {
        sample.textContent = "Synthetic.Namespace.WithoutBreaks".repeat(8);
        const list = document.createElement("ul");
        const item = document.createElement("li");
        const emphasis = document.createElement("strong");
        emphasis.textContent = "Another.Unbroken.Technology.Name".repeat(8);
        item.append(emphasis);
        list.append(item);
        sample.after(list);
      });
      expect(await page.locator("html").evaluate((root) => root.scrollWidth <= root.clientWidth)).toBe(true);
      await page.locator("html").evaluate((root) => { root.style.removeProperty("font-size"); });
    }
  }
});
