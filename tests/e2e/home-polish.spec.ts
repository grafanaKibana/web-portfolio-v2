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

test("recommendation controls expose position and keep keyboard browsing anchored", { tag: "@webkit" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStableHome(page);

  const track = page.locator('[data-slot="recommendation-track"]');
  const itemCount = await track.locator(":scope > li").count();
  test.skip(itemCount < 2, "Home has fewer than two recommendation records");

  const controls = page.locator('[data-slot="recommendation-controls"]');
  const previous = controls.getByRole("button", { name: "Previous recommendation" });
  const next = controls.getByRole("button", { name: "Next recommendation" });
  const position = controls.locator("output");
  await expect(controls).toBeVisible();
  await expect(position).toHaveText(`1 / ${String(itemCount)}`);
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();

  let currentIndex = 1;
  for (let attempt = 0; attempt < itemCount && currentIndex < itemCount; attempt += 1) {
    const priorIndex = currentIndex;
    await next.focus();
    await page.keyboard.press("Enter");
    await expect.poll(async () => {
      const match = (await position.textContent())?.match(/^(\d+)\s*\//);
      return match?.[1] ? Number.parseInt(match[1], 10) : 0;
    }).toBeGreaterThan(priorIndex);
    const match = (await position.textContent())?.match(/^(\d+)\s*\//);
    currentIndex = match?.[1] ? Number.parseInt(match[1], 10) : 0;
    expect(currentIndex).toBeLessThanOrEqual(itemCount);
    if (currentIndex < itemCount) await expect(next).toBeFocused();
  }
  await expect(position).toHaveText(`${String(itemCount)} / ${String(itemCount)}`);
  await expect(next).toBeDisabled();

  await previous.focus();
  await page.keyboard.press("Enter");
  await expect.poll(async () => {
    const match = (await position.textContent())?.match(/^(\d+)\s*\//);
    return match?.[1] ? Number.parseInt(match[1], 10) : itemCount;
  }).toBeLessThan(itemCount);
  await expect(next).toBeEnabled();
});

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
