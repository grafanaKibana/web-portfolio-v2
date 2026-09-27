import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

const themes = ["light", "dark"] as const;
const touchViewports = [
  { height: 844, label: "phone", width: 390 },
  { height: 900, label: "wide tablet", width: 1280 },
] as const;

/**
 * Creates a touch-capable context with deterministic theme and motion settings.
 *
 * @param browser - Browser that owns the isolated context.
 * @param baseURL - Production test-server origin.
 * @param options - Theme, viewport, and motion preferences for the scenario.
 * @returns Touch-capable browser context.
 */
async function newTouchContext(
  browser: Browser,
  baseURL: string,
  options: {
    height: number;
    reducedMotion?: "no-preference" | "reduce";
    theme: (typeof themes)[number];
    width: number;
  },
) {
  const context = await browser.newContext({
    baseURL,
    colorScheme: options.theme,
    hasTouch: true,
    reducedMotion: options.reducedMotion ?? "reduce",
    viewport: { height: options.height, width: options.width },
  });
  await context.addInitScript((theme) => {
    localStorage.setItem("theme", theme);
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  }, options.theme);
  return context;
}

/**
 * Opens Home and waits for its stable initial hero state.
 *
 * @param context - Context that owns the new page.
 * @returns Stable Home page.
 */
async function openHome(context: BrowserContext) {
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator('[data-slot="site-header"]')).toHaveAttribute("data-surface-visible", "false");
  return page;
}

/**
 * Reads the rendered header surface, including its decorative background layer.
 *
 * @param page - Page containing the global header.
 * @returns Header geometry and pseudo-element paint properties.
 */
async function readHeaderSurface(page: Page) {
  return page.locator('[data-slot="site-header"]').evaluate((header) => {
    const bounds = header.getBoundingClientRect();
    const surface = getComputedStyle(header, "::before");
    const strip = getComputedStyle(header, "::after");
    const navigation = header.querySelector("nav")?.getBoundingClientRect();
    const surfaceTop = Number.parseFloat(surface.top);
    const surfaceBottom = Number.parseFloat(surface.bottom);
    return {
      backgroundImage: surface.backgroundImage,
      controlsTop: navigation?.top ?? Number.NaN,
      headerHeight: bounds.height,
      headerTop: bounds.top,
      opacity: surface.opacity,
      paintedBottom: bounds.bottom - surfaceBottom,
      paintedHeight: bounds.height - surfaceTop - surfaceBottom,
      paintedTop: bounds.top + surfaceTop,
      stripBackground: strip.backgroundColor,
      stripBottom: bounds.bottom - Number.parseFloat(strip.bottom),
    };
  });
}

/**
 * Reads document scroll extents without coupling the assertion to page content.
 *
 * @param page - Page whose root extents are required.
 * @returns Root client and scroll dimensions.
 */
async function readDocumentExtents(page: Page) {
  return page.locator("html").evaluate((root) => ({
    clientHeight: root.clientHeight,
    clientWidth: root.clientWidth,
    scrollHeight: root.scrollHeight,
    scrollWidth: root.scrollWidth,
  }));
}

/**
 * Scrolls far enough to place the complete hero above the sticky header.
 *
 * @param page - Home page containing the hero and sticky header.
 */
async function scrollPastHero(page: Page) {
  const target = await page.locator('[data-slot="hero"]').evaluate((hero) => hero.getBoundingClientRect().bottom + window.scrollY + 96);
  await page.evaluate((top) => { window.scrollTo({ behavior: "instant", top }); }, target);
}

for (const viewport of touchViewports) {
  test(`touch header keeps its neutral fade painted through the viewport top on ${viewport.label}`, { tag: "@webkit" }, async ({ browser, baseURL }) => {
    if (!baseURL) throw new Error("Expected the Playwright project to provide a base URL");
    const themePaints: string[] = [];

    for (const theme of themes) {
      const context = await newTouchContext(browser, baseURL, { ...viewport, theme });
      try {
        const page = await openHome(context);
        expect(await page.evaluate(() => matchMedia("(any-pointer: coarse)").matches)).toBe(true);

        const heroSurface = await readHeaderSurface(page);
        expect(heroSurface.opacity).toBe("1");
        expect(heroSurface.backgroundImage).toMatch(/^linear-gradient/);
        expect(heroSurface.paintedTop).toBeLessThanOrEqual(0.5);
        expect(heroSurface.paintedBottom).toBeCloseTo(heroSurface.paintedHeight, 0);
        expect(heroSurface.paintedHeight).toBeCloseTo(heroSurface.headerHeight, 0);
        expect(heroSurface.stripBottom).toBeLessThanOrEqual(0.5);
        expect(heroSurface.stripBackground).not.toBe("rgba(0, 0, 0, 0)");
        expect(heroSurface.controlsTop).toBeCloseTo(heroSurface.headerTop, 0);
        themePaints.push(heroSurface.backgroundImage);
        const initialExtents = await readDocumentExtents(page);

        await scrollPastHero(page);
        await expect(page.locator('[data-slot="site-header"]')).toHaveAttribute("data-surface-visible", "true");
        const scrolledSurface = await readHeaderSurface(page);
        expect(scrolledSurface.opacity).toBe("1");
        expect(scrolledSurface.backgroundImage).toBe(heroSurface.backgroundImage);
        expect(scrolledSurface.paintedTop).toBeLessThanOrEqual(0.5);
        expect(scrolledSurface.paintedHeight).toBeCloseTo(heroSurface.paintedHeight, 0);
        expect(scrolledSurface.stripBottom).toBeLessThanOrEqual(0.5);
        expect(await readDocumentExtents(page)).toEqual(initialExtents);
      } finally {
        await context.close();
      }
    }

    expect(themePaints[0]).not.toBe(themePaints[1]);
  });
}

for (const viewport of touchViewports) {
  test(`touch Ask preserves its radial fade while its neutral strip stays below the ${viewport.label} viewport`, { tag: "@webkit" }, async ({ browser, baseURL }) => {
    if (!baseURL) throw new Error("Expected the Playwright project to provide a base URL");
    const baselineContext = await browser.newContext({
      baseURL,
      colorScheme: "light",
      hasTouch: false,
      reducedMotion: "reduce",
      viewport: { height: viewport.height, width: viewport.width },
    });
    await baselineContext.addInitScript(() => {
      localStorage.setItem("theme", "light");
      sessionStorage.setItem("portfolio-opening-splash-seen", "true");
    });
    const baselinePage = await openHome(baselineContext);
    const baselineFade = baselinePage.locator("[data-entry-fade]");
    const baselineBounds = await baselineFade.boundingBox();
    if (!baselineBounds) throw new Error("Expected the fine-pointer Ask fade to have measurable geometry");
    const baselineExtents = await readDocumentExtents(baselinePage);
    await baselineContext.close();

    const stripPaints: string[] = [];

    for (const theme of themes) {
      const context = await newTouchContext(browser, baseURL, {
        ...viewport,
        reducedMotion: "no-preference",
        theme,
      });
      try {
        const page = await openHome(context);
        const entry = page.locator("[data-edge-entry]");
        const fade = entry.locator("[data-entry-fade]");
        await expect(entry).toHaveAttribute("data-entry-revealed", "false");
        await expect(fade).toHaveCSS("visibility", "hidden");
        await expect(fade).toHaveCSS("opacity", "0");
        await expect(fade).toHaveCSS("pointer-events", "none");
        const idleBounds = await fade.boundingBox();
        if (!idleBounds) throw new Error("Expected the hidden touch edge surface to have measurable geometry");
        const idleStripTop = await fade.evaluate((element) => element.getBoundingClientRect().top + Number.parseFloat(getComputedStyle(element, "::after").top));
        expect(idleBounds.y).toBeGreaterThanOrEqual(viewport.height - 0.5);
        expect(idleBounds.y + idleBounds.height).toBeGreaterThan(viewport.height);
        expect(idleStripTop).toBeGreaterThan(viewport.height);
        expect(idleBounds.width).toBeCloseTo(baselineBounds.width, 0);
        expect(idleBounds.height).toBeCloseTo(baselineBounds.height, 0);
        const idleExtents = await readDocumentExtents(page);
        expect(idleExtents.scrollWidth).toBe(idleExtents.clientWidth);
        expect(idleExtents).toEqual(baselineExtents);

        await fade.evaluate((element) => {
          const owner = window as typeof window & {
            touchFadeMotion?: { duration: number; earlyStripTop: number; earlyTop: number; lateStripTop: number; lateTop: number };
          };
          delete owner.touchFadeMotion;
          element.addEventListener("transitionrun", (event) => {
            if (!(event instanceof TransitionEvent) || event.propertyName !== "transform" || owner.touchFadeMotion) return;
            const animation = element.getAnimations().find(({ effect }) => effect instanceof KeyframeEffect
              && effect.getKeyframes().some((frame) => typeof frame.transform === "string" && frame.transform !== "none"));
            if (!animation || !(animation.effect instanceof KeyframeEffect)) return;
            const duration = Number(animation.effect.getTiming().duration);
            animation.pause();
            animation.currentTime = duration * 0.1;
            const earlyBounds = element.getBoundingClientRect();
            const stripTop = Number.parseFloat(getComputedStyle(element, "::after").top);
            animation.currentTime = duration * 0.9;
            const lateBounds = element.getBoundingClientRect();
            owner.touchFadeMotion = {
              duration,
              earlyStripTop: earlyBounds.top + stripTop,
              earlyTop: earlyBounds.top,
              lateStripTop: lateBounds.top + stripTop,
              lateTop: lateBounds.top,
            };
            animation.play();
          });
        });

        await page.getByRole("button", { name: "Ask about my work" }).tap();
        await expect(entry).toHaveAttribute("data-entry-revealed", "true");
        await expect.poll(() => fade.evaluate(() => Boolean((window as typeof window & { touchFadeMotion?: unknown }).touchFadeMotion))).toBe(true);
        const motion = await fade.evaluate(() => (window as typeof window & {
          touchFadeMotion: { duration: number; earlyStripTop: number; earlyTop: number; lateStripTop: number; lateTop: number };
        }).touchFadeMotion);
        expect(motion.duration).toBeGreaterThan(0);
        expect(motion.duration).toBeLessThanOrEqual(1_000);
        expect(motion.earlyTop).toBeGreaterThan(motion.lateTop);
        expect(motion.earlyStripTop).toBeGreaterThanOrEqual(viewport.height - 0.5);
        expect(motion.lateStripTop).toBeGreaterThanOrEqual(viewport.height - 0.5);

        await expect(fade).toHaveCSS("visibility", "visible");
        await expect(fade).toHaveCSS("opacity", "1");
        const surface = await fade.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const field = element.parentElement?.querySelector<HTMLElement>('[data-slot="input-group"]')?.getBoundingClientRect();
          return {
            afterBackground: getComputedStyle(element, "::after").backgroundColor,
            afterTop: bounds.top + Number.parseFloat(getComputedStyle(element, "::after").top),
            backgroundImage: getComputedStyle(element).backgroundImage,
            bottom: bounds.bottom,
            fieldTop: field?.top ?? Number.NaN,
            left: bounds.left,
            top: bounds.top,
            width: bounds.width,
          };
        });
        expect(surface.backgroundImage).toMatch(/^radial-gradient/);
        expect(surface.width).toBeCloseTo(baselineBounds.width, 0);
        expect(surface.bottom).toBeLessThan(viewport.height);
        expect(surface.afterTop).toBeCloseTo(viewport.height, 0);
        expect(surface.afterBackground).not.toBe("rgba(0, 0, 0, 0)");
        expect(surface.top).toBeLessThan(surface.fieldTop);
        expect(await readDocumentExtents(page)).toEqual(idleExtents);
        stripPaints.push(surface.afterBackground);

        await page.getByRole("link", { name: "Back to top" }).tap();
        await expect(entry).toHaveAttribute("data-entry-revealed", "false");
        await expect(fade).toHaveCSS("visibility", "hidden");
        const restingBounds = await fade.boundingBox();
        if (!restingBounds) throw new Error("Expected the resting touch edge surface to have measurable geometry");
        expect(restingBounds.y).toBeGreaterThanOrEqual(viewport.height - 0.5);
        expect(await readDocumentExtents(page)).toEqual(idleExtents);
      } finally {
        await context.close();
      }
    }

    expect(stripPaints[0]).not.toBe(stripPaints[1]);
  });
}

test("touch section selector surface fills the gap above the header", { tag: "@webkit" }, async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error("Expected the Playwright project to provide a base URL");
  const baselineContext = await browser.newContext({
    baseURL,
    colorScheme: "light",
    hasTouch: false,
    reducedMotion: "reduce",
    viewport: { height: 844, width: 390 },
  });
  await baselineContext.addInitScript(() => {
    localStorage.setItem("theme", "light");
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  });
  const baselinePage = await openHome(baselineContext);
  await baselinePage.locator("main#main > section").nth(1).scrollIntoViewIfNeeded();
  await baselinePage.getByRole("button", { name: "Jump to section" }).click();
  const baselinePopup = baselinePage.getByRole("dialog", { name: "Jump to section" });
  await expect(baselinePopup).toBeVisible();
  await baselinePopup.evaluate(async (element) => { await Promise.all(element.getAnimations({ subtree: true }).map(async (animation) => animation.finished)); });
  const baselineBounds = await baselinePopup.boundingBox();
  if (!baselineBounds) throw new Error("Expected the fine-pointer section selector to have measurable geometry");
  await baselineContext.close();

  for (const theme of themes) {
    const context = await newTouchContext(browser, baseURL, { height: 844, theme, width: 390 });
    try {
      const page = await openHome(context);
      const initialExtents = await readDocumentExtents(page);
      await page.locator("main#main > section").nth(1).scrollIntoViewIfNeeded();
      await page.getByRole("button", { name: "Jump to section" }).tap();
      const popup = page.getByRole("dialog", { name: "Jump to section" });
      await expect(popup).toBeVisible();
      await popup.evaluate(async (element) => { await Promise.all(element.getAnimations({ subtree: true }).map(async (animation) => animation.finished)); });
      const surface = await popup.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const paint = getComputedStyle(element, "::before");
        return {
          backgroundColor: paint.backgroundColor,
          bounds: { height: bounds.height, width: bounds.width, x: bounds.x, y: bounds.y },
          paintedBottom: bounds.bottom - Number.parseFloat(paint.bottom),
          paintedTop: bounds.top + Number.parseFloat(paint.top),
        };
      });
      expect(surface.bounds.width).toBeCloseTo(baselineBounds.width, 0);
      expect(surface.bounds.height).toBeCloseTo(baselineBounds.height, 0);
      expect(surface.bounds.x).toBeCloseTo(baselineBounds.x, 0);
      expect(surface.bounds.y).toBeCloseTo(baselineBounds.y, 0);
      expect(surface.paintedTop).toBeLessThanOrEqual(-843.5);
      expect(surface.paintedBottom).toBeGreaterThanOrEqual(surface.bounds.y);
      expect(surface.paintedBottom - surface.bounds.y).toBeLessThanOrEqual(1.5);
      expect(surface.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
      expect(await readDocumentExtents(page)).toEqual(initialExtents);
    } finally {
      await context.close();
    }
  }
});

test("touch edge surfaces remove transitions when reduced motion is requested", { tag: "@webkit" }, async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error("Expected the Playwright project to provide a base URL");
  const context = await newTouchContext(browser, baseURL, {
    height: 844,
    reducedMotion: "reduce",
    theme: "light",
    width: 390,
  });
  try {
    const page = await openHome(context);
    await page.getByRole("button", { name: "Ask about my work" }).tap();
    await expect(page.locator("[data-entry-fade]")).toHaveCSS("transition-duration", "0s");
    const headerDuration = await page.locator('[data-slot="site-header"]').evaluate((header) => Number.parseFloat(getComputedStyle(header, "::before").transitionDuration));
    expect(headerDuration).toBeLessThanOrEqual(0.001);
  } finally {
    await context.close();
  }
});

test("fine-pointer desktop retains a transparent hero header and radial Ask fade", { tag: "@webkit" }, async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("theme", "light");
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  });
  await page.goto("/");
  expect(await page.evaluate(() => matchMedia("(any-pointer: fine)").matches)).toBe(true);
  const header = page.locator('[data-slot="site-header"]');
  await expect(header).toHaveAttribute("data-surface-visible", "false");
  expect(await header.evaluate((element) => getComputedStyle(element, "::before").opacity)).toBe("0");

  const entry = page.locator("[data-edge-entry]");
  await entry.hover();
  await expect(entry.locator("[data-entry-fade]")).toHaveCSS("background-image", /^radial-gradient/);
});
