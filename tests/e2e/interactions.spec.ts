import { expect, test, type Locator, type Page } from "@playwright/test";

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

/**
 * Reports whether two rendered rectangles overlap in both axes.
 *
 * @param first - First rendered rectangle.
 * @param second - Second rendered rectangle.
 * @returns Whether the rectangles overlap.
 */
function overlaps(first: Awaited<ReturnType<typeof boxOf>>, second: Awaited<ReturnType<typeof boxOf>>) {
  return first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y;
}

/**
 * Opens a route after suppressing the one-session decorative splash.
 *
 * @param page - Browser page to initialize.
 * @param path - Route to open.
 */
async function openStableRoute(page: Page, path: string) {
  await page.addInitScript(() => {
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  });
  await page.goto(path);
}

/**
 * Waits until scrolling has stopped across several independent samples.
 *
 * @param page - Browser page whose viewport must settle.
 */
async function waitForScrollSettlement(page: Page): Promise<void> {
  let previous = Number.NaN;
  let stableSamples = 0;
  await expect.poll(async () => {
    const current = await page.evaluate(() => window.scrollY);
    stableSamples = Math.abs(current - previous) < 0.5 ? stableSamples + 1 : 0;
    previous = current;
    return stableSamples;
  }, { intervals: [100, 100, 100, 100, 100], timeout: 5_000 }).toBeGreaterThanOrEqual(4);
}

/**
 * Returns the first visible content that follows a Home section anchor.
 *
 * @param page - Rendered Home page.
 * @param sectionId - Fragment identifier for the selected section.
 * @returns Visible content used to verify anchor clearance.
 */
function visibleSectionStart(page: Page, sectionId: string): Locator {
  const section = page.locator(`#${sectionId}`);
  return sectionId === "about"
    ? section.locator("[data-page-motion-row]").first()
    : section.getByRole("heading").first();
}

/**
 * Waits for section content or its owning row to finish its reveal translation.
 *
 * @param content - Visible content whose final bounds will be measured.
 */
async function waitForSectionReveal(content: Locator): Promise<void> {
  await expect.poll(() => content.evaluate((element) =>
    getComputedStyle(element.closest("[data-page-motion-row]") ?? element).transform,
  )).toBe("none");
}

test("skip navigation transfers keyboard focus to main content", { tag: "@webkit" }, async ({ page, browserName }) => {
  for (const path of ["/", "/articles"]) {
    await page.goto(path);
    await page.keyboard.press(browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab");
    const skipLink = page.getByRole("link", { name: "Skip to content" });
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("main#main")).toBeFocused();
  }
});

test("compact navigation traps focus, restores it, and reaches a visible target", { tag: "@webkit" }, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStableRoute(page, "/");
  await page.locator("main#main > section").nth(1).scrollIntoViewIfNeeded();
  const trigger = page.getByRole("button", { name: "Jump to section" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Jump to section" });
  const close = page.getByRole("button", { name: "Close navigation" });
  await expect(dialog).toBeVisible();
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("link").last()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  const sectionLink = dialog.locator('a[href^="/#"]').first();
  const href = await sectionLink.getAttribute("href");
  if (!href) throw new Error("Compact navigation must expose a section destination");
  await sectionLink.click();
  await expect(page).toHaveURL(new RegExp(`${href.replace("/", "")}$`));
  const target = page.locator(`#${href.slice(2)}`);
  await expect(target).toBeVisible();
  await waitForScrollSettlement(page);
  const content = visibleSectionStart(page, href.slice(2));
  await waitForSectionReveal(content);
  const targetBox = await boxOf(content);
  const headerBox = await boxOf(page.locator('[data-slot="site-header"]'));
  expect(targetBox.y - headerBox.y - headerBox.height).toBeGreaterThanOrEqual(14);
  expect(targetBox.y - headerBox.y - headerBox.height).toBeLessThanOrEqual(18);
});

for (const { width, sections } of [
  { width: 390, sections: ["experience", "about"] },
  { width: 1023, sections: ["education"] },
  { width: 1024, sections: ["skills", "projects"] },
  { width: 1279, sections: ["code"] },
  { width: 1280, sections: ["writing", "contact"] },
] as const) {
  test(`Home section navigation clears the sticky header at ${String(width)}px`, { tag: "@webkit" }, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openStableRoute(page, "/");
    if (width < 1280) await page.locator("#experience").scrollIntoViewIfNeeded();

    for (const sectionId of sections) {
      const label = sectionId.charAt(0).toUpperCase() + sectionId.slice(1);
      if (width < 1280) {
        const trigger = page.getByRole("button", { name: "Jump to section" });
        await expect(trigger).toBeVisible();
        await trigger.click();
        await page.getByRole("dialog", { name: "Jump to section" }).getByRole("link", { name: label, exact: true }).click();
      } else {
        await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: label, exact: true }).click();
      }

      await expect(page).toHaveURL(new RegExp(`#${sectionId}$`));
      await waitForScrollSettlement(page);
      const content = visibleSectionStart(page, sectionId);
      await waitForSectionReveal(content);
      const contentBox = await boxOf(content);
      const headerBox = await boxOf(page.locator('[data-slot="site-header"]'));
      const rawClearance = contentBox.y - headerBox.y - headerBox.height;
      const devicePixelRatio = await page.evaluate(() => window.devicePixelRatio);
      const clearance = Math.round(rawClearance * devicePixelRatio) / devicePixelRatio;
      expect(clearance).toBeGreaterThanOrEqual(14);
      if (!await page.evaluate(() => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1)) {
        expect(clearance).toBeLessThanOrEqual(18);
      }

      const activeNavigation = width < 1280
        ? page.getByRole("button", { name: "Jump to section" })
        : page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: label, exact: true });
      if (width < 1280) await expect(activeNavigation).toHaveText(label);
      else await expect(activeNavigation).toHaveAttribute("aria-current", "location");
    }
  });
}

test("phone shell keeps controls and content contained without overlap", { tag: "@webkit" }, async ({ page }) => {
  const width = 390;
  await page.setViewportSize({ width, height: 844 });
  await openStableRoute(page, "/");
  expect(await page.locator("html").evaluate((root) => root.scrollWidth <= root.clientWidth)).toBe(true);
  const header = page.locator('[data-slot="site-header"]');
  const headerBox = await boxOf(header);
  const controls = header.locator("a:visible, button:visible");
  const controlBoxes = await Promise.all((await controls.all()).map(boxOf));
  for (const box of controlBoxes) {
    expect(box.x).toBeGreaterThanOrEqual(headerBox.x - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(headerBox.x + headerBox.width + 1);
  }
  for (let index = 0; index < controlBoxes.length; index += 1) {
    for (let other = index + 1; other < controlBoxes.length; other += 1) {
      const first = controlBoxes[index];
      const second = controlBoxes[other];
      if (!first || !second) throw new Error("Expected both header controls to be measurable");
      expect(overlaps(first, second)).toBe(false);
    }
  }
  for (const section of await page.locator("main#main > section").all()) {
    const box = await boxOf(section);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
  }
});

test("desktop Home sections stay contained and ordered as text reflows", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await openStableRoute(page, "/");

  const main = await boxOf(page.locator("main#main"));
  const sections = page.locator("main#main > section");
  expect(await sections.count()).toBeGreaterThan(1);
  const sample = sections.locator("p").first();
  if (await sample.count()) {
    await sample.evaluate((element) => { element.textContent = "Synthetic readable content ".repeat(40); });
  }

  const boxes = await Promise.all((await sections.all()).map(boxOf));
  for (const [index, box] of boxes.entries()) {
    expect(box.x).toBeGreaterThanOrEqual(main.x - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(main.x + main.width + 1);
    const next = boxes[index + 1];
    if (next) expect(box.y + box.height).toBeLessThanOrEqual(next.y + 1);
  }
  expect(await page.locator("html").evaluate((root) => root.scrollWidth <= root.clientWidth)).toBe(true);
});

test("reduced motion leaves home and collection content visible and usable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const path of ["/", "/articles"]) {
    await openStableRoute(page, path);
    await expect(page.locator("main#main")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const targets = page.locator("[data-page-motion-intro]");
    if (await targets.count()) {
      await expect.poll(() => targets.evaluateAll((elements) => elements.every((element) => {
        const style = getComputedStyle(element);
        return style.visibility !== "hidden" && style.opacity !== "0" && style.transform === "none";
      }))).toBe(true);
    }
  }
});

test("direct and cross-route Home fragments retain header clearance", { tag: "@webkit" }, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 844 });

  await openStableRoute(page, "/#skills");
  await waitForScrollSettlement(page);
  let header = await boxOf(page.locator('[data-slot="site-header"]'));
  let content = await boxOf(visibleSectionStart(page, "skills"));
  expect(content.y - header.y - header.height).toBeGreaterThanOrEqual(14);
  await expect(page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Skills", exact: true })).toHaveAttribute("aria-current", "location");

  await page.goto("/articles");
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Education", exact: true }).click();
  await expect(page).toHaveURL(/\/#education$/u);
  await waitForScrollSettlement(page);
  header = await boxOf(page.locator('[data-slot="site-header"]'));
  content = await boxOf(visibleSectionStart(page, "education"));
  expect(content.y - header.y - header.height).toBeGreaterThanOrEqual(14);

  await page.addInitScript(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await openStableRoute(page, "/");
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Skills", exact: true }).click();
  await waitForScrollSettlement(page);
  header = await boxOf(page.locator('[data-slot="site-header"]'));
  content = await boxOf(visibleSectionStart(page, "skills"));
  const rem = await page.locator("html").evaluate((root) => Number.parseFloat(getComputedStyle(root).fontSize));
  expect(Math.abs(content.y - header.y - header.height - rem)).toBeLessThanOrEqual(2);
});

for (const theme of ["light", "dark"] as const) {
  test(`hero, header, and chat reveal before assets load without replaying (${theme})`, { tag: "@webkit" }, async ({ page }) => {
    await page.addInitScript((theme) => {
      localStorage.setItem("theme", theme);
      sessionStorage.setItem("portfolio-opening-splash-seen", "true");
      document.addEventListener("animationstart", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement) || !target.matches('[data-slot="hero"] > [data-page-motion-intro], [data-slot="site-header"] > nav, [data-entry-stroke]')) return;
        target.dataset.revealForeground = getComputedStyle(target).color;
        target.dataset.revealStarts = String(Number(target.dataset.revealStarts ?? 0) + 1);
        target.dataset.revealBeforeHydration = String(!document.querySelector("[data-theme-root]"));
        /** Records a real intermediate reveal frame before the animation finishes. */
        const sample = () => {
          const css = getComputedStyle(target);
          if (Number(css.opacity) > 0 && Number(css.opacity) < 1 && css.visibility === "visible"
            && (target.matches('[data-slot="site-header"] > nav') || css.transform !== "none")) {
            target.dataset.revealProgressed = "true";
          } else if (css.opacity !== "1") {
            requestAnimationFrame(sample);
          }
        };
        requestAnimationFrame(sample);
      });
    }, theme);
    let releaseAssets = false;
    const pending: VoidFunction[] = [];
    await page.route(/\.(?:js|woff2?|webp)(?:\?.*)?$/, async (route) => {
      if (!releaseAssets) await new Promise<void>((resolve) => pending.push(resolve));
      await route.continue();
    });

    const content = page.locator('[data-slot="hero"] > [data-page-motion-intro], [data-slot="site-header"] > nav, [data-entry-stroke]');
    try {
      await page.goto("/", { waitUntil: "commit" });
      await expect(content).toHaveCount(6);
      for (const target of await content.all()) {
        await expect(target).toHaveAttribute("data-reveal-before-hydration", "true");
        await expect(target).toHaveAttribute("data-reveal-progressed", "true");
        await expect(target).toHaveCSS("opacity", "1");
        await expect(target).toBeVisible();
        if (await target.getAttribute("data-entry-stroke") === null) await expect(target).toHaveCSS("transform", "none");
      }
      await expect(page.locator("[data-theme-root]")).toHaveCount(0);
      const heroColor = await page.locator('[data-slot="hero"]').evaluate((hero) => getComputedStyle(hero).color);
      const header = page.locator('[data-slot="site-header"]');
      await expect(header).toHaveCSS("color", heroColor);
      await expect(header.locator("nav")).toHaveAttribute("data-reveal-foreground", heroColor);
      expect(await header.evaluate((element) => getComputedStyle(element, "::before").opacity)).toBe("0");
    } finally {
      releaseAssets = true;
      for (const release of pending) release();
    }
    await expect(page.locator("[data-theme-root]")).toHaveCount(1);
    await expect(page.locator("html")).not.toHaveAttribute("data-page-motion-pending");
    for (const target of await content.all()) {
      await expect(target).toHaveAttribute("data-reveal-starts", "1");
      await expect(target).toHaveCSS("opacity", "1");
      if (await target.getAttribute("data-entry-stroke") === null) await expect(target).toHaveCSS("transform", "none");
    }
  });
}

test("first-visit hero reveal waits for the splash handoff", { tag: "@webkit" }, async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-slot="opening-splash"]')).toHaveAttribute("data-state", "visible");
  const content = page.locator('[data-slot="hero"] > [data-page-motion-intro], [data-slot="site-header"] > nav, [data-entry-stroke]');
  await expect(content).toHaveCount(6);
  for (const target of await content.all()) {
    await expect(target).toHaveCSS("animation-play-state", "paused");
    await expect(target).toHaveCSS("opacity", "0");
  }
  await expect(page.locator("html")).toHaveAttribute("data-splash-complete", "true");
  for (const target of await content.all()) {
    await expect(target).toHaveCSS("animation-play-state", "running");
    await expect(target).toHaveCSS("opacity", "1");
    if (await target.getAttribute("data-entry-stroke") === null) await expect(target).toHaveCSS("transform", "none");
  }
});

test("opening splash preloads and decodes only the resolved-theme hero", { tag: "@webkit" }, async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    localStorage.setItem("theme", "dark");
    const state = window as typeof window & {
      __openingImageDecodes: string[];
      __openingImageDecodesAtHandoff?: string[];
      __openingRendererAtHandoff?: string;
    };
    state.__openingImageDecodes = [];
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Preserve the browser's native decoder while recording successful readiness.
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function () {
      const source = this.src;
      return decode.call(this).then(() => {
        state.__openingImageDecodes.push(source);
      });
    };
    window.addEventListener("opening-splash-complete", () => {
      state.__openingImageDecodesAtHandoff = [...state.__openingImageDecodes];
      state.__openingRendererAtHandoff = document.querySelector<HTMLCanvasElement>("canvas[data-opening-renderer]")?.dataset.openingRenderer ?? "absent";
    });
  });

  const requestedHeroImages: string[] = [];
  page.on("request", (request) => {
    if (/hero-(?:dark|light|noise)\.generated\.[^/]+\.webp/.test(request.url())) {
      requestedHeroImages.push(request.url());
    }
  });
  let releaseHeroResponse: (() => void) | undefined;
  const heroResponseGate = new Promise<void>((resolve) => {
    releaseHeroResponse = resolve;
  });
  await page.route(/hero-dark\.generated\.[^/]+\.webp/, async (route) => {
    await heroResponseGate;
    await route.continue();
  });

  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const splash = page.locator('[data-slot="opening-splash"]');
    await expect(splash).toHaveAttribute("data-state", "visible");
    await page.waitForTimeout(3_300);
    await expect(splash).toHaveAttribute("data-state", "visible");
    releaseHeroResponse?.();
    await expect(splash).toHaveCount(0, { timeout: 5_000 });
    await expect(page.locator("html")).toHaveAttribute("data-splash-complete", "true");
  } finally {
    releaseHeroResponse?.();
  }

  const primary = page.locator('link[data-opening-image="primary"]');
  const shared = page.locator('link[data-opening-image="shared"][href*="hero-noise.generated."]');
  const fade = page.locator('link[data-opening-image="shared"][href*="hero-fade.generated."]');
  await expect(primary).toHaveAttribute("href", /hero-dark\.generated\.[^/]+\.webp/);
  await expect(primary).toHaveAttribute("fetchpriority", "high");
  await expect(shared).toHaveAttribute("href", /hero-noise\.generated\.[^/]+\.webp/);
  await expect(shared).toHaveAttribute("fetchpriority", "high");
  await expect(fade).toHaveAttribute("fetchpriority", "high");
  expect(requestedHeroImages.some((url) => /hero-dark\.generated\.[^/]+\.webp/.test(url))).toBe(true);
  expect(requestedHeroImages.some((url) => /hero-noise\.generated\.[^/]+\.webp/.test(url))).toBe(true);
  expect(requestedHeroImages.some((url) => /hero-light\.generated\.[^/]+\.webp/.test(url))).toBe(false);
  const decodedAtHandoff = await page.evaluate(() => {
    const state = window as typeof window & { __openingImageDecodesAtHandoff?: string[] };
    return state.__openingImageDecodesAtHandoff ?? [];
  });
  expect(decodedAtHandoff.some((url) => /hero-dark\.generated\.[^/]+\.webp/.test(url))).toBe(true);
  expect(decodedAtHandoff.some((url) => /hero-noise\.generated\.[^/]+\.webp/.test(url))).toBe(true);
  expect(decodedAtHandoff.some((url) => /hero-fade\.generated\.[^/]+\.webp/.test(url))).toBe(true);
  expect(decodedAtHandoff.some((url) => /hero-light\.generated\.[^/]+\.webp/.test(url))).toBe(false);
  expect(await page.evaluate(() => (window as typeof window & { __openingRendererAtHandoff?: string }).__openingRendererAtHandoff)).toBe("ready");
});

test("active hero preload starts during parsing before hydration", { tag: "@webkit" }, async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => {
    localStorage.setItem("theme", "light");
  });

  const requestedHeroImages: string[] = [];
  page.on("request", (request) => {
    if (/hero-(?:dark|light|noise)\.generated\.[^/]+\.webp/.test(request.url())) {
      requestedHeroImages.push(request.url());
    }
  });
  let releaseScripts: (() => void) | undefined;
  const scriptGate = new Promise<void>((resolve) => {
    releaseScripts = resolve;
  });
  await page.route(/\/_next\/static\/chunks\/.*\.js(?:\?.*)?$/, async (route) => {
    await scriptGate;
    await route.continue();
  });

  try {
    await page.goto("/", { waitUntil: "commit" });
    const primary = page.locator('link[data-opening-image="primary"]');
    await expect(primary).toHaveAttribute("href", /hero-light\.generated\.[^/]+\.webp/);
    await expect(primary).toHaveAttribute("fetchpriority", "high");
    await expect(page.locator("[data-theme-root]")).toHaveCount(0);
    await expect.poll(() => requestedHeroImages.some((url) => /hero-light\.generated\.[^/]+\.webp/.test(url))).toBe(true);
    expect(requestedHeroImages.some((url) => /hero-dark\.generated\.[^/]+\.webp/.test(url))).toBe(false);
  } finally {
    releaseScripts?.();
  }
});

test("opening splash fails open when the active hero never responds", { tag: "@webkit" }, async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  let releaseResponse: (() => void) | undefined;
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  await page.route(/hero-dark\.generated\.[^/]+\.webp/, async (route) => {
    await responseGate;
    await route.fulfill({ status: 503, body: "Unavailable" }).catch(() => undefined);
  });

  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const splash = page.locator('[data-slot="opening-splash"]');
    await expect(splash).toHaveAttribute("data-state", "visible");
    await page.waitForTimeout(3_300);
    await expect(splash).toHaveAttribute("data-state", "visible");
    await expect(splash).toHaveCount(0, { timeout: 7_000 });
    await expect(page.getByRole("main")).toBeVisible();
  } finally {
    releaseResponse?.();
  }
});

test("chat entry keeps a usable fallback without JavaScript or native popup support", { tag: "@webkit" }, async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error("Browser tests require a configured base URL");
  for (const javaScriptEnabled of [false, true]) {
    const context = await browser.newContext({ baseURL, javaScriptEnabled, reducedMotion: "reduce" });
    try {
      await context.addInitScript(() => {
        sessionStorage.setItem("portfolio-opening-splash-seen", "true");
        Object.defineProperty(HTMLElement.prototype, "showPopover", { value: undefined, configurable: true });
      });
      const page = await context.newPage();
      await page.goto("/");
      const shell = page.locator("[data-conversation-shell]");
      await expect(shell.getByRole("link", { name: "Contact me" })).toBeVisible();
      await expect(shell.locator("[data-entry-stroke]")).toBeHidden();
      await expect(shell.locator("button[data-launcher]")).toHaveCount(0);
    } finally {
      await context.close();
    }
  }
});

test("readiness failure leaves visible usable content", { tag: "@webkit" }, async ({ page }) => {
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-deprecated, @typescript-eslint/unbound-method -- Exercise the splash fail-open path.
    const querySelector = Document.prototype.querySelector;
    // eslint-disable-next-line @typescript-eslint/no-deprecated, @typescript-eslint/no-unnecessary-type-parameters -- Preserve the DOM method contract.
    Document.prototype.querySelector = function <ElementType extends Element = Element>(selector: string) {
      if (selector === "main#main") return null;
      return querySelector.call(this, selector) as ElementType | null;
    };
  });
  await page.goto("/");
  // Start the fail-open deadline after hydration activates the splash controller.
  await expect(page.locator('[data-slot="opening-splash"][data-state="inactive"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="opening-splash"]')).toHaveCount(0);
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
});
