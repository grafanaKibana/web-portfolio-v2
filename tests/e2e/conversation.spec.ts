import { expect, test, type Locator, type Page } from "@playwright/test";

type AskRequest = {
  context?: { pathname?: string; sectionId?: string };
  messages?: Array<{ content?: string; role?: string }>;
};

type Source = { href: string; id: string; title: string };
type Reply = {
  done?: boolean;
  error?: string;
  followUps?: Array<{ label: string; question: string }>;
  request?: number;
  sources?: Source[];
  text?: string;
};

type AskFixtureWindow = Window & {
  askFixture: { aborted: number[]; requests: AskRequest[] };
};

/** Installs deterministic event-driven Ask streams and transport accounting.
 * @param page - Browser page receiving the fixture.
 */
async function installTransport(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const fixture = { aborted: [] as number[], requests: [] as AskRequest[] };
    (window as unknown as AskFixtureWindow).askFixture = fixture;
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.endsWith("/api/ask")) return originalFetch(input, init);
      const request = fixture.requests.push(JSON.parse(typeof init?.body === "string" ? init.body : "{}") as AskRequest) - 1;
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
            if (reply.done) controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ sources: reply.sources ?? [], followUps: reply.followUps ?? [] })}\n\n`));
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

/** Reveals the desktop composer without opening a conversation.
 * @param page - Active portfolio page.
 * @returns Stable launcher used for focus restoration checks.
 */
async function readyComposer(page: Page): Promise<Locator> {
  await expect(page.locator('[data-conversation-shell][data-capability="supported"]')).toBeAttached();
  await expect(page.locator('[data-slot="opening-splash"]')).toHaveCount(0);
  const launcher = page.locator("button[data-launcher]");
  const input = page.getByRole("textbox", { name: "Your question" });
  await expect.poll(async () => await input.isVisible() || await launcher.isVisible()).toBe(true);
  if (!await input.isVisible()) await launcher.hover();
  await expect(input).toBeVisible();
  return launcher;
}

/** Sends one synthetic question and waits for its transport request.
 * @param page - Active portfolio page.
 * @param question - Synthetic question text.
 * @returns Visible named conversation surface.
 */
async function send(page: Page, question: string): Promise<Locator> {
  const before = (await transport(page)).requests.length;
  await page.getByRole("textbox", { name: "Your question" }).fill(question);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "About my work" });
  await expect(dialog).toBeVisible();
  await expect.poll(async () => (await transport(page)).requests.length).toBe(before + 1);
  return dialog;
}

/** Reveals a message action through its owning message.
 * @param action - Action inside a message reaction group.
 */
async function revealAction(action: Locator): Promise<void> {
  await action.locator('xpath=ancestor::*[@data-slot="bubble"][1]').locator('[data-slot="bubble-content"]').hover();
  await expect(action).toBeVisible();
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

test.describe("conversation smoke", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      sessionStorage.setItem("portfolio-opening-splash-seen", "true");
    });
    await installTransport(page);
    await page.goto("/");
    await readyComposer(page);
  });

  test("@webkit primary stream moves from pending through completion and remains usable", async ({ page }) => {
    await send(page, "Synthetic primary question");
    await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
    await expect(page.locator("[data-turn]")).toHaveCount(1);
    await expect(page.locator("[data-answer]")).toHaveCount(0);

    await emit(page, { text: "Synthetic partial answer. " });
    await expect(page.locator("[data-answer]")).toContainText("Synthetic partial answer.");
    await emit(page, { done: true, text: "Synthetic completion." });

    await expect(page.locator("[data-answer]")).toContainText("Synthetic completion.");
    await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeVisible();
    expect((await transport(page)).requests).toHaveLength(1);
  });

  test("follow-up prefills focus and the next request carries context and completed history", async ({ page }) => {
    await page.locator("#projects").scrollIntoViewIfNeeded();
    await send(page, "Synthetic context question");
    await emit(page, {
      done: true,
      followUps: [{ label: "Continue", question: "Synthetic follow-up question" }],
      text: "Synthetic contextual answer.",
    });

    const followUp = page.getByRole("button", { name: "Continue" });
    await page.locator("[data-answer]").hover();
    await followUp.click();
    const input = page.getByRole("textbox", { name: "Your question" });
    await expect(input).toHaveValue("Synthetic follow-up question");
    await expect(input).toBeFocused();
    expect((await transport(page)).requests).toHaveLength(1);

    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(async () => (await transport(page)).requests.length).toBe(2);
    const second = (await transport(page)).requests[1];
    expect(second?.context).toMatchObject({ pathname: "/", sectionId: "projects" });
    expect(second?.messages).toEqual([
      { content: "Synthetic context question", role: "user" },
      { content: "Synthetic contextual answer.", role: "assistant" },
      { content: "Synthetic follow-up question", role: "user" },
    ]);
  });

  test("failure recovery retries the same turn without duplicating its question", async ({ page }) => {
    await send(page, "Synthetic retry question");
    await emit(page, { error: "Synthetic controlled failure." });

    const retry = page.getByRole("button", { name: "Retry message", exact: true });
    await revealAction(retry);
    await retry.click();
    await expect.poll(async () => (await transport(page)).requests.length).toBe(2);
    await expect(page.locator("[data-turn]")).toHaveCount(1);
    await emit(page, { done: true, request: 1, text: "Synthetic recovered answer." });

    await expect(page.locator("[data-answer]")).toHaveText("Synthetic recovered answer.");
    await expect(page.locator("[data-user-message]")).toHaveText("Synthetic retry question");
    await expect(page.locator('[data-slot="bubble"][data-variant="destructive"]')).toHaveCount(0);
  });

  test("stop and reset reject stale chunks before a fresh request succeeds", async ({ page }) => {
    await send(page, "Synthetic cancellable question");
    await emit(page, { text: "Retained partial answer." });
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await expect.poll(async () => (await transport(page)).aborted).toEqual([0]);
    await expect(page.locator("[data-answer]")).toHaveText("Retained partial answer.");

    const retry = page.getByRole("button", { name: "Retry message", exact: true });
    await revealAction(retry);
    await retry.click();
    await expect.poll(async () => (await transport(page)).requests.length).toBe(2);
    await emit(page, { done: true, request: 0, text: "Rejected stale answer." });
    await expect(page.locator("[data-answer]").filter({ hasText: "Rejected stale answer." })).toHaveCount(0);

    await page.keyboard.press("Escape");
    const dialog = page.getByRole("dialog", { name: "About my work" });
    await expect(dialog).toBeHidden();
    await expect.poll(async () => (await transport(page)).aborted).toEqual([0, 1]);
    await emit(page, { done: true, request: 1, text: "Rejected reset answer." });
    await page.locator("button[data-launcher]").click();
    await expect(dialog).toBeVisible();
    await expect(page.locator("[data-answer]").filter({ hasText: "Rejected reset answer." })).toHaveCount(0);
    await page.getByRole("button", { name: "Start over" }).click();
    await expect(page.locator("[data-turn]")).toHaveCount(0);

    await send(page, "Synthetic fresh question");
    await emit(page, { done: true, request: 2, text: "Synthetic fresh answer." });
    await expect(page.locator("[data-answer]")).toHaveText("Synthetic fresh answer.");
  });

  test("validated citations stay safe while the desktop surface remains contained and focus-safe", async ({ page }) => {
    const launcher = page.locator("button[data-launcher]");
    const dialog = await send(page, "Synthetic source question");
    await emit(page, {
      done: true,
      sources: [{ href: "/#contact", id: "section:contact", title: "Synthetic source" }],
      text: "Validated evidence [1]. [Unsafe link](https://example.invalid/) ![Unsafe image](https://example.invalid/image.png)",
    });

    const answer = page.locator("[data-answer]");
    await expect(answer.getByRole("link", { name: "Source 1: Synthetic source" })).toHaveAttribute("href", "/#contact");
    await expect(answer.getByRole("link", { name: "Unsafe link" })).toHaveCount(0);
    await expect(answer.locator("img, iframe, script, video")).toHaveCount(0);

    const surface = await box(dialog);
    const history = await box(page.locator("[data-conversation-history]"));
    const composer = await box(page.locator("[data-conversation-composer]"));
    expect(history.x).toBeGreaterThanOrEqual(surface.x);
    expect(history.x + history.width).toBeLessThanOrEqual(surface.x + surface.width + 1);
    expect(composer.x).toBeGreaterThanOrEqual(surface.x);
    expect(composer.x + composer.width).toBeLessThanOrEqual(surface.x + surface.width + 1);
    expect(history.y + history.height).toBeLessThanOrEqual(composer.y + 1);

    await page.getByRole("textbox", { name: "Your question" }).focus();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(launcher).toBeFocused();
  });
});
