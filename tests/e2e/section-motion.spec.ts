import { expect, test } from "@playwright/test";

/** Records actual animation timestamps so assertions survive completed entrances. */
function recordMotionTimeline() {
  sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  // apply below restores the native method's element receiver.
  // eslint-disable-next-line @typescript-eslint/unbound-method
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

for (const path of ["/projects/latex-cv", "/articles/fixing-bugs-with-mcps"]) {
  for (const entry of ["direct", "client"]) {
    test(`Slug sections continue the intro cadence across section boundaries on ${path} via ${entry}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 2400 });
      await page.addInitScript(recordMotionTimeline);
      if (entry === "client") {
        await page.goto(path.startsWith("/projects/") ? "/projects" : "/articles");
        await page.locator(`a[href="${path}"]`).click();
      } else {
        await page.goto(path);
      }
      const body = page.locator('[data-page-motion-rows="children"]').first();
      await expect(body.locator("h2").nth(1)).toHaveAttribute("data-test-motion-start", /\d/);
      const timeline = await body.evaluate((root) => Array.from(root.children, (child) => ({
        heading: /^H[2-6]$/.test(child.tagName),
        start: Number(child.getAttribute("data-test-motion-start")),
      })));
      const secondSectionStart = timeline.findIndex((child, index) => index > 0 && child.heading);
      expect(secondSectionStart).toBeGreaterThan(1);
      const lastIntroStart = await page.locator('[data-page-motion-intro]').evaluateAll((items) =>
        Math.max(...items.map((item) => Number(item.getAttribute("data-test-motion-start")))));
      expect(Number(timeline[0]?.start) - lastIntroStart).toBeGreaterThan(25);
      expect(Number(timeline[0]?.start) - lastIntroStart).toBeLessThan(150);
      for (let index = 1; index < secondSectionStart; index++) {
        expect(Number(timeline[index]?.start) - Number(timeline[index - 1]?.start)).toBeCloseTo(75, 0);
      }
      const boundaryGap = Number(timeline[secondSectionStart]?.start) - Number(timeline[secondSectionStart - 1]?.start);
      expect(boundaryGap).toBeGreaterThan(25);
      expect(boundaryGap).toBeLessThan(150);
      await expect(page.locator('main > article > hr')).toHaveAttribute("data-test-motion-start", /\d/);
    });
  }

  test(`Slug sections keep their order across separate scroll frames on ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript(recordMotionTimeline);
    await page.goto(path);
    const body = page.locator('[data-page-motion-rows="children"]').first();
    const headings = body.locator(":scope > h2");
    await headings.first().evaluate((heading) => {
      window.scrollBy(0, Math.max(0, heading.getBoundingClientRect().top - innerHeight * 0.8));
    });
    await expect(headings.first()).toHaveAttribute("data-test-motion-start", /\d/);
    await expect(headings.nth(1)).toHaveCSS("opacity", "0");
    const scrollTime = await headings.nth(1).evaluate((heading) => {
      window.scrollBy(0, heading.getBoundingClientRect().top - innerHeight * 0.8);
      return Number(document.timeline.currentTime);
    });
    await expect(headings.nth(1)).toHaveAttribute("data-test-motion-start", /\d/);
    const times = await headings.nth(1).evaluate((heading) => ({
      start: Number(heading.getAttribute("data-test-motion-start")),
      previousStart: Number(heading.previousElementSibling?.getAttribute("data-test-motion-start")),
    }));
    const nextSlot = Math.max(times.previousStart + 75, scrollTime);
    expect(times.start).toBeGreaterThanOrEqual(nextSlot - 50);
    expect(times.start).toBeLessThan(nextSlot + 150);
    await expect(headings.nth(2)).toHaveCSS("opacity", "0");
  });
}
