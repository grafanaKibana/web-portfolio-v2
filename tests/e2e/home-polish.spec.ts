import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

type AskFixtureWindow = Window & { askFixtureRequests: number };

/**
 * Opens Home with deterministic motion and without the decorative session splash.
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

/**
 * Installs the minimum deterministic Ask stream needed to retain one conversation.
 *
 * @param page - Browser page receiving the transport fixture.
 */
async function installAskTransport(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as AskFixtureWindow).askFixtureRequests = 0;
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.endsWith("/api/ask")) return originalFetch(input, init);
      (window as unknown as AskFixtureWindow).askFixtureRequests += 1;
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        /**
         * Opens a valid event stream and completes it after the test emits a reply.
         *
         * @param controller - Stream controller receiving synthetic events.
         */
        start(controller) {
          controller.enqueue(encoder.encode('event: metadata\ndata: {"mode":"live"}\n\n'));
          /** Completes the current synthetic reply. */
          const finish = () => {
            controller.enqueue(encoder.encode('event: delta\ndata: {"text":"Synthetic retained answer."}\n\n'));
            controller.enqueue(encoder.encode('event: done\ndata: {"sources":[],"followUps":[]}\n\n'));
            window.removeEventListener("home-polish-ask-reply", finish);
            controller.close();
          };
          window.addEventListener("home-polish-ask-reply", finish, { once: true });
        },
      });
      return Promise.resolve(new Response(stream, { headers: { "Content-Type": "text/event-stream" } }));
    };
  });
}

/**
 * Reads a required rendered box.
 *
 * @param locator - Element that must have measurable geometry.
 * @returns Rendered element bounds.
 */
async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Expected measurable rendered geometry");
  return box;
}

/**
 * Creates a short-viewport browser context with JavaScript disabled.
 *
 * @param browser - Project browser used by the test.
 * @param baseURL - Production test-server origin.
 * @returns Isolated no-JavaScript context.
 */
async function newNoScriptContext(browser: Browser, baseURL: string) {
  return browser.newContext({
    baseURL,
    javaScriptEnabled: false,
    reducedMotion: "reduce",
    viewport: { width: 390, height: 240 },
  });
}

/**
 * Measures visible recommendation overflow independently of the browsing controls.
 * @param track - Rendered recommendation list.
 * @returns Scroll extent, hidden content width and distance between cards.
 */
async function recommendationGeometry(track: Locator) {
  return track.evaluate((element) => {
    const items = Array.from(element.children);
    const [first, second] = items;
    const right = element.getBoundingClientRect().right;
    return {
      maximum: element.scrollWidth - element.clientWidth,
      hiddenContent: (items.at(-1)?.getBoundingClientRect().right ?? right) - right + element.scrollLeft,
      step: first && second ? second.getBoundingClientRect().left - first.getBoundingClientRect().left : 0,
    };
  });
}

test("recommendation pages ignore padding-only overflow and handle empty tracks", { tag: "@webkit" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStableHome(page);
  const track = page.locator('[data-slot="recommendation-track"]');
  const controls = page.locator('[data-slot="recommendation-controls"]');
  await track.scrollIntoViewIfNeeded();

  for (const [count, pages] of [[0, 1], [1, 1], [2, 1], [3, 2], [5, 4]] as const) {
    await track.evaluate((element, itemCount) => {
      element.replaceChildren(...Array.from({ length: itemCount }, (_, index) => {
        const item = document.createElement("li");
        item.style.cssText = "flex: 0 0 180px; scroll-snap-align: start";
        item.textContent = `Synthetic recommendation ${String(index + 1)}`;
        return item;
      }));
      element.style.width = `${String(400 + itemCount)}px`;
      element.style.paddingRight = "56px";
      element.style.gap = "24px";
      element.scrollTo({ left: 0, behavior: "instant" });
    }, count);

    await expect(track).toHaveAttribute("data-edge-fade", pages > 1 ? "end" : "none");
    if (pages === 1) {
      await expect(controls).toBeHidden();
      if (count === 2) {
        expect((await recommendationGeometry(track)).maximum).toBeGreaterThan(1);
      }
      continue;
    }
    const position = controls.locator("output");
    const next = controls.getByRole("button", { name: "Next recommendation" });
    const previous = controls.getByRole("button", { name: "Previous recommendation" });
    await expect(position).toHaveText(`1 / ${String(pages)}`);
    for (let index = 1; index < pages; index += 1) {
      const before = await track.evaluate((element) => element.scrollLeft);
      await next.click();
      await expect(position).toHaveText(`${String(index + 1)} / ${String(pages)}`);
      await expect.poll(() => track.evaluate((element) => element.scrollLeft)).toBeGreaterThan(before + 1);
    }
    await expect(next).toBeDisabled();
    const before = await track.evaluate((element) => element.scrollLeft);
    await previous.click();
    await expect.poll(() => track.evaluate((element) => element.scrollLeft)).toBeLessThan(before - 1);
  }
});

for (const width of [390, 1440]) {
  for (const theme of ["light", "dark"] as const) {
    test(`recommendation pages move in both directions at ${String(width)}px in ${theme}`, { tag: "@webkit" }, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => { localStorage.setItem("theme", value); }, theme);
      await openStableHome(page);

      const track = page.locator('[data-slot="recommendation-track"]');
      const itemCount = await track.locator(":scope > li").count();
      const geometry = await recommendationGeometry(track);
      test.skip(itemCount < 2 || geometry.hiddenContent <= 1, "Recommendations fit without browsing");
      const pageCount = Math.ceil((geometry.hiddenContent - 1) / geometry.step) + 1;

      const controls = page.locator('[data-slot="recommendation-controls"]');
      const previous = controls.getByRole("button", { name: "Previous recommendation" });
      const next = controls.getByRole("button", { name: "Next recommendation" });
      const position = controls.locator("output");
      await expect(controls).toBeVisible();
      await expect(position).toHaveText(`1 / ${String(pageCount)}`);
      await expect(previous).toBeDisabled();
      await expect(next).toBeEnabled();

      for (let index = 1; index < pageCount; index += 1) {
        const before = await track.evaluate((element) => element.scrollLeft);
        await next.focus();
        await page.keyboard.press("Enter");
        await expect(position).toHaveText(`${String(index + 1)} / ${String(pageCount)}`);
        await expect.poll(() => track.evaluate((element) => element.scrollLeft)).toBeGreaterThan(before + 1);
        if (index + 1 < pageCount) await expect(next).toBeFocused();
      }
      await expect(next).toBeDisabled();
      await expect.poll(() => track.evaluate((element) => element.scrollLeft)).toBeCloseTo(geometry.maximum, 0);

      await page.emulateMedia({ reducedMotion: "no-preference" });
      for (let index = pageCount - 1; index > 0; index -= 1) {
        const before = await track.evaluate((element) => element.scrollLeft);
        await previous.focus();
        await page.keyboard.press("Enter");
        await expect(position).toHaveText(`${String(index)} / ${String(pageCount)}`);
        await expect.poll(() => track.evaluate((element) => element.scrollLeft)).toBeLessThan(before - 1);
        if (index > 1) await expect(previous).toBeFocused();
      }
      await expect(previous).toBeDisabled();
      await expect(track).toHaveJSProperty("scrollLeft", 0);
      await expect(track).toHaveAttribute("data-edge-fade", "end");

      await page.setViewportSize({ width: width === 390 ? 1440 : 390, height: 900 });
      const resized = await recommendationGeometry(track);
      if (resized.hiddenContent <= 1) {
        await expect(controls).toBeHidden();
        return;
      }
      const resizedCount = Math.ceil((resized.hiddenContent - 1) / resized.step) + 1;
      await expect(position).toHaveText(`1 / ${String(resizedCount)}`);
      await track.evaluate((element) => { element.scrollTo({ left: element.scrollWidth, behavior: "instant" }); });
      await expect(position).toHaveText(`${String(resizedCount)} / ${String(resizedCount)}`);
      await expect(next).toBeDisabled();
      await expect(track).toHaveAttribute("data-edge-fade", "start");
      await previous.click();
      await expect.poll(() => track.evaluate((element) => element.scrollLeft)).toBeLessThan(resized.maximum - 1);
      await expect.poll(() => track.evaluate((element) => element.scrollLeft)).toBeCloseTo((resizedCount - 2) * resized.step, 0);
      await track.scrollIntoViewIfNeeded();
    });
  }
}

test("Ask distinguishes first activation from reopening retained dialog history", { tag: "@webkit" }, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAskTransport(page);
  await openStableHome(page);

  const launcher = page.locator("button[data-launcher]");
  await expect(launcher).toHaveAccessibleName("Ask about my work");
  await expect(launcher).not.toHaveAttribute("aria-haspopup", "dialog");
  await expect(launcher).toHaveAttribute("aria-controls", "portfolio-conversation-entry");
  await expect(page.locator("#portfolio-conversation-entry")).toBeAttached();
  const launcherBox = await boxOf(launcher);
  expect(launcherBox.width).toBeGreaterThanOrEqual(44);
  expect(launcherBox.height).toBeGreaterThanOrEqual(44);
  await launcher.click();

  const input = page.getByRole("textbox", { name: "Your question" });
  await expect(input).toBeVisible();
  await input.fill("Synthetic retained question");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "About my work" });
  await expect(dialog).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as AskFixtureWindow).askFixtureRequests)).toBe(1);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("home-polish-ask-reply"));
  });
  await expect(dialog.getByText("Synthetic retained answer.", { exact: true })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(launcher).toBeFocused();
  await expect(launcher).toHaveAccessibleName("Reopen conversation");
  await expect(launcher).toHaveAttribute("aria-haspopup", "dialog");
});

test("no-JavaScript compact navigation scrolls locally on short screens", { tag: "@webkit" }, async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error("Expected the Playwright project to provide a base URL");
  const context = await newNoScriptContext(browser, baseURL);
  const page = await context.newPage();
  try {
    await page.goto("/");
    const details = page.locator("noscript details");
    await details.locator("summary").click();
    const menu = details.getByRole("navigation", { name: "Compact navigation" });
    await expect(menu).toBeVisible();
    const geometry = await menu.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        bottom: box.bottom,
        clientHeight: element.clientHeight,
        overflowY: style.overflowY,
        scrollHeight: element.scrollHeight,
        viewportHeight: window.innerHeight,
      };
    });
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
    expect(geometry.overflowY).toBe("auto");
    expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight);
    await menu.getByRole("link").last().scrollIntoViewIfNeeded();
    await expect(menu.getByRole("link").last()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  } finally {
    await context.close();
  }
});

test("wide touch navigation preserves 44px control targets", { tag: "@webkit" }, async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error("Expected the Playwright project to provide a base URL");
  const context = await browser.newContext({
    baseURL,
    hasTouch: true,
    reducedMotion: "reduce",
    viewport: { width: 1440, height: 900 },
  });
  await context.addInitScript(() => {
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  });
  const page = await context.newPage();
  try {
    await page.goto("/");
    const navigation = page.locator('[data-slot="site-header"] nav').first();
    const controls = navigation.locator("a:visible, button:visible");
    expect(await controls.count()).toBeGreaterThan(2);
    for (const control of await controls.all()) {
      const box = await boxOf(control);
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  } finally {
    await context.close();
  }
});

test("editorial rows keep equal title roles and distinct destination cues", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openStableHome(page);

  const rows = page.locator('[data-slot="home-project"], [data-slot="home-article"]');
  const rowCount = await rows.count();
  test.skip(rowCount < 2, "Home has fewer than two editorial records");
  const titleStyles = await rows.locator("h3").evaluateAll((titles) => titles.map((title) => {
    const style = getComputedStyle(title);
    return { fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight };
  }));
  expect(new Set(titleStyles.map((style) => JSON.stringify(style))).size).toBe(1);

  const internalLinks = rows.locator("a[data-row-link]");
  expect(await internalLinks.count()).toBe(rowCount);
  for (const link of await internalLinks.all()) {
    await expect(link).not.toHaveAttribute("target", "_blank");
    await expect(link.locator("svg.lucide-arrow-right")).toHaveCount(1);
  }
  for (const link of await rows.locator('a[target="_blank"]').all()) {
    await expect(link.locator("svg.lucide-arrow-right")).toHaveCount(0);
  }
});
