import { expect, test, type Page } from "@playwright/test";

/** Records animation start timestamps so assertions survive completed entrances. */
function recordMotionTimeline() {
  sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  // eslint-disable-next-line @typescript-eslint/unbound-method -- The fixture restores the native element receiver.
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (...args) {
    const animation = animate.apply(this, args);
    void animation.ready.then(() => {
      const timing = animation.effect?.getComputedTiming();
      if (!timing || typeof animation.startTime !== "number") return;
      this.setAttribute("data-test-motion-start", String(animation.startTime + Number(timing.delay)));
    }, () => undefined);
    return animation;
  };
}

/**
 * Opens a collection through either a direct request or the Home collection link.
 *
 * @param page - Browser page used for navigation.
 * @param route - Collection path and matching Home link slot.
 * @param entry - Navigation method to exercise.
 * @returns Whether the requested navigation path is available and was exercised.
 */
async function enterCollection(
  page: Page,
  route: { homeLinkSlot: string; path: string },
  entry: "client" | "direct",
): Promise<boolean> {
  if (entry === "direct") {
    await page.goto(route.path);
    return true;
  }

  await page.goto("/");
  const link = page.locator(`[data-slot="${route.homeLinkSlot}"]`);
  if (await link.count() === 0) return false;
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${route.path}$`));
  return true;
}

for (const route of [
  { homeLinkSlot: "more-projects-link", label: "project collection", path: "/projects", rowSlot: "project-row" },
  { homeLinkSlot: "more-articles-link", label: "article collection", path: "/articles", rowSlot: "article-row" },
]) {
  for (const entry of ["direct", "client"] as const) {
    test(`${route.label} preserves document-order motion via ${entry} navigation`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 2400 });
      await page.addInitScript(recordMotionTimeline);
      if (!await enterCollection(page, route, entry)) return;

      const introTargets = page.locator("[data-page-motion-intro]");
      await expect(introTargets.first()).toHaveAttribute("data-test-motion-start", /\d/);
      expect(await introTargets.evaluateAll((items) => items.every((item) => {
        const start = item.getAttribute("data-test-motion-start");
        return start !== null && start.trim() !== "" && Number.isFinite(Number(start));
      }))).toBe(true);
      const rows = page.locator(`[data-slot="${route.rowSlot}"]`);
      if (await rows.count() === 0) return;
      await expect.poll(async () => rows.evaluateAll((items) => {
        const starts = items
          .filter((item) => {
            const bounds = item.getBoundingClientRect();
            return bounds.bottom > 0 && bounds.top < window.innerHeight;
          })
          .map((item) => item.getAttribute("data-test-motion-start"));
        return starts.length > 0 && starts.every((start) =>
          start !== null && start.trim() !== "" && Number.isFinite(Number(start)));
      })).toBe(true);
      const rawStarts = await rows.evaluateAll((items) => items
        .filter((item) => {
          const bounds = item.getBoundingClientRect();
          return bounds.bottom > 0 && bounds.top < window.innerHeight;
        })
        .map((item) => item.getAttribute("data-test-motion-start")));
      expect(rawStarts.every((start) =>
        start !== null && start.trim() !== "" && Number.isFinite(Number(start)))).toBe(true);
      const starts = rawStarts.map(Number);

      for (const [index, start] of starts.entries()) {
        if (index > 0) expect(start - Number(starts[index - 1])).toBeCloseTo(75, 0);
      }
    });
  }

  test(`${route.label} reveals available rows in separate scroll frames`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript(recordMotionTimeline);
    await page.goto(route.path);

    const rows = page.locator(`[data-slot="${route.rowSlot}"]`);
    if (await rows.count() < 2) return;
    const first = rows.first();
    const last = rows.last();
    await first.evaluate((row) => {
      row.scrollIntoView({ block: "center" });
    });
    await expect(first).toHaveAttribute("data-test-motion-start", /\d/);
    await last.evaluate((row) => {
      row.scrollIntoView({ block: "center" });
    });
    await expect(last).toHaveAttribute("data-test-motion-start", /\d/);
    expect(Number(await last.getAttribute("data-test-motion-start")))
      .toBeGreaterThanOrEqual(Number(await first.getAttribute("data-test-motion-start")));
  });
}
