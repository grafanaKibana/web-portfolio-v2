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
  test(`focused touch Ask stays fixed during viewport scroll on ${viewport.label}`, { tag: "@webkit" }, async ({ browser, baseURL }) => {
    if (!baseURL) throw new Error("Expected the Playwright project to provide a base URL");
    for (const theme of themes) {
      const context = await newTouchContext(browser, baseURL, { ...viewport, theme });
      try {
        await context.addInitScript(() => {
          const viewport = new EventTarget();
          Object.assign(viewport, { height: innerHeight, width: innerWidth, offsetTop: 0, offsetLeft: 0, scale: 1 });
          Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
          window.addEventListener("ask-fixture-viewport", (event) => {
            const { type, ...bounds } = (event as CustomEvent<{ type: string; height?: number; offsetTop?: number; scale?: number }>).detail;
            Object.assign(viewport, bounds);
            viewport.dispatchEvent(new Event(type));
          });
        });
        const page = await openHome(context);
        const entry = page.locator("[data-edge-entry]");
        await page.getByRole("button", { name: "Ask about my work" }).tap();
        const input = entry.getByRole("textbox", { name: "Your question" });
        await expect(input).toBeFocused();

        // Simulate the keyboard shrinking the visible viewport, without resizing the layout viewport.
        await page.evaluate(() => {
          window.dispatchEvent(new CustomEvent("ask-fixture-viewport", { detail: { type: "resize", height: 400 } }));
        });
        const composer = entry.locator('[data-slot="input-group"]');
        const before = await composer.boundingBox();
        if (!before) throw new Error("Expected a visible focused composer");
        expect(before.y + before.height).toBeLessThanOrEqual(400);

        // Include reported bounds beyond the layout edge, then recovery from overscroll.
        for (const offsetTop of [80, viewport.height - 320, 0]) {
          await page.evaluate((offsetTop) => {
            window.scrollBy({ top: 100, behavior: "instant" });
            window.dispatchEvent(new CustomEvent("ask-fixture-viewport", { detail: { type: "scroll", offsetTop } }));
          }, offsetTop);
          await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
          await expect(input).toBeFocused();
          const scrolled = await composer.boundingBox();
          if (!scrolled) throw new Error("Expected the composer to remain rendered");
          // The visible screen begins at offsetTop inside the layout viewport.
          expect(scrolled.y - offsetTop).toBeCloseTo(before.y, 0);
          expect(scrolled.height).toBe(before.height);
          expect(scrolled.width).toBe(before.width);
          expect(scrolled.x).toBe(before.x);
        }

        // Keyboard resizing still repositions the field above the new visible bottom edge.
        await page.evaluate(() => {
          window.dispatchEvent(new CustomEvent("ask-fixture-viewport", { detail: { type: "resize", height: 460, offsetTop: 0 } }));
        });
        await expect.poll(async () => (await composer.boundingBox())?.y).toBeCloseTo(before.y + 60, 0);

        // Magnified viewport panning must keep following the reader, including while focused.
        await page.evaluate(() => {
          window.dispatchEvent(new CustomEvent("ask-fixture-viewport", { detail: { type: "scroll", offsetTop: 40, scale: 2 } }));
        });
        await expect.poll(async () => (await composer.boundingBox())?.y).toBeCloseTo(before.y + 100, 0);
      } finally {
        await context.close();
      }
    }
  });
}

for (const viewport of touchViewports) {
  test(`touch Ask uses the revealed field shadow on ${viewport.label}`, { tag: "@webkit" }, async ({ browser, baseURL }) => {
    if (!baseURL) throw new Error("Expected the Playwright project to provide a base URL");
    for (const theme of themes) {
      const context = await newTouchContext(browser, baseURL, {
        ...viewport,
        reducedMotion: "no-preference",
        theme,
      });
      try {
        const page = await openHome(context);
        const entry = page.locator("[data-edge-entry]");
        const surface = entry.locator("[data-composer-surface]");
        await expect(entry).toHaveAttribute("data-entry-revealed", "false");
        await expect(surface).toHaveCSS("box-shadow", "none");
        const idleExtents = await readDocumentExtents(page);
        expect(idleExtents.scrollWidth).toBe(idleExtents.clientWidth);

        await page.getByRole("button", { name: "Ask about my work" }).tap();
        await expect(entry).toHaveAttribute("data-entry-revealed", "true");
        const input = entry.getByRole("textbox", { name: "Your question" });
        await expect(input).toBeFocused();
        await expect(surface).not.toHaveCSS("box-shadow", "none");
        expect(await readDocumentExtents(page)).toEqual(idleExtents);

        await input.fill("Synthetic retained draft");
        await page.getByRole("link", { name: "Back to top" }).tap();
        await expect(input).not.toBeFocused();
        await expect(entry).toHaveAttribute("data-entry-revealed", "true");
        await expect(surface).not.toHaveCSS("box-shadow", "none");

        await input.tap();
        await expect(input).toBeFocused();
        await input.fill("");
        await page.getByRole("link", { name: "Back to top" }).tap();
        await expect(entry).toHaveAttribute("data-entry-revealed", "false");
        await expect(surface).toHaveCSS("box-shadow", "none");
        expect(await readDocumentExtents(page)).toEqual(idleExtents);

        await page.evaluate(() => { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }); });
        await expect(entry).toHaveAttribute("data-entry-revealed", "true");
        await expect(input).not.toBeFocused();
        await expect(surface).not.toHaveCSS("box-shadow", "none");
      } finally {
        await context.close();
      }
    }
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

test("touch header and field shadow remove transitions when reduced motion is requested", { tag: "@webkit" }, async ({ browser, baseURL }) => {
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
    await expect(page.locator("[data-edge-entry] [data-composer-surface]")).toHaveCSS("transition-duration", "0s");
    const headerDuration = await page.locator('[data-slot="site-header"]').evaluate((header) => Number.parseFloat(getComputedStyle(header, "::before").transitionDuration));
    expect(headerDuration).toBeLessThanOrEqual(0.001);
  } finally {
    await context.close();
  }
});

test("fine-pointer desktop retains a transparent hero header and revealed Ask shadow", { tag: "@webkit" }, async ({ page }) => {
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
  const surface = entry.locator("[data-composer-surface]");
  await expect(surface).toHaveCSS("box-shadow", "none");
  await entry.hover();
  await expect(entry).toHaveAttribute("data-entry-revealed", "true");
  await expect(surface).not.toHaveCSS("box-shadow", "none");
});
