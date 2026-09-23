import { expect, test, type Locator, type Page } from "@playwright/test";

type Reply = {
  done?: boolean;
  error?: string;
  followUps?: Array<{ label: string; question: string }>;
  request?: number;
  text?: string;
};
type AskFixtureWindow = Window & { askFixture: { aborted: number[]; requests: unknown[] } };

/** Installs deterministic event-driven Ask streams and transport accounting.
 * @param page - Browser page receiving the fixture.
 */
async function installTransport(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const fixture = { aborted: [] as number[], requests: [] as unknown[] };
    (window as unknown as AskFixtureWindow).askFixture = fixture;
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.endsWith("/api/ask")) return originalFetch(input, init);
      const request = fixture.requests.push(JSON.parse(typeof init?.body === "string" ? init.body : "{}") as unknown) - 1;
      init?.signal?.addEventListener("abort", () => { fixture.aborted.push(request); }, { once: true });
      const encoder = new TextEncoder();
      let closed = false;
      let update: ((event: Event) => void) | undefined;
      /** Releases this request's fixture listener. */
      const cleanup = (): void => {
        closed = true;
        if (update) window.removeEventListener("ask-fixture-reply", update);
      };
      const stream = new ReadableStream<Uint8Array>({
        /** Opens a valid SSE response and accepts matching synthetic updates.
         * @param controller - Stream controller for this request.
         */
        start(controller) {
          controller.enqueue(encoder.encode('event: metadata\ndata: {"mode":"live"}\n\n'));
          update = (event: Event): void => {
            if (closed) return;
            const reply = (event as CustomEvent<Reply>).detail;
            if ((reply.request ?? fixture.requests.length - 1) !== request) return;
            if (reply.text) controller.enqueue(encoder.encode(`event: delta\ndata: ${JSON.stringify({ text: reply.text })}\n\n`));
            if (reply.error) controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: reply.error })}\n\n`));
            if (reply.done) {
              controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ sources: [], followUps: reply.followUps ?? [] })}\n\n`));
            }
            if (reply.done || reply.error) {
              cleanup();
              controller.close();
            }
          };
          window.addEventListener("ask-fixture-reply", update);
        },
        /** Removes fixture state when the browser cancels the reader. */
        cancel() { cleanup(); },
      });
      return Promise.resolve(new Response(stream, { headers: { "Content-Type": "text/event-stream" } }));
    };
  });
}

/** Emits one controlled transport update.
 * @param page - Page owning the fixture.
 * @param reply - Synthetic stream update.
 */
async function emit(page: Page, reply: Reply): Promise<void> {
  await page.evaluate((detail) => {
    window.dispatchEvent(new CustomEvent("ask-fixture-reply", { detail }));
  }, reply);
}

/** Reads browser-visible transport evidence.
 * @param page - Page owning the fixture.
 * @returns Captured requests and cancellations.
 */
async function transport(page: Page): Promise<AskFixtureWindow["askFixture"]> {
  return page.evaluate(() => (window as unknown as AskFixtureWindow).askFixture);
}

/** Waits for the supported mobile entry point.
 * @param page - Active portfolio page.
 * @returns Stable launcher used for focus restoration checks.
 */
async function readyEntry(page: Page): Promise<Locator> {
  await expect(page.locator('[data-conversation-shell][data-capability="supported"]')).toBeAttached();
  await expect(page.locator('[data-slot="opening-splash"]')).toHaveCount(0);
  const launcher = page.locator("button[data-launcher]");
  const input = page.getByRole("textbox", { name: "Your question" });
  await expect.poll(async () => await input.isVisible() || await launcher.isVisible()).toBe(true);
  return launcher;
}

/** Sends one synthetic question and waits for its transport request.
 * @param page - Active portfolio page.
 * @param question - Synthetic question text.
 * @returns Visible native modal.
 */
async function send(page: Page, question: string): Promise<Locator> {
  const before = (await transport(page)).requests.length;
  const input = page.getByRole("textbox", { name: "Your question" });
  if (!await input.isVisible()) await (await readyEntry(page)).click();
  await input.fill(question);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "About my work" });
  await expect(dialog).toBeVisible();
  await expect.poll(async () => (await transport(page)).requests.length).toBe(before + 1);
  return dialog;
}

/** Reads required rendered geometry.
 * @param locator - Element that must have a rendered box.
 * @returns Viewport-relative bounds.
 */
async function box(locator: Locator): Promise<NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>> {
  const bounds = await locator.boundingBox();
  if (!bounds) throw new Error("Expected rendered conversation geometry.");
  return bounds;
}

test.describe("mobile conversation smoke", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      sessionStorage.setItem("portfolio-opening-splash-seen", "true");
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          /** Accepts synthetic clipboard writes from the conversation action.
           * @param _value - Clipboard text supplied by the action.
           * @returns Resolved clipboard operation.
           */
          writeText: (_value: string) => Promise.resolve(),
        },
      });
    });
    await installTransport(page);
    await page.goto("/");
    await readyEntry(page);
  });

  test("@webkit mobile modal contains focus and restores the retained thread", async ({ page }) => {
    const launcher = page.locator("button[data-launcher]");
    const dialog = await send(page, "Synthetic mobile question");
    expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
    const input = page.getByRole("textbox", { name: "Your question" });

    for (const key of ["Tab", "Shift+Tab"]) {
      await input.focus();
      await page.keyboard.press(key);
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    }
    await emit(page, { done: true, text: "Synthetic retained answer." });
    await input.fill("Synthetic retained draft");
    await page.keyboard.press("Escape");

    await expect(dialog).toBeHidden();
    await expect(launcher).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.style.overflow)).not.toBe("hidden");
    await launcher.click();
    await expect(dialog).toBeVisible();
    await expect(input).toHaveValue("Synthetic retained draft");
    await expect(page.locator("[data-answer]")).toHaveText("Synthetic retained answer.");
  });

  test("@webkit visual viewport resize keeps one usable composer inside the mobile surface", async ({ page }) => {
    await page.addInitScript(() => {
      const viewport = new EventTarget();
      Object.assign(viewport, { height: 844, offsetLeft: 0, offsetTop: 0, pageLeft: 0, pageTop: 0, scale: 1, width: 390 });
      Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
      window.addEventListener("ask-fixture-viewport", (event) => {
        Object.assign(viewport, (event as CustomEvent<{ height: number }>).detail);
        viewport.dispatchEvent(new Event("resize"));
      });
    });
    await page.reload();
    await readyEntry(page);
    const dialog = await send(page, "Synthetic resize question");
    await emit(page, { done: true, text: "Synthetic resize answer." });
    const input = page.getByRole("textbox", { name: "Your question" });
    await input.focus();

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("ask-fixture-viewport", { detail: { height: 400 } }));
    });
    await expect(page.locator("[data-conversation-composer]:visible")).toHaveCount(1);
    await expect(input).toBeEditable();
    const surface = await box(dialog);
    const history = await box(page.locator("[data-conversation-history]"));
    const composer = await box(page.locator("[data-conversation-composer]"));
    expect(surface.y).toBeGreaterThanOrEqual(0);
    expect(surface.y + surface.height).toBeLessThanOrEqual(401);
    expect(composer.y + composer.height).toBeLessThanOrEqual(surface.y + surface.height + 1);
    expect(history.y + history.height).toBeLessThanOrEqual(composer.y + 1);

    await input.fill("Synthetic post-resize question");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(async () => (await transport(page)).requests.length).toBe(2);
  });

  test("@webkit mobile retry footer recovers before cancellation rejects stale chunks", async ({ page }) => {
    const dialog = await send(page, "Synthetic mobile retry question");
    await emit(page, { error: "Synthetic mobile failure." });

    const retry = page.getByRole("button", { name: "Retry message", exact: true });
    await expect(retry).toBeVisible();
    await retry.click();
    await expect.poll(async () => (await transport(page)).requests.length).toBe(2);
    await expect(page.locator("[data-turn]")).toHaveCount(1);
    await emit(page, {
      done: true,
      followUps: [{ label: "Continue", question: "Synthetic mobile follow-up" }],
      request: 1,
      text: "Synthetic mobile recovered answer.",
    });
    await expect(page.locator("[data-answer]")).toHaveText("Synthetic mobile recovered answer.");
    const copy = page.getByRole("button", { name: "Copy reply", exact: true });
    await expect(copy).toBeVisible();
    await copy.click();
    await expect(page.getByRole("button", { name: "Copied", exact: true })).toBeVisible();
    await expect(copy).toBeVisible();
    await copy.click();
    await expect(page.getByRole("button", { name: "Copied", exact: true })).toBeVisible();
    await expect(page.locator('[data-mobile-suggestions]').getByRole("button", { name: "Continue" })).toBeVisible();

    const input = page.getByRole("textbox", { name: "Your question" });
    await input.fill("Synthetic mobile cancellation");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(async () => (await transport(page)).requests.length).toBe(3);
    await emit(page, { request: 2, text: "Synthetic mobile partial." });
    await page.getByRole("textbox", { name: "Your question" }).focus();
    await page.getByRole("button", { name: "Close conversation" }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(async () => (await transport(page)).aborted).toEqual([2]);

    await emit(page, { done: true, request: 2, text: "Rejected mobile stale answer." });
    await page.locator("button[data-launcher]").click();
    await expect(dialog).toBeVisible();
    await expect(page.locator("[data-answer]").filter({ hasText: "Rejected mobile stale answer." })).toHaveCount(0);
    await page.getByRole("button", { name: "New chat" }).click();

    await send(page, "Synthetic mobile fresh question");
    await emit(page, { done: true, request: 3, text: "Synthetic mobile fresh answer." });
    await expect(page.locator("[data-answer]")).toHaveText("Synthetic mobile fresh answer.");
    expect((await transport(page)).requests).toHaveLength(4);
  });
});
