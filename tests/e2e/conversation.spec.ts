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

/** Pauses the first document-timeline animation inside the desktop surface.
 * @param page - Page containing the conversation surface.
 */
async function pauseSurfaceMotion(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let frame = 0; frame < 10; frame += 1) {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve(); }); });
      const surface = document.querySelector<HTMLElement>('[data-chat-surface][data-mobile="false"]');
      const animations = surface?.getAnimations({ subtree: true }).filter(({ timeline }) => timeline === document.timeline) ?? [];
      if (animations.length === 0) continue;
      for (const animation of animations) animation.pause();
      return;
    }
    throw new Error("Expected desktop surface motion to start within ten animation frames.");
  });
}

/** Verifies that panel motion never changes the panel frame's dimensions.
 * @param surface - Animated desktop surface.
 */
async function expectFrameGeometryStable(surface: Locator): Promise<void> {
  const geometryKeyframes = await surface.locator("[data-chat-frame]").evaluate((element) =>
    element.getAnimations().flatMap(({ effect }) => effect instanceof KeyframeEffect ? effect.getKeyframes() : [])
      .filter((keyframe) => keyframe.width !== undefined || keyframe.height !== undefined));
  expect(geometryKeyframes).toHaveLength(0);
}

/** Triggers and samples the desktop panel midway through its surface motion.
 * @param control - Control that starts opening or closing the desktop surface.
 * @returns Current frame clip and opacity.
 */
async function triggerAndSampleSurfaceMotion(control: Locator): Promise<{ clipPath: string; opacity: number }> {
  return control.evaluate(async (element) => {
    (element as HTMLElement).click();
    for (let frame = 0; frame < 10; frame += 1) {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve(); }); });
      const target = document.querySelector<HTMLElement>('[data-chat-surface][data-mobile="false"] [data-chat-frame]');
      const animations = target?.getAnimations() ?? [];
      const animation = animations.find(({ effect }) =>
        effect instanceof KeyframeEffect && effect.getKeyframes().some((keyframe) => keyframe.clipPath !== undefined));
      if (!target || !animation?.effect) continue;
      const owner = target.parentElement;
      if (!owner) throw new Error("Expected the frame to belong to a surface.");
      for (const current of owner.getAnimations({ subtree: true })) {
        if (current.timeline !== document.timeline) continue;
        const duration = Number(current.effect?.getTiming().duration);
        if (!Number.isFinite(duration)) continue;
        current.pause();
        current.currentTime = Number(animation.effect.getTiming().duration) * 0.45;
      }
      const style = getComputedStyle(target);
      return { clipPath: style.clipPath, opacity: Number.parseFloat(style.opacity) };
    }
    throw new Error("Expected desktop opening motion to start within ten animation frames.");
  });
}

/** Triggers an interrupted desktop close and reads its first frame without a protocol delay.
 * @param control - Close control inside the opening desktop surface.
 * @returns Closing frame's initial clip and opacity.
 */
async function triggerAndSampleClosingStart(control: Locator): Promise<{ clipPath: string; opacity: number }> {
  return control.evaluate(async (element) => {
    (element as HTMLElement).click();
    for (let frame = 0; frame < 10; frame += 1) {
      const surface = document.querySelector<HTMLElement>('[data-chat-surface][data-mobile="false"][data-closing="true"]');
      const target = surface?.querySelector<HTMLElement>("[data-chat-frame]");
      const animation = target?.getAnimations().find(({ effect }) =>
        effect instanceof KeyframeEffect && effect.getKeyframes().some((keyframe) => keyframe.clipPath !== undefined));
      if (target && animation?.effect instanceof KeyframeEffect) {
        for (const current of target.getAnimations()) {
          current.pause();
          current.currentTime = 0;
        }
        const style = getComputedStyle(target);
        return { clipPath: style.clipPath, opacity: Number.parseFloat(style.opacity) };
      }
      await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve(); }); });
    }
    throw new Error("Expected an active desktop closing frame animation.");
  });
}

/** Captures the entry fade as soon as hover starts its opacity transition.
 * @param fade - Decorative entry fade beside the expanding composer.
 * @returns Mid-transition opacity.
 */
async function sampleEntryFade(fade: Locator): Promise<number> {
  return fade.evaluate(async (element) => {
    for (let frame = 0; frame < 10; frame += 1) {
      const animation = element.getAnimations().find(({ effect }) =>
        effect instanceof KeyframeEffect && effect.getKeyframes().some((keyframe) => keyframe.opacity !== undefined));
      if (animation?.effect instanceof KeyframeEffect) {
        animation.pause();
        animation.currentTime = Number(animation.effect.getTiming().duration) / 2;
        return Number.parseFloat(getComputedStyle(element).opacity);
      }
      await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve(); }); });
    }
    throw new Error("Expected an active entry fade transition.");
  });
}

/** Compares computed clip polygons while tolerating engine rounding.
 * @param actual - Closing clip polygon.
 * @param expected - Interrupted opening clip polygon.
 */
function expectClipPathClose(actual: string, expected: string): void {
  /** Extracts numeric polygon coordinates for tolerant comparisons.
   * @param value - Computed clip-path value.
   * @returns Coordinates in their original order.
   */
  const values = (value: string) => Array.from(value.matchAll(/-?\d+(?:\.\d+)?/g), ([match]) => Number(match));
  const actualValues = values(actual);
  const expectedValues = values(expected);
  expect(actualValues).toHaveLength(expectedValues.length);
  actualValues.forEach((value, index) => { expect(value).toBeCloseTo(expectedValues[index] ?? Number.NaN, 4); });
}

/** Samples actual field-surface resizing while its controls fade independently.
 * @param field - Entry wrapper whose surface should be transitioning.
 * @returns Mid-transition paint and control geometry.
 */
async function sampleEntryResize(field: Locator) {
  return field.evaluate(async (element) => {
    const paint = element.querySelector<HTMLElement>("[data-composer-surface]");
    const controls = element.querySelector<HTMLElement>("[data-composer-content]");
    if (!paint || !controls) throw new Error("Expected separate field paint and controls.");
    for (let frame = 0; frame < 10; frame += 1) {
      const animation = paint.getAnimations().find(({ effect }) =>
        effect instanceof KeyframeEffect && effect.getKeyframes().some((keyframe) => keyframe.width !== undefined));
      if (animation?.effect) {
        for (const current of element.getAnimations({ subtree: true })) {
          current.pause();
          current.currentTime = Number(animation.effect.getTiming().duration) / 2;
        }
        return { width: paint.getBoundingClientRect().width, height: paint.getBoundingClientRect().height,
          fullWidth: element.getBoundingClientRect().width, fullHeight: element.getBoundingClientRect().height,
          clip: getComputedStyle(element).clipPath, controlsWidth: controls.getBoundingClientRect().width, controlsOpacity: Number(getComputedStyle(controls).opacity),
          accent: getComputedStyle(paint.firstElementChild ?? paint).opacity };
      }
      await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve(); }); });
    }
    throw new Error("Expected an active field width transition.");
  });
}

/** Completes document-timeline animations owned by one surface morph.
 * @param surface - Surface containing morph-owned layers.
 */
async function finishMorph(surface: Locator): Promise<void> {
  await surface.evaluate((element) => {
    for (const animation of element.getAnimations({ subtree: true })) {
      if (animation.timeline === document.timeline && Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish();
    }
  });
}

/** Records whether the resting jade line is painted at the native closing handoff.
 * @param surface - Closing host whose temporary line is about to be removed.
 */
async function trackLineHandoff(surface: Locator): Promise<void> {
  await surface.evaluate((element) => {
    const observer = new MutationObserver(() => {
      if (element.hasAttribute("data-closing")) return;
      const stroke = element.closest("[data-conversation-shell]")?.querySelector<HTMLElement>("[data-entry-stroke]");
      (element as HTMLElement & { handoffLineVisible?: boolean }).handoffLineVisible = Boolean(stroke && getComputedStyle(stroke).visibility === "visible" && getComputedStyle(stroke).opacity === "1");
      observer.disconnect();
    });
    observer.observe(element, { attributes: true, attributeFilter: ["data-closing"] });
  });
}

/** Verifies that the resting launcher line uses the configured jade brand gradient.
 * @param stroke - Visible launcher line.
 */
async function expectJadeLine(stroke: Locator): Promise<void> {
  const colors = await stroke.evaluate((element) => {
    const probe = document.createElement("span");
    probe.style.backgroundImage = "var(--brand-accent-text-gradient)";
    document.body.append(probe);
    const expected = getComputedStyle(probe).backgroundImage;
    probe.remove();
    return { actual: getComputedStyle(element).backgroundImage, expected };
  });
  expect(colors.actual).toBe(colors.expected);
  expect(colors.actual).not.toBe("none");
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

  test("@webkit desktop entry reveals on hover or page end without reacting to upward scroll", async ({ page }) => {
    const entry = page.locator("[data-edge-entry]");
    const input = page.getByRole("textbox", { name: "Your question" });

    await page.mouse.move(8, 8);
    await expect(input).toBeHidden();
    await page.evaluate(() => {
      const maximum = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo({ behavior: "instant", top: Math.min(1_200, Math.max(0, maximum - 300)) });
    });
    await page.evaluate(() => { window.scrollBy({ behavior: "instant", top: -160 }); });
    await expect(input).toBeHidden();

    await entry.hover();
    await expect(input).toBeVisible();
    await page.mouse.move(8, 8);
    await expect(input).toBeHidden();

    await page.evaluate(() => { window.scrollTo({ behavior: "instant", top: document.documentElement.scrollHeight }); });
    await expect(input).toBeVisible();
    const footerContent = await box(page.locator("footer > :last-child"));
    const entryField = await box(page.locator('[data-edge-entry] [data-slot="input-group"]'));
    expect(entryField.y - (footerContent.y + footerContent.height)).toBeGreaterThanOrEqual(8);
  });

  test("@webkit desktop hover morph keeps one jade shape through reveal and hide", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.reload();
    await readyComposer(page);
    await page.mouse.move(8, 8);

    const entry = page.locator("[data-edge-entry]");
    const field = entry.locator("[data-conversation-composer]").locator("..");
    const fade = entry.locator("[data-entry-fade]");
    await expect(page.getByRole("textbox", { name: "Your question" })).toBeHidden();
    await entry.hover();
    const fadeOpacity = await sampleEntryFade(fade);
    const revealSample = await sampleEntryResize(field);
    expect(revealSample.clip).toBe("none");
    expect(revealSample.width).toBeGreaterThan(120);
    expect(revealSample.width).toBeLessThan(revealSample.fullWidth);
    expect(revealSample.height).toBeGreaterThan(5);
    expect(revealSample.height).toBeLessThan(revealSample.fullHeight);
    expect(revealSample.controlsWidth).toBeGreaterThan(revealSample.width);
    expect(revealSample.controlsOpacity).toBe(0);
    const lateFade = await field.evaluate((element) => {
      for (const animation of element.getAnimations({ subtree: true })) animation.currentTime = 320;
      const controls = element.querySelector("[data-composer-content]");
      if (!controls) throw new Error("Expected fading controls.");
      return Number(getComputedStyle(controls).opacity);
    });
    expect(lateFade).toBeGreaterThan(0);
    expect(lateFade).toBeLessThan(1);
    expect(await entry.locator("[data-entry-stroke]").evaluate((element) => getComputedStyle(element).opacity)).toBe("0");
    const jadeOpacity = Number(revealSample.accent);
    expect(jadeOpacity).toBe(0);

    expect(fadeOpacity).toBeGreaterThan(0);
    expect(fadeOpacity).toBeLessThan(1);

    await finishMorph(entry);
    await page.mouse.move(8, 8);
    const hideSample = await sampleEntryResize(field);
    expect(hideSample.accent).toBe("0");
    expect(hideSample.controlsOpacity).toBe(0);
    expect(hideSample.clip).toBe("none");
    expect(hideSample.width).toBeGreaterThan(120);
    expect(hideSample.width).toBeLessThan(hideSample.fullWidth);
    expect(await entry.locator("[data-entry-stroke]").evaluate((element) => getComputedStyle(element).opacity)).toBe("0");
    await finishMorph(entry);
    await expect(field).toBeHidden();
    await expect(entry.locator("[data-entry-stroke]")).toHaveCSS("opacity", "1");
  });

  test("desktop hover reveal honors reduced motion", async ({ page }) => {
    const entry = page.locator("[data-edge-entry]");
    const field = entry.locator("[data-conversation-composer]").locator("..");
    const fade = entry.locator("[data-entry-fade]");
    await page.mouse.move(8, 8);
    await entry.hover();

    await expect(field).toHaveCSS("transition-duration", "0s");
    await expect(fade).toHaveCSS("transition-duration", "0s");
    await expect(field).toHaveCSS("visibility", "visible");
    await expect(fade).toHaveCSS("opacity", "1");
    const strokeBounds = await box(entry.locator("[data-entry-stroke]"));
    const fieldBounds = await box(entry.locator('[data-slot="input-group"]'));
    expect(strokeBounds.y + strokeBounds.height - fieldBounds.y - fieldBounds.height).toBeCloseTo(8, 0);
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
    const projects = page.locator("#projects");
    await projects.evaluate((element) => { element.scrollIntoView({ behavior: "instant", block: "start" }); });
    await expect.poll(() => projects.evaluate((element) => {
      const headerBottom = document.querySelector<HTMLElement>('[data-slot="site-header"]')?.getBoundingClientRect().bottom ?? 0;
      return element.getBoundingClientRect().top <= headerBottom + 1;
    })).toBe(true);
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
    await expect(dialog).toBeHidden();
    await expect(page.locator("[data-turn]")).toHaveCount(0);

    await readyComposer(page);
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

  test("@webkit desktop send moves the revealed field into the appearing panel", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.reload();
    await readyComposer(page);
    const entryField = page.locator("[data-edge-entry] [data-conversation-composer]").locator("..");
    const entryComposer = page.locator('[data-edge-entry] [data-slot="input-group"]');
    await expect.poll(async () => entryField.evaluate((element) => element.getAnimations().length)).toBe(0);
    await page.getByRole("textbox", { name: "Your question" }).fill("Synthetic moving composer question");
    await expect.poll(async () => entryField.evaluate((element) => element.getAnimations().length)).toBe(0);
    const before = await box(entryComposer);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await pauseSurfaceMotion(page);

    const surface = page.locator('[data-chat-surface][data-mobile="false"]');
    const surfaceComposer = surface.locator('[data-conversation-composer] [data-slot="input-group"]');
    const motion = await surfaceComposer.evaluate((element) => {
      const animation = element.getAnimations().find(({ effect }) =>
        effect instanceof KeyframeEffect && effect.getKeyframes().some((keyframe) => keyframe.transform !== undefined));
      if (!(animation?.effect instanceof KeyframeEffect)) throw new Error("Expected composer transfer motion.");
      const keyframes = animation.effect.getKeyframes();
      const duration = Number(animation.effect.getTiming().duration);
      animation.currentTime = 0;
      const start = element.getBoundingClientRect();
      animation.currentTime = duration / 2;
      const middle = element.getBoundingClientRect();
      animation.currentTime = duration;
      const end = element.getBoundingClientRect();
      return {
        keyframes,
        start: { bottom: start.bottom, left: start.left, width: start.width, height: start.height },
        middle: { bottom: middle.bottom, width: middle.width },
        end: { bottom: end.bottom, left: end.left, width: end.width, height: end.height },
      };
    });
    const geometry = JSON.stringify({ before, motion, viewport: page.viewportSize() });
    expect(motion.start.left, geometry).toBeCloseTo(before.x, 0);
    expect(motion.start.bottom, geometry).toBeCloseTo(before.y + before.height, 0);
    expect(motion.end.bottom, geometry).toBeLessThan(motion.start.bottom - 20);
    expect(motion.end.bottom, geometry).toBeGreaterThan(motion.start.bottom - 40);
    expect(motion.middle.bottom, geometry).toBeGreaterThan(motion.end.bottom);
    expect(motion.middle.bottom, geometry).toBeLessThan(motion.start.bottom);
    expect(motion.start.width, geometry).toBeCloseTo(motion.end.width, 0);
    expect(motion.middle.width, geometry).toBeCloseTo(motion.end.width, 0);
    expect(motion.start.height, geometry).toBeCloseTo(motion.end.height, 0);
    expect(motion.keyframes.some((keyframe) => keyframe.height !== undefined || keyframe.width !== undefined || keyframe.scale !== undefined), geometry).toBe(false);
    expect(await surface.locator("[data-chat-morph-line]").evaluate((element) => element.getAnimations().length)).toBe(0);
    await expectFrameGeometryStable(surface);
    await finishMorph(surface);
    await expect.poll(async () => surfaceComposer.evaluate((element) => element.getAnimations().length)).toBe(0);
    const after = await box(surfaceComposer);
    expect(after.y + after.height, geometry).toBeCloseTo(motion.end.bottom, 0);
  });

  test("desktop open surface hides the launcher line", async ({ page }) => {
    await send(page, "Synthetic line visibility question");
    await expect(page.locator("[data-entry-stroke]")).toBeHidden();
  });

  test("@webkit desktop Close at the page end restores the line until a new page-end visit", async ({ page }) => {
    const entry = page.locator("[data-edge-entry]");
    const input = page.getByRole("textbox", { name: "Your question" });
    await page.evaluate(() => { window.scrollTo({ behavior: "instant", top: document.documentElement.scrollHeight }); });
    await expect(input).toBeVisible();
    const dialog = await send(page, "Synthetic page-end close question");
    await emit(page, { done: true, text: "Synthetic page-end close answer." });

    await page.getByRole("button", { name: "Close conversation" }).click();
    await expect(dialog).toBeHidden();
    await expect(entry).toHaveAttribute("data-entry-revealed", "false");
    await expect(page.locator("[data-entry-stroke]")).toBeVisible();

    await page.evaluate(() => { window.scrollTo({ behavior: "instant", top: 0 }); });
    await expect.poll(async () => page.evaluate(() => window.scrollY)).toBe(0);
    await page.evaluate(() => new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve(); }); }));
    await page.evaluate(() => { window.scrollTo({ behavior: "instant", top: document.documentElement.scrollHeight }); });
    await expect(entry).toHaveAttribute("data-entry-revealed", "true");
    await expect(entry.locator("[data-reopen-field]")).toBeVisible();
  });

  test("desktop Close during opening continues from the current panel frame", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.reload();
    await readyComposer(page);
    await page.getByRole("textbox", { name: "Your question" }).fill("Synthetic interrupted desktop opening");
    const opening = await triggerAndSampleSurfaceMotion(page.getByRole("button", { name: "Send", exact: true }));
    const surface = page.locator('[data-chat-surface][data-mobile="false"]');
    await expect(surface).toHaveAttribute("data-morph", "opening");

    const closing = await triggerAndSampleClosingStart(page.getByRole("button", { name: "Close conversation" }));
    await expect(surface).toHaveAttribute("data-closing", "true");
    expectClipPathClose(closing.clipPath, opening.clipPath);
    expect(closing.opacity).toBeCloseTo(opening.opacity, 3);

    await trackLineHandoff(surface);
    await finishMorph(surface);
    await expect(surface).toBeHidden();
    expect(await surface.evaluate((element) => (element as HTMLElement & { handoffLineVisible?: boolean }).handoffLineVisible)).toBe(true);
    const stroke = page.locator("[data-entry-stroke]");
    await expect(stroke).toBeVisible();
    await expectJadeLine(stroke);
  });

  test("@webkit desktop New chat closes the surface and keeps the entry field active", async ({ page }) => {
    const flushWarnings: string[] = [];
    page.on("console", (message) => { if (message.text().includes("flushSync")) flushWarnings.push(message.text()); });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.reload();
    await readyComposer(page);
    const dialog = await send(page, "Synthetic reset-to-field question");
    const answer = "Synthetic completed reply with enough detail to grow the reading surface. ".repeat(32).trim();
    await emit(page, { done: true, text: answer, followUps: [{ label: "Continue", question: "Synthetic continuation question?" }] });
    await expect(dialog.getByText(answer, { exact: true })).toBeVisible();
    await finishMorph(dialog);
    await expect(dialog).not.toHaveAttribute("data-morph", "opening");
    await triggerAndSampleSurfaceMotion(page.getByRole("button", { name: "Start over" }));
    const surface = page.locator('[data-chat-surface][data-mobile="false"]');
    await expect(surface.locator("[data-chat-frame]")).toHaveCSS("background-image", "none");
    await expect(surface.locator("[data-chat-frame-fill]")).toHaveCSS("border-top-width", "1px");
    await expect(surface.locator('[data-conversation-composer] [data-slot="input-group"]')).toHaveCSS("opacity", "1");
    await expect(surface.locator("[data-chat-morph-line]")).toHaveCSS("opacity", "0");
    await surface.evaluate((element) => {
      const shell = element.closest("[data-conversation-shell]");
      if (!shell) throw new Error("Expected the closing surface to belong to the shell.");
      const observer = new MutationObserver(() => {
        if (element.hasAttribute("data-closing")) return;
        const input = shell.querySelector<HTMLElement>('[data-edge-entry] textarea');
        const visible = input && input.getBoundingClientRect().width > 0 && getComputedStyle(input).visibility === "visible" && getComputedStyle(input).opacity === "1";
        shell.setAttribute("data-field-handoff-visible", String(Boolean(visible)));
        observer.disconnect();
      });
      observer.observe(element, { attributes: true, attributeFilter: ["data-closing"] });
    });
    const finalPaint = await surface.evaluate((element) => {
      const animations = element.getAnimations({ subtree: true }).filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime));
      const end = Math.max(...animations.map((animation) => Number(animation.effect?.getComputedTiming().endTime)));
      for (const animation of animations) { animation.pause(); animation.currentTime = end - 0.01; }
      const paint = element.querySelector("[data-composer-surface]");
      if (!paint) throw new Error("Expected outgoing field paint.");
      return paint.getBoundingClientRect().toJSON() as { x: number; y: number; width: number; height: number };
    });
    await finishMorph(surface);
    await expect(page.locator("[data-conversation-shell]")).toHaveAttribute("data-field-handoff-visible", "true");
    const replacement = await box(page.locator("[data-edge-entry] [data-composer-surface]"));
    for (const dimension of ["x", "y", "width", "height"] as const) expect(finalPaint[dimension], dimension).toBeCloseTo(replacement[dimension], 0);

    await expect(dialog).toBeHidden();
    await expect(page.locator("[data-turn]")).toHaveCount(0);
    await expect(page.locator("[data-edge-entry]")).toHaveAttribute("data-entry-revealed", "true");
    await expect(page.getByRole("textbox", { name: "Your question" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Your question" })).toBeFocused();
    await expect(page.getByRole("textbox", { name: "Your question" })).toHaveValue("");
    await expect(page.locator("[data-entry-stroke]")).toHaveCSS("opacity", "0");
    expect(flushWarnings).toEqual([]);
  });

  test("@webkit desktop Close keeps the panel frame stable while restoring the line", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.reload();
    await readyComposer(page);
    const dialog = await send(page, "Synthetic closing motion question");
    await emit(page, { done: true, text: "Synthetic closing motion answer." });
    await expect(dialog).not.toHaveAttribute("data-morph", "opening");

    const surface = page.locator('[data-chat-surface][data-mobile="false"]');
    await triggerAndSampleSurfaceMotion(page.getByRole("button", { name: "Close conversation" }));
    await expect(surface).toHaveAttribute("data-closing", "true");
    await expectFrameGeometryStable(surface);
    const horizontalTravel = await surface.locator('[data-conversation-composer] [data-slot="input-group"]').evaluate((element) => {
      const transforms = element.getAnimations().flatMap(({ effect }) => effect instanceof KeyframeEffect ? effect.getKeyframes() : [])
        .flatMap((frame) => typeof frame.transform === "string" ? [new DOMMatrix(frame.transform).m41] : []);
      if (transforms.length === 0) throw new Error("Expected composer closing transforms.");
      return Math.max(...transforms.map(Math.abs));
    });
    expect(horizontalTravel).toBeLessThan(1);
    await trackLineHandoff(surface);
    await finishMorph(surface);
    await expect(surface).toBeHidden();
    expect(await surface.evaluate((element) => (element as HTMLElement & { handoffLineVisible?: boolean }).handoffLineVisible)).toBe(true);
    const stroke = page.locator("[data-entry-stroke]");
    await expect(stroke).toBeVisible();
    await expectJadeLine(stroke);
    await expect(page.locator("[data-edge-entry]")).toHaveAttribute("data-entry-revealed", "false");
    await expect(stroke).toHaveCSS("opacity", "1");
    await page.mouse.move(8, 8);
    await page.locator("[data-edge-entry]").hover();
    await expect(page.locator("[data-edge-entry]")).toHaveAttribute("data-entry-revealed", "true");
  });
});
