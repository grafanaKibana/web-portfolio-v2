import { expect, test } from "@playwright/test";

type Rgb = [number, number, number];

/**
 * Computes WCAG relative luminance for an RGB color.
 *
 * @param color - Parsed RGB channels.
 * @returns Relative luminance.
 */
function luminance(color: Rgb) {
  const channels = color.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  const [red, green, blue] = channels;
  if (red === undefined || green === undefined || blue === undefined) throw new Error("Expected RGB luminance channels");
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/**
 * Computes contrast between browser-resolved foreground and background colors.
 *
 * @param foreground - Rendered text color.
 * @param background - Rendered surface color.
 * @returns WCAG contrast ratio.
 */
function contrastRatio(foreground: Rgb, background: Rgb) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test("theme selection persists with readable rendered content and visible focus", { tag: "@webkit" }, async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.addInitScript(() => {
    if (localStorage.getItem("theme") === null) localStorage.setItem("theme", "light");
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  });
  await page.goto("/");

  for (const expected of ["light", "dark"] as const) {
    await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${expected}\\b`));
    const colors = await page.getByRole("heading", { level: 1 }).evaluate((heading) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas color conversion is unavailable");
      return [getComputedStyle(heading).color, getComputedStyle(document.body).backgroundColor]
        .map((color): Rgb => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
          if (red === undefined || green === undefined || blue === undefined || alpha !== 255) {
            throw new Error(`Expected an opaque rendered color, received ${color}`);
          }
          return [red, green, blue];
        });
    });
    const [foreground, background] = colors;
    if (!foreground || !background) throw new Error("Expected rendered foreground and background colors");
    expect(contrastRatio(foreground, background), JSON.stringify(colors)).toBeGreaterThanOrEqual(4.5);
    const toggle = page.locator('[data-slot="theme-toggle"]');
    if (!await toggle.evaluate((element) => element === document.activeElement)) {
      for (let index = 0; index < 30; index += 1) {
        await page.keyboard.press("Tab");
        if (await toggle.evaluate((element) => element === document.activeElement)) break;
      }
    }
    await expect(toggle).toBeFocused();
    const focusPaint = await toggle.evaluate((element) => {
      const style = getComputedStyle(element);
      return style.outlineStyle !== "none" || style.boxShadow !== "none";
    });
    expect(focusPaint).toBe(true);
    if (expected === "light") await toggle.click();
  }

  await expect.poll(() => page.evaluate(() => localStorage.getItem("theme"))).toBe("dark");
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
