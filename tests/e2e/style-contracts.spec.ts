import { expect, test, type Page } from "@playwright/test";

const sectionIds = ["about", "education", "experience", "skills", "code", "projects", "writing", "contact"] as const;
const sectionLabelSelectors = [
  "#about-heading",
  "#education-heading",
  "#experience-heading",
  "#experience-recommendations-heading",
  "#skills-heading",
  "#code-heading",
  "#projects-heading",
  "#writing-heading",
  "#contact > p",
] as const;
const viewportWidths = [320, 390, 768, 1023, 1024, 1279, 1280, 1440] as const;

/**
 * Installs a scoped motion-distance override and pauses page-motion WAAPI animations.
 *
 * @param page - Browser page receiving the pre-hydration probe.
 * @param distance - Optional pixel distance exposed through the PageMotion scope.
 */
async function installMotionProbe(page: Page, distance?: number) {
  await page.addInitScript(({ motionDistance }) => {
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
    const observer = new MutationObserver(() => {
      const body = document.querySelector("body");
      if (!body) return;
      if (motionDistance !== undefined) {
        body.style.setProperty("--page-motion-distance", `${String(motionDistance)}px`);
      }
      observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });

    // apply below restores the native method's element receiver.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const animation = animate.apply(this, args);
      if (this.matches("[data-page-motion-intro], [data-page-motion-row]")) animation.pause();
      return animation;
    };
  }, { motionDistance: distance });
}

/**
 * Seeks a target's entrance animations to their deterministic midpoint.
 *
 * @param page - Browser page containing the motion target.
 * @param selector - Selector for the target whose animations should be sampled.
 * @returns Midpoint opacity and vertical translation.
 */
async function seekMotionMidpoint(page: Page, selector: string) {
  const target = page.locator(selector).first();
  await expect.poll(() => target.evaluate((element) => element.getAnimations().length)).toBeGreaterThan(0);
  return target.evaluate((element) => {
    const initialTranslateY = new DOMMatrixReadOnly(getComputedStyle(element).transform).m42;
    for (const animation of element.getAnimations()) {
      const timing = animation.effect?.getComputedTiming();
      if (!timing || typeof timing.activeDuration !== "number") continue;
      animation.pause();
      animation.currentTime = Number(timing.delay) + timing.activeDuration / 2;
    }
    const style = getComputedStyle(element);
    return {
      initialTranslateY,
      opacity: Number.parseFloat(style.opacity),
      translateY: new DOMMatrixReadOnly(style.transform).m42,
    };
  });
}

test("Home sections keep shared layout and label contracts across breakpoints", async ({ page }) => {
  for (const width of viewportWidths) {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");

    const desktop = width >= 1280;
    const spacious = width >= 1024;
    const expectedHeaderHeight = desktop ? 76 : 60;
    const expectedScrollMargin = desktop ? -28 : spacious ? -44 : 4;
    const expectedPadding = spacious ? 104 : 56;
    const sectionStyles = await Promise.all(sectionIds.map(async (id) => ({
      id,
      ...await page.locator(`#${id}`).evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          paddingBottom: Number.parseFloat(style.paddingBottom),
          paddingTop: Number.parseFloat(style.paddingTop),
          scrollMarginTop: Number.parseFloat(style.scrollMarginTop),
        };
      }),
    })));

    await expect(page.locator('[data-slot="site-header"]')).toHaveCSS("height", `${String(expectedHeaderHeight)}px`);
    expect(await page.locator("main > section").first().evaluate((hero) =>
      Number.parseFloat(getComputedStyle(hero).minHeight))).toBeCloseTo(900 - expectedHeaderHeight, 3);
    for (const style of sectionStyles) {
      expect(style.paddingTop, `${style.id} padding-top`).toBe(expectedPadding);
      expect(style.paddingBottom, `${style.id} padding-bottom`).toBe(
        style.id === "contact" ? (spacious ? 120 : 72) : expectedPadding,
      );
      if (style.id !== "writing" || !desktop) {
        expect(style.scrollMarginTop, `${style.id} scroll margin`).toBe(expectedScrollMargin);
      }
    }
    for (const selector of sectionLabelSelectors) {
      await expect(page.locator(selector)).toHaveCSS("font-size", "11px");
      await expect(page.locator(selector)).toHaveCSS("letter-spacing", "1.54px");
    }
    const activityGroupLabels = page.locator('#code [data-slot="pull-request-group"] h3');
    await expect(activityGroupLabels.first()).toHaveCSS("letter-spacing", "1.32px");
  }
});

test("Writing aligns below the sticky header at desktop widths", async ({ page }) => {
  for (const width of [1280, 1440] as const) {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/#writing");

    const offset = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>('[data-slot="site-header"]');
      const heading = document.querySelector<HTMLElement>("#writing-heading");
      if (!header || !heading) throw new Error("Writing heading and header must be measurable");
      return Math.abs(heading.getBoundingClientRect().top - header.getBoundingClientRect().bottom);
    });
    expect(offset).toBeLessThanOrEqual(1);

    await page.goto("/");
    await page.getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: "Writing" })
      .click();
    await expect.poll(() => page.evaluate(() => {
      const header = document.querySelector<HTMLElement>('[data-slot="site-header"]');
      const heading = document.querySelector<HTMLElement>("#writing-heading");
      if (!header || !heading) throw new Error("Writing heading and header must be measurable");
      return Math.abs(heading.getBoundingClientRect().top - header.getBoundingClientRect().bottom);
    })).toBeLessThanOrEqual(1);
  }
});

test("Page motion preflight reads the scoped 24px distance override", async ({ page }) => {
  await installMotionProbe(page, 24);
  await page.goto("/?debugSplash");

  await expect(page.locator("html")).toHaveAttribute("data-page-motion-pending", "true");
  expect(await page.locator("[data-page-motion-intro]").first().evaluate((element) =>
    new DOMMatrixReadOnly(getComputedStyle(element).transform).m42)).toBe(24);
});

test("Page motion propagates the scoped 24px distance through intro and row animations", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await installMotionProbe(page, 24);
  await page.goto("/");

  const intro = await seekMotionMidpoint(page, "[data-page-motion-intro]");
  expect(intro.initialTranslateY).toBe(24);
  expect(intro.opacity).toBeGreaterThan(0);
  expect(intro.opacity).toBeLessThan(1);
  expect(intro.translateY).toBeGreaterThan(0);
  expect(intro.translateY).toBeLessThan(24);

  await page.locator("[data-page-motion-intro]").evaluateAll((targets) => {
    for (const target of targets) for (const animation of target.getAnimations()) animation.finish();
  });
  await expect.poll(() => page.locator("[data-page-motion-intro]").first().evaluate((target) => ({
    opacity: getComputedStyle(target).opacity,
    transform: getComputedStyle(target).transform,
  }))).toEqual({ opacity: "1", transform: "none" });
  const row = page.locator("#experience ol > [data-page-motion-row]").last();
  await row.evaluate((element) => {
    const absoluteTop = element.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, absoluteTop - window.innerHeight * 0.88);
  });
  const rowMidpoint = await seekMotionMidpoint(page, "#experience ol > [data-page-motion-row]:last-child");
  expect(rowMidpoint.initialTranslateY).toBe(24);
  expect(rowMidpoint.opacity).toBeGreaterThan(0);
  expect(rowMidpoint.opacity).toBeLessThan(1);
  expect(rowMidpoint.translateY).toBeGreaterThan(0);
  expect(rowMidpoint.translateY).toBeLessThan(24);
  await row.evaluate((target) => {
    for (const animation of target.getAnimations()) animation.finish();
  });
  await expect.poll(() => row.evaluate((target) => ({
    opacity: getComputedStyle(target).opacity,
    transform: getComputedStyle(target).transform,
  }))).toEqual({ opacity: "1", transform: "none" });
});

test("Page motion distance stays 18px when the root font size changes", async ({ page }) => {
  await installMotionProbe(page);
  await page.goto("/?debugSplash");
  await page.locator("html").evaluate((element) => {
    element.style.fontSize = "20px";
  });

  await expect(page.locator("html")).toHaveCSS("font-size", "20px");
  await expect(page.locator("body")).toHaveCSS("--page-motion-distance", "18px");
  expect(await page.locator("[data-page-motion-intro]").first().evaluate((element) =>
    new DOMMatrixReadOnly(getComputedStyle(element).transform).m42)).toBe(18);
});

test("Reduced page motion removes the scoped entrance translation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installMotionProbe(page, 24);
  await page.goto("/?debugSplash");

  await expect(page.locator("[data-page-motion-intro]").first()).toHaveCSS("transform", "none");
});
