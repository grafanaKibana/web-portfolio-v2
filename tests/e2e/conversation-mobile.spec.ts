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

/** Pauses the first document-timeline animation inside the mobile surface.
 * @param page - Page containing the conversation surface.
 */
async function pauseSurfaceMotion(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let frame = 0; frame < 10; frame += 1) {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve(); }); });
      const surface = document.querySelector<HTMLElement>('[data-chat-surface][data-mobile="true"]');
      const animations = surface?.getAnimations({ subtree: true }).filter(({ timeline }) => timeline === document.timeline) ?? [];
      if (animations.length === 0) continue;
      for (const animation of animations) animation.pause();
      return;
    }
    throw new Error("Expected mobile surface motion to start within ten animation frames.");
  });
}

/** Verifies that panel motion never changes the panel frame's dimensions.
 * @param surface - Animated mobile surface.
 */
async function expectFrameGeometryStable(surface: Locator): Promise<void> {
  const geometryKeyframes = await surface.locator("[data-chat-frame]").evaluate((element) =>
    element.getAnimations().flatMap(({ effect }) => effect instanceof KeyframeEffect ? effect.getKeyframes() : [])
      .filter((keyframe) => keyframe.width !== undefined || keyframe.height !== undefined));
  expect(geometryKeyframes).toHaveLength(0);
}

/** Triggers and samples the mobile panel midway through its surface motion.
 * @param control - Control that starts opening or closing the mobile surface.
 * @returns Current frame clip and opacity.
 */
async function triggerAndSampleSurfaceMotion(control: Locator): Promise<{ clipPath: string; opacity: number }> {
  return control.evaluate(async (element) => {
    (element as HTMLElement).click();
    for (let frame = 0; frame < 10; frame += 1) {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve(); }); });
      const target = document.querySelector<HTMLElement>('[data-chat-surface][data-mobile="true"] [data-chat-frame]');
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
    throw new Error("Expected mobile opening motion to start within ten animation frames.");
  });
}

/** Confirms the mobile field continues settling after the thread's visible motion ends.
 * @param surface - Mobile host with paused surface animations.
 */
async function expectFieldFinishesAfterThread(surface: Locator): Promise<void> {
  const timing = await surface.evaluate((element) => {
    const endTime = (selector: string) => Math.max(...Array.from(element.querySelector(selector)?.getAnimations() ?? [], ({ effect }) => Number(effect?.getComputedTiming().endTime)));
    return { thread: endTime("[data-chat-frame]"), field: endTime('[data-conversation-composer] [data-slot="input-group"]') };
  });
  expect(timing.thread).toBeGreaterThanOrEqual(500);
  expect(timing.field - timing.thread).toBeGreaterThanOrEqual(100);
}

/** Reads the first frame of an interrupted mobile close animation.
 * @param surface - Closing mobile surface.
 * @returns Closing frame's initial clip and opacity.
 */
async function sampleClosingStart(surface: Locator): Promise<{ clipPath: string; opacity: number }> {
  await expect(surface).toHaveAttribute("data-closing", "true");
  return surface.locator("[data-chat-frame]").evaluate((element) => {
    const animation = element.getAnimations().find(({ effect }) =>
      effect instanceof KeyframeEffect && effect.getKeyframes().some((keyframe) => keyframe.clipPath !== undefined));
    if (!(animation?.effect instanceof KeyframeEffect)) throw new Error("Expected an active mobile closing frame animation.");
    for (const current of element.getAnimations()) {
      current.pause();
      current.currentTime = 0;
    }
    const style = getComputedStyle(element);
    return { clipPath: style.clipPath, opacity: Number.parseFloat(style.opacity) };
  });
}

/** Compares computed clip polygons while tolerating engine rounding.
 * @param actual - Closing clip polygon.
 * @param expected - Interrupted opening clip polygon.
 */
function expectClipPathClose(actual: string, expected: string): void {
  const values = (value: string) => Array.from(value.matchAll(/-?\d+(?:\.\d+)?/g), ([match]) => Number(match));
  const actualValues = values(actual);
  const expectedValues = values(expected);
  expect(actualValues).toHaveLength(expectedValues.length);
  actualValues.forEach((value, index) => { expect(value).toBeCloseTo(expectedValues[index] ?? Number.NaN, 4); });
}

/** Completes document-timeline animations owned by one mobile surface morph.
 * @param surface - Mobile conversation surface.
 */
async function finishMorph(surface: Locator): Promise<void> {
  await surface.evaluate((element) => {
    for (const animation of element.getAnimations({ subtree: true })) {
      if (animation.timeline === document.timeline) animation.finish();
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

  test("@webkit mobile entry reveals on tap and at the page end", async ({ page }) => {
    const launcher = page.locator("button[data-launcher]");
    const input = page.getByRole("textbox", { name: "Your question" });
    await expect(input).toBeHidden();

    await launcher.click();
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();

    await page.reload();
    await readyEntry(page);
    await expect(input).toBeHidden();
    await page.evaluate(() => { window.scrollTo({ behavior: "instant", top: document.documentElement.scrollHeight }); });
    await expect(input).toBeVisible();
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

  test("@webkit mobile send keeps the revealed field stationary while the thread appears", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.reload();
    const launcher = await readyEntry(page);
    await launcher.click();
    const entryField = page.locator("[data-edge-entry] [data-conversation-composer]").locator("..");
    const entryComposer = page.locator('[data-edge-entry] [data-slot="input-group"]');
    await expect.poll(async () => entryField.evaluate((element) => element.getAnimations().length)).toBe(0);
    await page.getByRole("textbox", { name: "Your question" }).fill("Synthetic stationary mobile composer question");
    const before = await box(entryComposer);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await pauseSurfaceMotion(page);

    const surface = page.locator('[data-chat-surface][data-mobile="true"]');
    const surfaceComposer = surface.locator('[data-conversation-composer] [data-slot="input-group"]');
    const after = await box(surfaceComposer);
    const geometry = JSON.stringify({ after, before, viewport: page.viewportSize() });
    expect(after.x, geometry).toBeCloseTo(before.x, 0);
    expect(after.width, geometry).toBeCloseTo(before.width, 0);
    expect(after.y + after.height, geometry).toBeCloseTo(before.y + before.height, 0);
    const composerGeometryKeyframes = await surfaceComposer.evaluate((element) =>
      element.getAnimations().flatMap(({ effect }) => effect instanceof KeyframeEffect ? effect.getKeyframes() : [])
        .filter((keyframe) => keyframe.clipPath !== undefined || keyframe.height !== undefined || keyframe.width !== undefined));
    expect(composerGeometryKeyframes, geometry).toHaveLength(0);
    const transforms = await surfaceComposer.evaluate((element) => element.getAnimations()
      .flatMap(({ effect }) => effect instanceof KeyframeEffect ? effect.getKeyframes() : [])
      .flatMap((keyframe) => {
        if (typeof keyframe.transform !== "string") return [];
        const matrix = new DOMMatrix(keyframe.transform);
        return [{ x: matrix.m41, y: matrix.m42, scaleX: matrix.m11, scaleY: matrix.m22 }];
      }));
    for (const transform of transforms) {
      expect(transform.x, geometry).toBeCloseTo(0, 0);
      expect(transform.y, geometry).toBeCloseTo(0, 0);
      expect(transform.scaleX, geometry).toBe(1);
      expect(transform.scaleY, geometry).toBe(1);
    }
    expect(await surface.locator("[data-chat-morph-line]").evaluate((element) => element.getAnimations().length)).toBe(0);
    await expectFrameGeometryStable(surface);
  });

  test("@webkit mobile open thread hides the launcher line", async ({ page }) => {
    await send(page, "Synthetic mobile line visibility question");
    await expect(page.locator("[data-entry-stroke]")).toBeHidden();
  });

  test("@webkit mobile Escape during opening continues from the current panel frame", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.reload();
    const launcher = await readyEntry(page);
    await launcher.click();
    await page.getByRole("textbox", { name: "Your question" }).fill("Synthetic interrupted mobile opening");
    const opening = await triggerAndSampleSurfaceMotion(page.getByRole("button", { name: "Send", exact: true }));
    const surface = page.locator('[data-chat-surface][data-mobile="true"]');
    await expect(surface).toHaveAttribute("data-morph", "opening");
    await expectFieldFinishesAfterThread(surface);

    await page.keyboard.press("Escape");
    const closing = await sampleClosingStart(surface);
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

  test("@webkit mobile New chat closes the thread and keeps the entry field active", async ({ page }) => {
    const flushWarnings: string[] = [];
    page.on("console", (message) => { if (message.text().includes("flushSync")) flushWarnings.push(message.text()); });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.reload();
    await readyEntry(page);
    const dialog = await send(page, "Synthetic mobile reset-to-field question");
    await emit(page, { done: true, text: "Synthetic mobile reset-to-field answer.", followUps: [{ label: "Continue", question: "Synthetic continuation question?" }] });
    await expect(dialog.getByText("Synthetic mobile reset-to-field answer.", { exact: true })).toBeVisible();
    await finishMorph(dialog);
    await expect(dialog).not.toHaveAttribute("data-morph", "opening");
    await expect(dialog.locator("[data-mobile-suggestions]")).toBeVisible();
    await triggerAndSampleSurfaceMotion(page.getByRole("button", { name: "New chat" }));
    const surface = page.locator('[data-chat-surface][data-mobile="true"]');
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

  test("@webkit mobile Close keeps the panel frame stable while restoring the line", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.reload();
    await readyEntry(page);
    const dialog = await send(page, "Synthetic mobile closing motion question");
    const surface = page.locator('[data-chat-surface][data-mobile="true"]');
    await emit(page, { done: true, text: "Synthetic mobile closing motion answer." });
    await expect(dialog).not.toHaveAttribute("data-morph", "opening");

    await triggerAndSampleSurfaceMotion(page.getByRole("button", { name: "Close conversation" }));
    await expect(surface).toHaveAttribute("data-closing", "true");
    await expectFrameGeometryStable(surface);
    await expectFieldFinishesAfterThread(surface);
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
    await triggerAndSampleSurfaceMotion(page.locator("button[data-launcher]"));
    await expectFieldFinishesAfterThread(surface);
    const fieldClip = await surface.locator('[data-conversation-composer] [data-slot="input-group"]').evaluate((element) => getComputedStyle(element).clipPath);
    expect(fieldClip).toBe("none");
    const paint = await box(surface.locator("[data-composer-surface]"));
    const group = await box(surface.locator('[data-slot="input-group"]'));
    expect(paint.width).toBeGreaterThan(120);
    expect(paint.width).toBeLessThan(group.width);
    await finishMorph(surface);
    await expect(surface).toBeVisible();
  });

  test("@webkit mobile morph skips interpolation when reduced motion is requested", async ({ page }) => {
    const dialog = await send(page, "Synthetic reduced motion question");
    const surface = page.locator('[data-chat-surface][data-mobile="true"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).not.toHaveAttribute("data-morph", "opening");

    await page.getByRole("button", { name: "Close conversation" }).click();
    await expect(surface).toBeHidden();
    expect(await surface.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0);
  });

  test("@webkit mobile transcript scrolls only after its content exceeds the available surface", async ({ page }) => {
    await send(page, "Synthetic short mobile question");
    await emit(page, { done: true, text: "Short answer." });
    const history = page.locator("[data-conversation-history]");
    await expect.poll(async () => history.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
    expect(await history.evaluate((element) => {
      element.scrollTop = 40;
      return element.scrollTop;
    })).toBe(0);

    await page.getByRole("textbox", { name: "Your question" }).fill("Synthetic overflow mobile question");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(async () => (await transport(page)).requests.length).toBe(2);
    await emit(page, { request: 1, done: true, text: "Overflowing mobile answer content. ".repeat(120) });
    await expect.poll(async () => history.evaluate((element) => element.scrollHeight > element.clientHeight + 1)).toBe(true);
    expect(await history.evaluate((element) => {
      element.scrollTop = 40;
      return element.scrollTop;
    })).toBeGreaterThan(0);
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
    const info = page.getByRole("button", { name: "Failure details" });
    const infoBounds = await box(info);
    const infoIcon = await box(info.locator("svg"));
    expect(infoBounds.width).toBeCloseTo(40, 0);
    expect(infoBounds.height).toBeCloseTo(40, 0);
    expect(infoIcon.width).toBeCloseTo(16, 0);
    expect(infoIcon.height).toBeCloseTo(16, 0);
    await expect(info.locator("[data-reaction-visual]")).toHaveCount(0);
    await retry.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(info).toBeFocused();
    await expect(page.getByRole("tooltip")).toBeVisible();
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
    const copyBounds = await box(copy);
    const retryBounds = await box(retry);
    const copyIcon = await box(copy.locator("svg").first());
    const retryIcon = await box(retry.locator("svg"));
    expect(copyBounds.width).toBeCloseTo(40, 0);
    expect(copyBounds.height).toBeCloseTo(40, 0);
    expect(retryBounds.width).toBeCloseTo(40, 0);
    expect(retryBounds.height).toBeCloseTo(40, 0);
    expect(copyIcon.width).toBeCloseTo(16, 0);
    expect(copyIcon.height).toBeCloseTo(16, 0);
    expect(retryIcon.width).toBeCloseTo(16, 0);
    expect(retryIcon.height).toBeCloseTo(16, 0);
    await expect(page.locator("[data-answer-actions]")).toHaveCSS("margin-top", "0px");
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
