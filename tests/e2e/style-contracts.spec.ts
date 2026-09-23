import { expect, test, type Locator } from "@playwright/test";

/**
 * Reads a measurable element rectangle.
 *
 * @param element - Element whose bounds are required.
 * @returns The rendered rectangle.
 */
async function boxOf(element: Locator) {
  const box = await element.boundingBox();
  if (!box) throw new Error("Expected a measurable rendered element");
  return box;
}

test("development CSS keeps the home shell contained across representative widths", { tag: "@css" }, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    expect(await page.locator("html").evaluate((root) => root.scrollWidth <= root.clientWidth)).toBe(true);
    const boxes = await Promise.all((await page.locator("main#main > section").all()).map(boxOf));
    for (const [index, box] of boxes.entries()) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      const next = boxes[index + 1];
      if (next) expect(box.y + box.height).toBeLessThanOrEqual(next.y + 1);
    }
  }
});

test("development CSS keeps shared controls readable and focusable across themes", { tag: "@css" }, async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("theme", "light");
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  });
  await page.goto("/");
  const toggle = page.locator('[data-slot="theme-toggle"]');
  for (const expected of ["light", "dark"] as const) {
    await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${expected}\\b`));
    await expect(toggle).toBeVisible();
    await expect(toggle).toBeEnabled();
    await toggle.focus();
    await expect(toggle).toBeFocused();
    const colors = await page.getByRole("heading", { level: 1 }).evaluate((heading) => ({
      foreground: getComputedStyle(heading).color,
      background: getComputedStyle(document.body).backgroundColor,
    }));
    expect(colors.foreground).not.toBe(colors.background);
    if (expected === "light") await toggle.click();
  }
});
