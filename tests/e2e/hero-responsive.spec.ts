import { expect, test } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  test(`hero keeps phone gutters and tablet link spacing in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const hero = page.locator('section[aria-labelledby="intro-heading"]');
    const explore = hero.getByRole("link", { name: "Explore Experience" });

    for (const width of [320, 321, 330, 344, 375, 390, 414, 639, 640, 744, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(explore).toHaveAttribute("href", "#experience");
      await expect(explore.locator("svg")).toHaveCount(0);

      if (width < 640) {
        const heading = await hero.getByRole("heading", { level: 1 }).boundingBox();
        if (!heading) throw new Error("Hero heading must be measurable");
        expect(heading.x).toBeGreaterThanOrEqual(22);
        expect(heading.x + heading.width).toBeLessThanOrEqual(width - 22);
      } else {
        const links = await hero.locator("ul a").evaluateAll((elements) =>
          elements.map((element) => {
            const box = element.getBoundingClientRect();
            return { left: box.left, right: box.right, top: box.top };
          }),
        );
        for (let index = 1; index < links.length; index += 1) {
          const current = links[index];
          const previous = links[index - 1];
          if (!current || !previous) throw new Error("Social link boxes must be measurable");
          expect(current.top).toBe(previous.top);
          expect(current.left - previous.right).toBeGreaterThanOrEqual(24);
        }
      }

      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}
