import { expect, test, type Locator } from "@playwright/test";

/**
 * Reads the destination exposed by a row's native primary link.
 *
 * @param row - Rendered editorial row containing the primary link.
 * @returns Primary navigation destination.
 */
async function readDestination(row: Locator) {
  const destination = await row.locator("a[data-row-link]").getAttribute("href");
  if (!destination) throw new Error("Rendered editorial rows must expose a native destination");
  return destination;
}

/**
 * Escapes a URL path for an exact trailing regular-expression match.
 *
 * @param path - URL path that may contain regular-expression syntax.
 * @returns Escaped path safe to embed in a regular expression.
 */
function escapePath(path: string) {
  return path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

for (const width of [390, 1024]) {
  test(`rendered Home collections share an overflow-safe editorial layout at ${String(width)}px`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");

    const rows = page.locator('[data-slot="home-project"] [data-slot="home-editorial-row"], [data-slot="home-article"] [data-slot="home-editorial-row"]');
    test.skip(await rows.count() === 0, "Home has no rendered editorial rows");

    for (const row of await rows.all()) {
      await expect(row).toHaveCSS("display", width >= 1024 ? "grid" : "block");
      expect(await row.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await expect(row.locator("a[data-row-link]")).toBeVisible();
    }
  });
}

test("Home editorial rows preserve native navigation and ignore empty action gaps", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");

  const row = page.locator('[data-slot="home-project"], [data-slot="home-article"]').first();
  test.skip(await row.count() === 0, "Home has no rendered editorial rows");
  const destination = await readDestination(row);
  const actions = row.locator('[data-slot="project-actions"]');

  if (await actions.count()) {
    const position = await actions.evaluate((element) => {
      const box = element.getBoundingClientRect();
      for (const x of [box.width - 2, box.width / 2, 2]) {
        for (const y of [box.height - 2, box.height / 2, 2]) {
          if (document.elementFromPoint(box.left + x, box.top + y) === element) return { x, y };
        }
      }
      return null;
    });
    if (position) {
      await actions.click({ position });
      await expect(page).toHaveURL(/\/$/);
    }
  }

  await row.locator("a[data-row-link]").click();
  await expect(page).toHaveURL(new RegExp(`${escapePath(destination)}$`));
});

test.describe("Home editorial rows without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("keep native primary links usable", async ({ page }) => {
    await page.goto("/");
    const link = page.locator('[data-slot="home-project"] a[data-row-link], [data-slot="home-article"] a[data-row-link]').first();
    test.skip(await link.count() === 0, "Home has no rendered editorial rows");
    const destination = await link.getAttribute("href");
    if (!destination) throw new Error("Rendered editorial rows must expose a native destination");

    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${escapePath(destination)}$`));
  });
});
