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
  await expect.poll(async () => {
    const targetBox = await boxOf(target.getByRole("heading").first());
    const headerBox = await boxOf(page.locator('[data-slot="site-header"]'));
    return targetBox.y >= headerBox.y + headerBox.height - 1;
  }).toBe(true);
});

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
  await expect(page.locator('[data-slot="opening-splash"]')).toHaveCount(0);
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
});
