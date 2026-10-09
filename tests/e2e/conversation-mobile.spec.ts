import { expect, test, type Locator, type Page } from "@playwright/test";

type Reply = {
  done?: boolean;
  error?: string;
  followUps?: Array<{ label: string; question: string }>;
  request?: number;
  text?: string;
};
type AskFixtureWindow = Window & { askFixture: { aborted: number[]; requests: unknown[] } };
/** Browser-normalized opaque color channels. */
type Rgb = { blue: number; green: number; red: number };
/** Fixed strip pixels and geometry used by WebKit viewport-edge sampling. */
type EdgePaintSample = Rgb & {
  alpha: number;
  bottom: number;
  height: number;
  opacity: number;
  placement: string;
  position: string;
  top: number;
  viewportHeight: number;
  viewportWidth: number;
  width: number;
};
/** Frame and edge pixels sampled at one mobile morph-clock position. */
type MobilePaintSample = {
  chat: Rgb;
  edges: EdgePaintSample[];
  fillAlpha: number;
  frameOpacity: number;
  root: Rgb;
};

/** Verifies both stable edge strips blend page and chat colors with the frame fill.
 * @param sample - Current edge, endpoint, and fill-alpha paints.
 */
function expectEdgeBlend(sample: MobilePaintSample): void {
  for (const edge of sample.edges) {
    expect(edge.position).toBe("fixed");
    expect(edge.height).toBeGreaterThan(10);
    expect(edge.width).toBeCloseTo(edge.viewportWidth, 0);
    expect(edge.opacity).toBe(1);
    expect(edge.alpha).toBe(1);
    const sampleY = edge.placement === "top" ? 4 : edge.viewportHeight - 4;
    expect(edge.top).toBeLessThanOrEqual(sampleY);
    expect(edge.bottom).toBeGreaterThanOrEqual(sampleY);
  }
  for (const channel of ["red", "green", "blue"] as const) {
    const expected = Math.round(sample.root[channel] + (sample.chat[channel] - sample.root[channel]) * sample.fillAlpha);
    for (const edge of sample.edges) expect(Math.abs(edge[channel] - expected)).toBeLessThanOrEqual(1);
  }
}

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

/** Waits for the supported mobile entry point and its settled page-entry motion.
 * @param page - Active portfolio page.
 * @returns Stable launcher used for focus restoration checks.
 */
async function readyEntry(page: Page): Promise<Locator> {
  await expect(page.locator('[data-conversation-shell][data-capability="supported"]')).toBeAttached();
  await expect(page.locator('[data-slot="opening-splash"]')).toHaveCount(0);
  await expect.poll(async () => page.locator("[data-entry-stroke]").evaluate((element) => element.getAnimations().length)).toBe(0);
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

/** Verifies that mobile frame geometry is never registered as browser animation.
 * @param surface - Animated mobile surface.
 */
async function expectFrameGeometryStable(surface: Locator): Promise<void> {
  const geometryKeyframes = await surface.locator("[data-chat-frame]").evaluate((element) =>
    element.getAnimations().flatMap(({ effect }) => effect instanceof KeyframeEffect ? effect.getKeyframes() : [])
      .filter((keyframe) => keyframe.width !== undefined || keyframe.height !== undefined || keyframe.clipPath !== undefined));
  expect(geometryKeyframes).toHaveLength(0);
}

/** Triggers and samples the mobile panel midway through its composer-clock motion.
 * @param control - Control that starts opening or closing the mobile surface.
 * @returns Current translucent frame-fill alpha and composer duration.
 */
async function triggerAndSampleSurfaceMotion(control: Locator): Promise<{ duration: number; opacity: number }> {
  return control.evaluate(async (element) => {
    (element as HTMLElement).click();
    for (let frame = 0; frame < 10; frame += 1) {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve(); }); });
      const surface = document.querySelector<HTMLElement>('[data-chat-surface][data-mobile="true"]');
      const composer = surface?.querySelector<HTMLElement>('[data-conversation-composer] [data-slot="input-group"]');
      const animation = composer?.getAnimations().find(({ effect }) =>
        effect instanceof KeyframeEffect && effect.getKeyframes().some((keyframe) => keyframe.transform !== undefined));
      if (!surface || !animation?.effect) continue;
      const duration = Number(animation.effect.getTiming().duration);
      for (const current of surface.getAnimations({ subtree: true })) {
        if (current.timeline !== document.timeline) continue;
        const currentDuration = Number(current.effect?.getTiming().duration);
        if (!Number.isFinite(currentDuration)) continue;
        current.pause();
        current.currentTime = Math.min(currentDuration, (duration - 80) * 0.45);
      }
      await new Promise<void>((resolve) => { requestAnimationFrame(() => { requestAnimationFrame(() => { resolve(); }); }); });
      const fill = surface.querySelector<HTMLElement>("[data-chat-frame-fill]");
      if (!fill) throw new Error("Expected mobile frame fill.");
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Expected paint sampling context.");
      context.fillStyle = getComputedStyle(fill).backgroundColor;
      context.fillRect(0, 0, 1, 1);
      return { duration, opacity: (context.getImageData(0, 0, 1, 1).data[3] ?? 0) / 255 };
    }
    throw new Error("Expected mobile opening motion to start within ten animation frames.");
  });
}

/** Confirms the mobile field continues settling after the thread's visible motion ends.
 * @param surface - Mobile host with paused surface animations.
 */
async function expectFieldFinishesAfterThread(surface: Locator): Promise<void> {
  const handoff = await surface.evaluate(async (element) => {
    const composer = element.querySelector<HTMLElement>('[data-conversation-composer] [data-slot="input-group"]');
    const composerAnimation = composer?.getAnimations().find(({ effect }) =>
      effect instanceof KeyframeEffect && effect.getKeyframes().some((keyframe) => keyframe.transform !== undefined));
    const paint = element.querySelector<HTMLElement>("[data-composer-surface]");
    const geometryAnimation = paint?.getAnimations().find(({ effect }) =>
      effect instanceof KeyframeEffect && effect.getKeyframes().some((keyframe) => keyframe.width !== undefined || keyframe.height !== undefined));
    if (!(composerAnimation?.effect instanceof KeyframeEffect) || !(geometryAnimation?.effect instanceof KeyframeEffect) || !paint) {
      throw new Error("Expected active mobile composer and paint geometry motion.");
    }
    const fieldDuration = Number(composerAnimation.effect.getTiming().duration);
    const sampleTime = fieldDuration - 40;
    const animations = element.getAnimations({ subtree: true })
      .filter((animation) => animation.timeline === document.timeline && Number.isFinite(Number(animation.effect?.getTiming().duration)))
      .map((animation) => ({ animation }));
    for (const { animation } of animations) {
      const duration = Number(animation.effect?.getTiming().duration);
      if (!Number.isFinite(duration)) continue;
      animation.pause();
      animation.currentTime = Math.min(duration, sampleTime);
    }
    await new Promise<void>((resolve) => { requestAnimationFrame(() => { requestAnimationFrame(() => { resolve(); }); }); });
    const fill = element.querySelector<HTMLElement>("[data-chat-frame-fill]");
    if (!fill) throw new Error("Expected mobile frame fill.");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Expected paint sampling context.");
    context.fillStyle = getComputedStyle(fill).backgroundColor;
    context.fillRect(0, 0, 1, 1);
    const keyframes = geometryAnimation.effect.getKeyframes();
    const first = keyframes.at(0);
    const last = keyframes.at(-1);
    const bounds = paint.getBoundingClientRect();
    const result = {
      alpha: (context.getImageData(0, 0, 1, 1).data[3] ?? 0) / 255,
      dimensions: [
        { current: bounds.width, first: Number.parseFloat(String(first?.width)), last: Number.parseFloat(String(last?.width)) },
        { current: bounds.height, first: Number.parseFloat(String(first?.height)), last: Number.parseFloat(String(last?.height)) },
      ],
      fieldDuration,
      phase: element.dataset.morph,
      sampleTime,
    };
    return result;
  });
  expect(handoff.sampleTime).toBeLessThan(handoff.fieldDuration);
  expect(handoff.sampleTime).toBeGreaterThanOrEqual(260);
  expect(handoff.alpha).toBe(handoff.phase === "closing" ? 0 : 1);
  if (handoff.phase === "closing") {
    for (const edge of await surface.locator("[data-chat-edge-fill]").all()) {
      await expect(edge).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    }
  }
  const changing = handoff.dimensions.filter(({ first, last }) => Number.isFinite(first) && Number.isFinite(last) && Math.abs(first - last) > 1);
  expect(changing.length).toBeGreaterThan(0);
  for (const { current, first, last } of changing) {
    expect(current).toBeGreaterThan(Math.min(first, last));
    expect(current).toBeLessThan(Math.max(first, last));
  }
}

/** Reads the first frame of an interrupted mobile close animation.
 * @param surface - Closing mobile surface.
 * @returns Closing frame's initial opacity.
 */
async function sampleClosingStart(surface: Locator): Promise<{ opacity: number }> {
  await expect(surface).toHaveAttribute("data-closing", "true");
  return surface.evaluate(async (element) => {
    const composer = element.querySelector<HTMLElement>('[data-conversation-composer] [data-slot="input-group"]');
    const animation = composer?.getAnimations().find(({ effect }) =>
      effect instanceof KeyframeEffect && effect.getKeyframes().some((keyframe) => keyframe.transform !== undefined));
    if (!(animation?.effect instanceof KeyframeEffect)) throw new Error("Expected an active mobile closing frame animation.");
    for (const current of element.getAnimations({ subtree: true })) {
      if (current.timeline !== document.timeline || !Number.isFinite(Number(current.effect?.getTiming().duration))) continue;
      current.pause();
      current.currentTime = 0;
    }
    await new Promise<void>((resolve) => { requestAnimationFrame(() => { requestAnimationFrame(() => { resolve(); }); }); });
    const fill = element.querySelector<HTMLElement>("[data-chat-frame-fill]");
    if (!fill) throw new Error("Expected mobile frame fill.");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Expected paint sampling context.");
    context.fillStyle = getComputedStyle(fill).backgroundColor;
    context.fillRect(0, 0, 1, 1);
    return { opacity: (context.getImageData(0, 0, 1, 1).data[3] ?? 0) / 255 };
  });
}

/** Reads the overscanned mobile frame paint and layout viewport height.
 * @param surface - Open mobile conversation surface.
 * @returns Frame bounds, paint color, and layout viewport height.
 */
async function readMobileFramePaint(surface: Locator): Promise<{
  backgroundColor: string; blockEnd: number; blockStart: number; bottom: number; layoutHeight: number; top: number;
}> {
  return surface.locator("[data-chat-frame]").evaluate((frame) => {
    const bounds = frame.getBoundingClientRect();
    const fill = frame.querySelector<HTMLElement>("[data-chat-frame-fill]");
    if (!fill) throw new Error("Expected mobile frame fill.");
    const style = getComputedStyle(frame);
    return {
      backgroundColor: getComputedStyle(fill).backgroundColor,
      blockEnd: Number.parseFloat(style.bottom),
      blockStart: Number.parseFloat(style.top),
      bottom: bounds.bottom,
      layoutHeight: document.documentElement.clientHeight,
      top: bounds.top,
    };
  });
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

/** Seeks the mobile composer clock and samples actual frame and edge pixels.
 * @param surface - Mobile conversation surface.
 * @param progress - Normalized panel-paint progress, or null for settled paint.
 * @returns Actual frame alpha and both opaque edge-strip colors.
 */
async function sampleMobilePaint(surface: Locator, progress: number | null = null): Promise<MobilePaintSample> {
  return surface.evaluate(async (element, normalizedProgress) => {
    const frame = element.querySelector<HTMLElement>("[data-chat-frame]");
    const fill = element.querySelector<HTMLElement>("[data-chat-frame-fill]");
    const edges = Array.from(element.querySelectorAll<HTMLElement>("[data-chat-edge-fill]"));
    if (!frame || !fill || edges.length !== 2) throw new Error("Expected mobile frame and edge paint.");
    if (normalizedProgress !== null) {
      const composer = element.querySelector<HTMLElement>('[data-conversation-composer] [data-slot="input-group"]');
      const composerAnimation = composer?.getAnimations().find(({ effect }) =>
        effect instanceof KeyframeEffect && effect.getKeyframes().some((keyframe) => keyframe.transform !== undefined));
      if (!composerAnimation?.effect) throw new Error("Expected active mobile composer motion.");
      const fieldDuration = Number(composerAnimation.effect.getTiming().duration);
      for (const animation of element.getAnimations({ subtree: true })) {
        if (animation.timeline !== document.timeline) continue;
        const duration = Number(animation.effect?.getTiming().duration);
        if (!Number.isFinite(duration)) continue;
        animation.pause();
        animation.currentTime = Math.min(duration, (fieldDuration - 80) * normalizedProgress);
      }
    }
    await new Promise<void>((resolve) => { requestAnimationFrame(() => { requestAnimationFrame(() => { resolve(); }); }); });
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Expected paint sampling context.");
    /** Samples a CSS paint as RGBA channels.
     * @param color - Computed CSS color.
     * @returns Pixel channels.
     */
    const pixel = (color: string): Uint8ClampedArray => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return context.getImageData(0, 0, 1, 1).data;
    };
    /** Selects opaque RGB channels from one sampled pixel.
     * @param channels - Sampled RGBA channels.
     * @returns Opaque color channels.
     */
    const rgb = (channels: Uint8ClampedArray): Rgb => {
      return { red: channels[0] ?? 0, green: channels[1] ?? 0, blue: channels[2] ?? 0 };
    };
    const rootProbe = document.createElement("span");
    rootProbe.style.background = "var(--background)";
    const chatProbe = document.createElement("span");
    chatProbe.style.background = "var(--chat-background)";
    element.append(rootProbe, chatProbe);
    const fillPixel = pixel(getComputedStyle(fill).backgroundColor);
    const sample = {
      chat: rgb(pixel(getComputedStyle(chatProbe).backgroundColor)),
      edges: edges.map((edge): EdgePaintSample => {
        const style = getComputedStyle(edge);
        const bounds = edge.getBoundingClientRect();
        const color = pixel(style.backgroundColor);
        return {
          ...rgb(color),
          alpha: (color[3] ?? 0) / 255,
          bottom: bounds.bottom,
          height: bounds.height,
          opacity: Number.parseFloat(style.opacity),
          placement: edge.dataset.chatEdgeFill ?? "",
          position: style.position,
          top: bounds.top,
          viewportHeight: document.documentElement.clientHeight,
          viewportWidth: document.documentElement.clientWidth,
          width: bounds.width,
        };
      }),
      fillAlpha: (fillPixel[3] ?? 0) / 255,
      frameOpacity: Number.parseFloat(getComputedStyle(frame).opacity),
      root: rgb(pixel(getComputedStyle(rootProbe).backgroundColor)),
    };
    rootProbe.remove();
    chatProbe.remove();
    return sample;
  }, progress);
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

  test("@webkit mobile idle launcher leaves Safari bottom sampling strip unpainted across reload", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    for (let visit = 0; visit < 2; visit += 1) {
      if (visit > 0) {
        await page.reload();
        await readyEntry(page);
      }
      const stroke = page.locator("[data-entry-stroke]");
      await expect(stroke).toHaveCSS("box-shadow", "none");
      const entrance = await stroke.evaluate(async (element) => {
        const line = element as HTMLElement;
        line.style.animationName = "none";
        line.getBoundingClientRect();
        line.style.removeProperty("animation-name");
        const animation = line.getAnimations()[0];
        if (!animation?.effect) throw new Error("Expected the launcher's initial CSS entrance.");
        animation.pause();
        const timing = animation.effect.getTiming();
        const duration = Number(timing.duration);
        if (!Number.isFinite(duration)) throw new Error("Expected a finite launcher entrance duration.");
        const samples = [] as Array<{ bottom: number; opacity: number; progress: number; top: number; viewportHeight: number }>;
        for (const progress of [0, 0.05, 0.1, 0.15, 0.25, 0.5, 0.75, 1]) {
          animation.currentTime = Number(timing.delay) + duration * progress;
          await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve(); }); });
          const bounds = line.getBoundingClientRect();
          samples.push({ bottom: bounds.bottom, opacity: Number(getComputedStyle(line).opacity), progress, top: bounds.top, viewportHeight: window.innerHeight });
        }
        animation.finish();
        return samples;
      });
      expect(entrance.filter((sample) => sample.opacity > 0 && sample.top <= sample.viewportHeight - 4 && sample.bottom >= sample.viewportHeight - 4), "Visible launcher paint must never cross Safari's bottom sampling point").toEqual([]);
      for (const sample of entrance) {
        expect(sample.bottom, `Launcher entrance at ${String(sample.progress)}`).toBeLessThanOrEqual(sample.viewportHeight - 8);
      }
      expect(entrance[0]?.opacity).toBe(0);
      expect(entrance.at(-1)?.opacity).toBe(1);
      const bounds = await box(stroke);
      const viewportHeight = await page.evaluate(() => window.innerHeight);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewportHeight - 8);
      await expect(page.locator("[data-chat-edge-fill]")).toHaveCount(0);
    }
  });

  test("@webkit mobile focused idle entry ignores reverse viewport jitter until the keyboard opens", async ({ page }) => {
    await page.addInitScript(() => {
      const viewport = new EventTarget();
      Object.assign(viewport, { height: 844, offsetLeft: 0, offsetTop: 0, pageLeft: 0, pageTop: 0, scale: 1, width: 390 });
      Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
      window.addEventListener("ask-fixture-viewport", (event) => {
        Object.assign(viewport, (event as CustomEvent<{ height: number; offsetTop: number }>).detail);
        viewport.dispatchEvent(new Event("resize"));
        viewport.dispatchEvent(new Event("scroll"));
      });
    });
    await page.reload();
    await readyEntry(page);
    await page.locator("button[data-launcher]").click();
    await expect(page.getByRole("textbox", { name: "Your question" })).toBeFocused();
    const entry = page.locator("[data-edge-entry]");
    const shell = page.locator("[data-conversation-shell]");

    for (const viewport of [
      { height: 764, offsetTop: 20, scrollY: 350 },
      { height: 799, offsetTop: -8, scrollY: 700 },
      { height: 839, offsetTop: 0, scrollY: 450 },
    ]) {
      await page.evaluate(({ scrollY, ...detail }) => {
        window.scrollTo({ behavior: "instant", top: scrollY });
        window.dispatchEvent(new CustomEvent("ask-fixture-viewport", { detail }));
      }, viewport);
      await expect.poll(async () => shell.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).getPropertyValue("--viewport-height")))).toBe(viewport.height);
      await expect(shell).toHaveAttribute("data-viewport-keyboard-visible", "false");
      await expect(entry).toHaveCSS("transform", "none");
      await expect(page.getByRole("textbox", { name: "Your question" })).toBeFocused();
      const bounds = await box(entry);
      expect(bounds.y + bounds.height).toBeCloseTo(844 - 8, 0);
    }

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("ask-fixture-viewport", { detail: { height: 400, offsetTop: 0 } }));
    });
    await expect(shell).toHaveAttribute("data-viewport-keyboard-visible", "true");
    await expect(page.getByRole("textbox", { name: "Your question" })).toBeFocused();
    const keyboardBounds = await box(entry);
    expect(keyboardBounds.y + keyboardBounds.height).toBeCloseTo(400 - 8, 0);
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
    await page.keyboard.press("Escape");
    const closing = await sampleClosingStart(surface);
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
    const replacementGroup = page.locator('[data-edge-entry] [data-slot="input-group"]');
    const replacementPaint = page.locator("[data-edge-entry] [data-composer-surface]");
    await expect(replacementGroup).toHaveCSS("clip-path", "none");
    const clip = await replacementPaint.evaluate((element) => {
      const value = getComputedStyle(element).clipPath;
      const values = Array.from(value.matchAll(/-?\d+(?:\.\d+)?/g), ([match]) => Number(match));
      const bottomInset = (values.length >= 3 ? values[2] : values[0]) ?? Number.NaN;
      return { bottomInset, paintBottom: element.getBoundingClientRect().bottom, value, viewportHeight: window.innerHeight };
    });
    expect(clip.value).not.toBe("none");
    expect(clip.bottomInset).toBe(-2);
    expect(clip.paintBottom - clip.bottomInset).toBeLessThanOrEqual(clip.viewportHeight - 5);
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

    const closing = await triggerAndSampleSurfaceMotion(page.getByRole("button", { name: "Close conversation" }));
    expect(closing.opacity).toBeGreaterThan(0);
    expect(closing.opacity).toBeLessThan(1);
    await expect(surface).toHaveAttribute("data-closing", "true");
    await expectFrameGeometryStable(surface);
    const closingPaint = await readMobileFramePaint(surface);
    expect(closingPaint.blockStart).toBeLessThanOrEqual(-closingPaint.layoutHeight + 1);
    expect(closingPaint.blockEnd).toBeLessThanOrEqual(-closingPaint.layoutHeight + 1);
    expect(closingPaint.top).toBeLessThanOrEqual(0);
    expect(closingPaint.bottom).toBeGreaterThanOrEqual(closingPaint.layoutHeight - 1);
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
    const reopening = await triggerAndSampleSurfaceMotion(page.locator("button[data-launcher]"));
    expect(reopening.opacity).toBeGreaterThan(0);
    expect(reopening.opacity).toBeLessThan(1);
    await expectFrameGeometryStable(surface);
    const reopeningPaint = await readMobileFramePaint(surface);
    expect(reopeningPaint.blockStart).toBeLessThanOrEqual(-reopeningPaint.layoutHeight + 1);
    expect(reopeningPaint.blockEnd).toBeLessThanOrEqual(-reopeningPaint.layoutHeight + 1);
    expect(reopeningPaint.top).toBeLessThanOrEqual(0);
    expect(reopeningPaint.bottom).toBeGreaterThanOrEqual(reopeningPaint.layoutHeight - 1);
    const fieldClip = await surface.locator('[data-conversation-composer] [data-slot="input-group"]').evaluate((element) => getComputedStyle(element).clipPath);
    expect(fieldClip).toBe("none");
    const paint = await box(surface.locator("[data-composer-surface]"));
    const group = await box(surface.locator('[data-slot="input-group"]'));
    expect(paint.width).toBeGreaterThan(120);
    expect(paint.width).toBeLessThan(group.width);
    await finishMorph(surface);
    await expect(surface).toBeVisible();
  });

  test("@webkit mobile edge paint follows opening and closing composer motion in both themes", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate((value) => { localStorage.setItem("theme", value); }, theme);
      await page.reload();
      await readyEntry(page);
      await expect(page.locator("[data-chat-edge-fill]")).toHaveCount(0);
      await page.locator("button[data-launcher]").click();
      await page.getByRole("textbox", { name: "Your question" }).fill(`Synthetic ${theme} edge paint question`);
      const openingTiming = await triggerAndSampleSurfaceMotion(page.getByRole("button", { name: "Send", exact: true }));
      expect(openingTiming.duration).toBeLessThanOrEqual(400);
      await emit(page, { done: true, text: `Synthetic ${theme} edge paint answer.` });
      const surface = page.locator('[data-chat-surface][data-mobile="true"]');
      expect(await surface.locator("[data-chat-frame], [data-chat-frame-fill], [data-chat-edge-fill]").evaluateAll((elements) =>
        elements.flatMap((element) => element.getAnimations()))).toHaveLength(0);
      const opening = [] as MobilePaintSample[];
      for (const progress of [0, 0.45, 0.99]) {
        const sample = await sampleMobilePaint(surface, progress);
        expect(sample.frameOpacity).toBe(1);
        expect(sample.edges).toHaveLength(2);
        expectEdgeBlend(sample);
        opening.push(sample);
      }
      expect(opening[0]?.fillAlpha).toBe(0);
      expect(opening[1]?.fillAlpha).toBeGreaterThan(opening[0]?.fillAlpha ?? 1);
      expect(opening[2]?.fillAlpha).toBeGreaterThan(opening[1]?.fillAlpha ?? 1);
      await finishMorph(surface);
      await expect(surface).not.toHaveAttribute("data-morph", "opening");
      const settled = await sampleMobilePaint(surface);
      expect(settled.frameOpacity).toBe(1);
      expect(settled.fillAlpha).toBe(1);
      expectEdgeBlend(settled);

      const closingTiming = await triggerAndSampleSurfaceMotion(page.getByRole("button", { name: "Close conversation" }));
      expect(closingTiming.duration).toBeLessThanOrEqual(400);
      const closing = [] as MobilePaintSample[];
      for (const progress of [0, 0.45, 0.99]) {
        const sample = await sampleMobilePaint(surface, progress);
        expectEdgeBlend(sample);
        closing.push(sample);
      }
      expect(closing[0]?.fillAlpha).toBe(1);
      expect(closing[1]?.fillAlpha).toBeLessThan(closing[0]?.fillAlpha ?? 0);
      expect(closing[2]?.fillAlpha).toBeLessThan(closing[1]?.fillAlpha ?? 0);
      await expectFieldFinishesAfterThread(surface);
      await finishMorph(surface);
      await expect(surface).toBeHidden();
      await expect(surface.locator("[data-chat-edge-fill]").first()).toHaveCSS("display", "none");
      await expect(surface.locator("[data-chat-frame-fill]")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    }
  });

  test("@webkit mobile edge paint resets across retained close, reopen, and New chat", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.reload();
    await readyEntry(page);
    await send(page, "Synthetic retained edge lifecycle question");
    const surface = page.locator('[data-chat-surface][data-mobile="true"]');
    await emit(page, { done: true, text: "Synthetic retained edge lifecycle answer." });
    await finishMorph(surface);

    await triggerAndSampleSurfaceMotion(page.getByRole("button", { name: "Close conversation" }));
    await finishMorph(surface);
    await expect(surface).toBeHidden();
    await expect(surface.locator("[data-chat-frame]")).toHaveCSS("display", "none");
    await expect(surface.locator("[data-chat-edge-fill]").first()).toHaveCSS("display", "none");

    await triggerAndSampleSurfaceMotion(page.getByRole("button", { name: "Reopen conversation" }));
    const reopenedStart = await sampleMobilePaint(surface, 0);
    const reopenedMiddle = await sampleMobilePaint(surface, 0.45);
    expect(reopenedStart.fillAlpha).toBe(0);
    expect(reopenedMiddle.fillAlpha).toBeGreaterThan(0);
    expectEdgeBlend(reopenedMiddle);
    await finishMorph(surface);
    expect((await sampleMobilePaint(surface)).fillAlpha).toBe(1);

    await triggerAndSampleSurfaceMotion(page.getByRole("button", { name: "New chat" }));
    await finishMorph(surface);
    await expect(surface).toBeHidden();
    await expect(surface.locator("[data-chat-edge-fill]").first()).toBeHidden();
    await page.reload();
    await readyEntry(page);
    await expect(page.locator("[data-chat-edge-fill]")).toHaveCount(0);
  });

  test("@webkit mobile settled edge paint follows theme and responsive host lifecycle without mutating metadata", async ({ page }) => {
    await page.evaluate(() => {
      const fixture = document.createElement("meta");
      fixture.name = "theme-color";
      fixture.content = "#123456";
      fixture.media = "all";
      fixture.dataset.fixtureThemeColor = "true";
      document.head.prepend(fixture);
    });
    const fixture = page.locator('meta[name="theme-color"][data-fixture-theme-color]');
    await send(page, "Synthetic responsive edge paint question");
    const mobileSurface = page.locator('[data-chat-surface][data-mobile="true"]');
    expectEdgeBlend(await sampleMobilePaint(mobileSurface));
    await expect(fixture).toHaveAttribute("content", "#123456");
    await expect(fixture).toHaveAttribute("media", "all");
    await page.evaluate(() => {
      document.documentElement.classList.remove("light", "dark");
      document.documentElement.classList.add("dark");
    });
    expectEdgeBlend(await sampleMobilePaint(mobileSurface));

    await page.setViewportSize({ width: 1024, height: 844 });
    const desktopSurface = page.locator('[data-chat-surface][data-mobile="false"]');
    await expect(desktopSurface).toBeVisible();
    await expect(mobileSurface).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    const restoredMobileSurface = page.locator('[data-chat-surface][data-mobile="true"]');
    await expect(restoredMobileSurface).toBeVisible();
    expectEdgeBlend(await sampleMobilePaint(restoredMobileSurface));

    await page.locator('a[href="/projects"]').first().evaluate((link: HTMLAnchorElement) => { link.click(); });
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.locator('[data-chat-surface][data-mobile="true"]')).toBeHidden();
    await expect(fixture).toHaveAttribute("content", "#123456");
    await expect(fixture).toHaveAttribute("media", "all");
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
    const surface = await box(dialog.locator("[data-chat-paint]"));
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

  test("@webkit mobile frame paint overscans multi-step keyboard viewport changes in both themes", async ({ page }) => {
    await page.addInitScript(() => {
      const viewport = new EventTarget();
      Object.assign(viewport, { height: 844, offsetLeft: 0, offsetTop: 0, pageLeft: 0, pageTop: 0, scale: 1, width: 390 });
      Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
      window.addEventListener("ask-fixture-viewport", (event) => {
        Object.assign(viewport, (event as CustomEvent<{ height: number; offsetTop?: number }>).detail);
        viewport.dispatchEvent(new Event("resize"));
      });
    });

    for (const theme of ["light", "dark"] as const) {
      await page.evaluate((value) => { localStorage.setItem("theme", value); }, theme);
      await page.reload();
      await readyEntry(page);
      const dialog = await send(page, `Synthetic ${theme} overscan question`);
      await emit(page, { done: true, text: `Synthetic ${theme} overscan answer.` });
      const input = page.getByRole("textbox", { name: "Your question" });
      await input.focus();

      const expectedBackground = await page.evaluate((value) => {
        const probe = document.createElement("span");
        probe.style.backgroundColor = value === "dark" ? "var(--card)" : "var(--background)";
        document.body.append(probe);
        const color = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return color;
      }, theme);

      for (const bounds of [
        { height: 620, offsetTop: 0 },
        { height: 400, offsetTop: 0 },
        { height: 500, offsetTop: 36 },
        { height: 844, offsetTop: 0 },
      ]) {
        await page.evaluate((detail) => {
          window.dispatchEvent(new CustomEvent("ask-fixture-viewport", { detail }));
        }, bounds);
        await expect.poll(async () => (await box(dialog.locator("[data-chat-paint]"))).height).toBeCloseTo(bounds.height, 0);
        await expect(page.locator("[data-conversation-composer]:visible")).toHaveCount(1);
        await expect(input).toBeEditable();
        const composer = await box(page.locator("[data-conversation-composer]"));
        expect(composer.y + composer.height).toBeLessThanOrEqual(bounds.offsetTop + bounds.height + 1);
        const paint = await readMobileFramePaint(dialog);
        expect(paint.backgroundColor).toBe(expectedBackground);
        const host = await box(dialog);
        expect(host.y + host.height).toBeGreaterThanOrEqual(paint.layoutHeight - 1);
        expect(paint.blockStart).toBeLessThanOrEqual(-paint.layoutHeight + 1);
        expect(paint.blockEnd).toBeLessThanOrEqual(-paint.layoutHeight + 1);
        expect(paint.top).toBeLessThanOrEqual(0);
        expect(paint.bottom).toBeGreaterThanOrEqual(paint.layoutHeight - 1);
      }

      await page.getByRole("button", { name: "Close conversation" }).click();
      await expect(dialog).toBeHidden();
    }
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
