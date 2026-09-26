import { expect, test, type Page } from "@playwright/test";

/**
 * Opens Home without the decorative session splash or motion timing.
 *
 * @param page - Browser page receiving the stable Home state.
 */
async function openStableHome(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  });
  await page.goto("/");
}

test("skills restore brand color and expose tooltips at compact and desktop widths", { tag: "@webkit" }, async ({ browserName, page }) => {
  await openStableHome(page);

  const skills = page.locator('[data-slot="skill-trigger"]');
  const firstSkill = skills.filter({ has: page.locator('[data-slot="skill-icon"]') }).first();
  test.skip(await firstSkill.count() === 0, "Home has no mapped skill icons");
  const icon = firstSkill.locator('[data-slot="skill-icon"] > *').first();
  const name = await firstSkill.getAttribute("aria-label") ?? (await firstSkill.textContent())?.trim();
  if (!name) throw new Error("Expected a skill trigger accessible name");
  const firstIndex = await firstSkill.evaluate((element) => (
    [...document.querySelectorAll('[data-slot="skill-trigger"]')].indexOf(element)
  ));
  const tooltip = page.locator('[data-slot="tooltip-content"]', { hasText: name });

  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.mouse.move(0, 0);
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    await firstSkill.scrollIntoViewIfNeeded();
    await expect.poll(() => icon.evaluate((element) => getComputedStyle(element).filter)).toContain("grayscale(1)");

    await firstSkill.hover();
    await expect(tooltip).toBeVisible();
    await expect.poll(() => icon.evaluate((element) => getComputedStyle(element).filter)).toContain("grayscale(0)");

    await page.mouse.move(0, 0);
    await page.keyboard.press("Escape");
    await firstSkill.focus();
    await expect(tooltip).toBeVisible();

    const nextSkill = skills.nth(firstIndex + 1);
    if (firstIndex >= 0 && firstIndex + 1 < await skills.count()) {
      await page.keyboard.press("Escape");
      await expect(tooltip).toBeHidden();
      await expect(firstSkill).toBeFocused();
      await page.keyboard.press(browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab");
      await expect(nextSkill).toBeFocused();
    }
  }
});
