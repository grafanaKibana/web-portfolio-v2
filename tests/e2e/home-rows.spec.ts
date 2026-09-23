import { expect, test, type Locator } from "@playwright/test";
import { compile } from "sass";

const editorialRowCss = compile(
  "app/(home)/_components/editorial-row/editorial-row.module.scss",
).css.replaceAll(/:global\(([^)]+)\)/g, "$1");

for (const width of [1023, 1024, 1280] as const) {
  test(`editorial row fixture preserves its responsive measure at ${String(width)}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    await page.setContent(`
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; }
        ${editorialRowCss}
      </style>
      <article class="row">
        <div class="body">
          <h2 class="title"><a data-row-link href="#fixture">Editorial fixture</a></h2>
          <p class="description">A concise summary that keeps the fixture representative.</p>
          <div class="metadata"><ul><li>Metadata</li></ul></div>
          <div class="actions"><a href="#action">Action</a></div>
        </div>
      </article>
    `);

    const body = page.locator(".body");
    await expect(body).toHaveCSS("display", width >= 1024 ? "grid" : "block");
    if (width >= 1024) {
      const geometry = await body.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          tracks: style.gridTemplateColumns.split(" ").map((track) => Number.parseFloat(track)),
          gap: Number.parseFloat(style.columnGap),
        };
      });
      expect(geometry.tracks[1]).toBeCloseTo(224, 1);
      expect(geometry.gap).toBeCloseTo(48, 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

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
