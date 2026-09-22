import { expect, test, type Locator, type Page } from "@playwright/test";

/** Reveals and focuses the on-page first composer without opening an empty host.
 * @param page - Active portfolio page.
 */
async function revealComposer(page: Page): Promise<void> {
  await expect(page.locator('[data-conversation-shell][data-capability="supported"]')).toBeAttached();
  await expect(page.locator('[data-slot="opening-splash"]')).toHaveCount(0);
  const input = page.getByRole("textbox", { name: "Your question" });
  if (!await input.isVisible()) await page.getByRole("button", { name: "Ask about my work" }).focus();
  await expect(input).toBeVisible();
  await input.focus();
  await expect(page.getByRole("dialog", { name: "About my work" })).toBeHidden();
}

type ReactionFrame = { time: number; duration: number | null; scale: number; opacity: number; centerX: number; centerY: number; panelHeight: number };
/** One painted entry frame and its configured animation duration. */
type BubbleFrame = { time: number; duration: number | null; opacity: number; translateY: number };
/** One generated suggestion frame and its unchanged layout dimensions. */
type SuggestionFrame = { time: number; scale: number; opacity: number; buttonWidth: number; buttonHeight: number };
/** Browser-owned recordings for bubble and reaction motion checks. */
type MotionWindow = Window & {
  bubbleFrames?: Promise<BubbleFrame[]>;
  reactionFrames?: Promise<ReactionFrame[]>;
  suggestionFrames?: Promise<SuggestionFrame[]>;
};

/** Records actual reaction paint from the next pointer entry or exit.
 * @param visual - Painted reaction child whose scale and center are observed.
 * @param event - Pointer boundary that starts recording.
 */
async function recordReaction(visual: Locator, event: "pointerenter" | "pointerleave"): Promise<void> {
  await visual.evaluate((element, eventName) => {
    const bubble = element.closest('[data-slot="bubble"]');
    const panel = element.closest('[data-chat-surface]');
    if (!bubble || !panel) throw new Error("Reaction must belong to a visible message and panel.");
    const surface = panel;
    (window as MotionWindow).reactionFrames = new Promise<ReactionFrame[]>((resolve) => {
      bubble.addEventListener(eventName, () => {
        const start = performance.now();
        const frames: ReactionFrame[] = [];
        /** Samples scale and geometry until the short animation has finished. */
        function sample(): void {
          const time = performance.now() - start;
          const transform = getComputedStyle(element).transform;
          const box = element.getBoundingClientRect();
          const timing = element.getAnimations()[0]?.effect?.getTiming();
          frames.push({
            time,
            duration: typeof timing?.duration === "number" ? timing.duration : null,
            scale: transform === "none" ? 1 : new DOMMatrixReadOnly(transform).a,
            opacity: Number(getComputedStyle(element).opacity),
            centerX: box.x + box.width / 2,
            centerY: box.y + box.height / 2,
            panelHeight: surface.getBoundingClientRect().height,
          });
          if (time < 300) requestAnimationFrame(sample);
          else resolve(frames);
        }
        sample();
      }, { once: true });
    });
  }, event);
}

/** Reads completed browser-side animation samples.
 * @param page - Browser page that owns the recording.
 * @returns Painted scale and geometry frames.
 */
async function reactionFrames(page: Page): Promise<ReactionFrame[]> {
  return page.evaluate(async () => {
    const frames = (window as MotionWindow).reactionFrames;
    if (!frames) throw new Error("Reaction recording must be armed before reading it.");
    return frames;
  });
}

/** Records the next matching message bubble's painted entry frames.
 * @param page - Browser page that owns the conversation.
 * @param selector - Bubble selector expected to receive the entry animation.
 */
async function recordBubbleEntry(page: Page, selector: string): Promise<void> {
  await page.evaluate((bubbleSelector) => {
    (window as MotionWindow).bubbleFrames = new Promise<BubbleFrame[]>((resolve) => {
      const observer = new MutationObserver(() => {
        const target = document.querySelector(bubbleSelector);
        if (!(target instanceof HTMLElement)) return;
        const bubble = target;
        observer.disconnect();
        const startedAt = performance.now();
        const frames: BubbleFrame[] = [];
        const timing = bubble.getAnimations()[0]?.effect?.getTiming();
        const duration = typeof timing?.duration === "number" ? timing.duration : null;
        /** Samples the entry paint until the short animation settles. */
        function sample(): void {
          const style = getComputedStyle(bubble);
          const transform = style.transform;
          frames.push({
            time: performance.now() - startedAt,
            duration,
            opacity: Number(style.opacity),
            translateY: transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42,
          });
          if (performance.now() - startedAt < 360) requestAnimationFrame(sample);
          else resolve(frames);
        }
        sample();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }, selector);
}

/** Reads completed message bubble entry samples.
 * @param page - Browser page that owns the recording.
 * @returns Painted opacity and vertical travel frames.
 */
async function bubbleFrames(page: Page): Promise<BubbleFrame[]> {
  return page.evaluate(async () => {
    const frames = (window as MotionWindow).bubbleFrames;
    if (!frames) throw new Error("Bubble recording must be armed before reading it.");
    return frames;
  });
}

/** Records the first generated suggestion as it enters the document.
 * @param page - Browser page that owns the conversation.
 */
async function recordSuggestionEntry(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as MotionWindow).suggestionFrames = new Promise<SuggestionFrame[]>((resolve) => {
      const observer = new MutationObserver(() => {
        const visual = document.querySelector('[aria-label="Suggested questions"][data-suggestion-visual]');
        const button = visual?.querySelector("button");
        if (!(visual instanceof HTMLElement) || !(button instanceof HTMLButtonElement)) return;
        observer.disconnect();
        const startedAt = performance.now();
        const frames: SuggestionFrame[] = [];
        /** Samples group paint and unchanged button layout until motion settles. */
        function sample(): void {
          const style = getComputedStyle(visual as HTMLElement);
          const transform = style.transform;

          frames.push({
            time: performance.now() - startedAt,
            scale: transform === "none" ? 1 : new DOMMatrixReadOnly(transform).a,
            opacity: Number(style.opacity),
            buttonWidth: (button as HTMLButtonElement).offsetWidth,
            buttonHeight: (button as HTMLButtonElement).offsetHeight,
          });
          if (performance.now() - startedAt < 600) requestAnimationFrame(sample);
          else resolve(frames);
        }
        sample();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
  });
}

/** Reads completed generated-suggestion entry samples.
 * @param page - Browser page that owns the recording.
 * @returns Painted scale and native button geometry frames.
 */
async function suggestionFrames(page: Page): Promise<SuggestionFrame[]> {
  return page.evaluate(async () => {
    const frames = (window as MotionWindow).suggestionFrames;
    if (!frames) throw new Error("Suggestion recording must be armed before reading it.");
    return frames;
  });
}

/** Confirms a short fade-and-rise entry with observable intermediate paint.
 * @param frames - Observed browser frames for one bubble entry.
 */
function expectSnappyBubbleEntry(frames: BubbleFrame[]): void {
  const first = frames[0];
  const last = frames.at(-1);
  if (!first || !last) throw new Error("Bubble entry must produce observable frames.");
  expect(first.opacity).toBeLessThan(0.5);
  expect(first.translateY).toBeGreaterThan(0);
  expect(frames.some(({ opacity }) => opacity > first.opacity && opacity < 0.99)).toBe(true);
  expect(frames.some(({ translateY }) => translateY > 0.1 && translateY < first.translateY - 0.1)).toBe(true);
  expect(frames.every(({ duration }) => duration !== null && duration >= 240 && duration <= 320)).toBe(true);
  expect(last.opacity).toBeCloseTo(1, 2);
  expect(last.translateY).toBeCloseTo(0, 1);
  const settled = frames.find(({ opacity, translateY }) => opacity >= 0.99 && Math.abs(translateY) <= 0.1);
  expect(settled?.time).toBeGreaterThanOrEqual(60);
  expect(settled?.time).toBeLessThanOrEqual(340);
}

test("sent and reply bubbles fade and rise into place with snappy paint", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  let releaseReply: (() => void) | undefined;
  await page.route("**/api/ask", async (route) => {
    await new Promise<void>((resolve) => { releaseReply = resolve; });
    await route.fulfill({
      contentType: "text/event-stream; charset=utf-8",
      body: 'event: metadata\ndata: {"mode":"live"}\n\nevent: delta\ndata: {"text":"Animated reply."}\n\nevent: done\ndata: {"sources":[],"followUps":[]}\n\n',
    });
  });
  await page.goto("/");
  await expect(page.locator('[data-conversation-shell][data-capability="supported"]')).toBeAttached();
  await revealComposer(page);
  const composer = page.getByRole("textbox", { name: "Your question" });
  await composer.fill("Animate both bubbles");

  const sentSelector = '[data-slot="message"][data-align="end"] [data-slot="bubble"]';
  await recordBubbleEntry(page, sentSelector);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  expectSnappyBubbleEntry(await bubbleFrames(page));

  const replySelector = '[data-answer-presentation] [data-slot="bubble"]';
  await recordBubbleEntry(page, replySelector);
  await expect.poll(() => Boolean(releaseReply)).toBe(true);
  releaseReply?.();
  expectSnappyBubbleEntry(await bubbleFrames(page));
  await expect(page.locator(replySelector)).toContainText("Animated reply.");
});

test("reduced motion paints sent and reply bubbles at their final state", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/ask", async (route) => {
    await route.fulfill({
      contentType: "text/event-stream; charset=utf-8",
      body: 'event: metadata\ndata: {"mode":"live"}\n\nevent: delta\ndata: {"text":"Static reply."}\n\nevent: done\ndata: {"sources":[],"followUps":[]}\n\n',
    });
  });
  await page.goto("/");
  await expect(page.locator('[data-conversation-shell][data-capability="supported"]')).toBeAttached();
  await revealComposer(page);
  const composer = page.getByRole("textbox", { name: "Your question" });
  await composer.fill("Keep bubbles static");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const bubbles = page.locator('[data-slot="message"] [data-slot="bubble"]');
  await expect(bubbles).toHaveCount(2);
  for (const bubble of await bubbles.all()) {
    await expect(bubble).toHaveCSS("animation-name", "none");
    await expect(bubble).toHaveCSS("opacity", "1");
    await expect(bubble).toHaveCSS("transform", "none");
  }
});

test("suggested follow-ups share one animated pill without changing layout", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.route("**/api/ask", async (route) => {
    await route.fulfill({
      contentType: "text/event-stream; charset=utf-8",
      body: 'event: metadata\ndata: {"mode":"live"}\n\nevent: delta\ndata: {"text":"Choose a continuation."}\n\nevent: done\ndata: {"sources":[],"followUps":[{"label":"Experience","question":"Tell me about experience."},{"label":"Projects","question":"Tell me about projects."}]}\n\n',
    });
  });
  await page.goto("/");
  await expect(page.locator('[data-conversation-shell][data-capability="supported"]')).toBeAttached();
  await revealComposer(page);
  await page.getByRole("textbox", { name: "Your question" }).fill("Show suggestions");
  await recordSuggestionEntry(page);
  await page.getByRole("button", { name: "Send", exact: true }).click();

  const frames = await suggestionFrames(page);
  const first = frames[0];
  const last = frames.at(-1);
  if (!first || !last) throw new Error("Suggestion entry must produce observable frames.");
  expect(first.scale).toBeLessThan(0.2);
  expect(frames.filter(({ time }) => time < 240).every(({ scale }) => scale < 0.05)).toBe(true);
  expect(frames.some(({ scale }) => scale > 0.05 && scale < 0.95)).toBe(true);
  expect(last.scale).toBeCloseTo(1, 2);
  expect(last.opacity).toBe(1);
  for (const frame of frames) {
    expect(Math.abs(frame.buttonWidth - first.buttonWidth)).toBeLessThan(0.5);
    expect(Math.abs(frame.buttonHeight - first.buttonHeight)).toBeLessThan(0.5);
  }
  const settled = frames.find(({ scale }) => scale >= 0.999);
  expect(settled?.time).toBeGreaterThanOrEqual(320);
  expect(settled?.time).toBeLessThan(560);
  const button = page.getByRole("button", { name: "Experience" });
  await expect(button).toBeVisible();
  const group = page.locator('[aria-label="Suggested questions"]');
  await expect(group).toHaveCount(1);
  await expect(group.locator("[data-suggestion-visual]")).toHaveCount(0);
  await expect(group.getByRole("button")).toHaveCount(2);
  const paint = await group.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    shadow: getComputedStyle(element).boxShadow,
    buttons: Array.from(element.querySelectorAll("button"), (button) => ({
      background: getComputedStyle(button).backgroundColor,
      shadow: getComputedStyle(button).boxShadow,
    })),
  }));
  expect(paint.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(paint.shadow).not.toBe("none");
  expect(paint.buttons.every(({ background }) => background === "rgba(0, 0, 0, 0)")).toBe(true);
  for (const { shadow } of paint.buttons) {
    expect(Array.from(shadow.matchAll(/-?\d+(?:\.\d+)?px/g), ([extent]) => Number.parseFloat(extent)).every((extent) => extent === 0)).toBe(true);
  }
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [390, 1_440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(320);
      const name = `connected-followups-${colorScheme}-${String(width)}`;
      const path = testInfo.outputPath(`${name}.png`);
      await group.screenshot({ path });
      await testInfo.attach(name, { path, contentType: "image/png" });
    }
  }
  await button.click();
  await expect(page.getByRole("textbox", { name: "Your question" })).toHaveValue("Tell me about experience.");

});

test("reduced motion shows suggested follow-ups at their final state", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/ask", async (route) => {
    await route.fulfill({
      contentType: "text/event-stream; charset=utf-8",
      body: 'event: metadata\ndata: {"mode":"live"}\n\nevent: delta\ndata: {"text":"Choose a continuation."}\n\nevent: done\ndata: {"sources":[],"followUps":[{"label":"Projects","question":"Tell me about projects."}]}\n\n',
    });
  });
  await page.goto("/");
  await expect(page.locator('[data-conversation-shell][data-capability="supported"]')).toBeAttached();
  await revealComposer(page);
  await page.getByRole("textbox", { name: "Your question" }).fill("Show suggestions");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  const visual = page.locator("[data-suggestion-visual]");
  await expect(page.getByRole("button", { name: "Projects" })).toBeVisible();
  await expect(visual).toHaveCSS("opacity", "1");
  await expect.poll(() => visual.evaluate((element) => {
    const transform = getComputedStyle(element).transform;
    return transform === "none" ? 1 : new DOMMatrixReadOnly(transform).a;
  })).toBeCloseTo(1, 3);
});

/** Confirms full travel, a fixed center, and a short completion time.
 * @param frames - Observed browser frames for one transition.
 * @param opening - Whether the pill is growing rather than shrinking.
 */
function expectCenteredScale(frames: ReactionFrame[], opening: boolean): void {
  const first = frames[0];
  const last = frames.at(-1);
  if (!first || !last) throw new Error("Animation must produce observable frames.");
  expect(first.scale).toBeCloseTo(opening ? 0 : 1, 3);
  expect(last.scale).toBeCloseTo(opening ? 1 : 0, 3);
  expect(frames.some(({ scale }) => scale > 0.01 && scale < 0.99)).toBe(true);
  for (const frame of frames) {
    expect(frame.scale).toBeGreaterThanOrEqual(0);
    expect(frame.scale).toBeLessThanOrEqual(1);
    if (!opening && frame.scale > 0.01) expect(frame.opacity).toBe(1);
    expect(Math.abs(frame.centerX - first.centerX)).toBeLessThan(0.5);
    expect(Math.abs(frame.centerY - first.centerY)).toBeLessThan(0.5);
    expect(Math.abs(frame.panelHeight - first.panelHeight)).toBeLessThanOrEqual(1);
  }
  const finished = frames.find(({ scale }) => opening ? scale >= 0.999 : scale <= 0.001);
  expect(finished?.time).toBeGreaterThanOrEqual(80);
  expect(finished?.time).toBeLessThan(280);
}

for (const name of ["Copy reply", "Retry message", "Failure details"] as const) {
  test(`${name} scales in and out from its center without resizing the chat`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.route("**/api/ask", async (route) => {
      await route.fulfill({
        contentType: "text/event-stream; charset=utf-8",
        body: name === "Failure details"
          ? 'event: error\ndata: {"message":"Provider failure"}\n\n'
          : 'event: metadata\ndata: {"mode":"live"}\n\nevent: delta\ndata: {"text":"A response for reaction motion."}\n\nevent: done\ndata: {"sources":[],"followUps":[]}\n\n',
      });
    });
    await page.goto("/");
    await expect(page.locator('[data-conversation-shell][data-capability="supported"]')).toBeAttached();
    await expect(page.locator('[data-slot="opening-splash"]')).toHaveCount(0);
    await revealComposer(page);
    const composer = page.getByRole("textbox", { name: "Your question" });
    await expect(composer).toBeFocused();
    await composer.fill("Scale these actions");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const control = page.getByLabel(name, { exact: true });
    const reactions = page.locator('[data-hover-reaction]').filter({ has: control });
    const visual = control.locator("[data-reaction-visual]");
    const bubbleContent = control.locator('xpath=ancestor::*[@data-slot="bubble"][1]').locator('[data-slot="bubble-content"]');
    await expect(reactions).toBeAttached();
    await expect(visual).toBeAttached();
    await expect(page.locator('[data-answer-presentation]')).toHaveCSS("opacity", "1");
    await page.mouse.move(0, 0);
    await expect(visual).toHaveCSS("opacity", "0");
    const origin = await visual.evaluate((element) => {
      if (!(element instanceof HTMLElement)) throw new Error("Reaction pill must be an HTML element.");
      const [x = 0, y = 0] = getComputedStyle(element).transformOrigin.split(" ").map(Number.parseFloat);
      return { x, y, width: element.offsetWidth, height: element.offsetHeight };
    });
    expect(origin.x).toBeCloseTo(origin.width / 2, 3);
    expect(origin.y).toBeCloseTo(origin.height / 2, 3);

    await recordReaction(visual, "pointerenter");
    await bubbleContent.hover();
    expectCenteredScale(await reactionFrames(page), true);
    await expect(visual).toHaveCSS("opacity", "1");
    await control.hover();
    await recordReaction(visual, "pointerleave");
    await page.mouse.move(0, 0);
    expectCenteredScale(await reactionFrames(page), false);
    await expect(visual).toHaveCSS("opacity", "0");

    await bubbleContent.hover();
    await expect(visual).toHaveCSS("transform", "none");
    await page.mouse.move(0, 0);
    await expect.poll(() => visual.evaluate((element) => {
      const transform = getComputedStyle(element).transform;
      return transform === "none" ? 1 : new DOMMatrixReadOnly(transform).a;
    }), { intervals: [5] }).toBeLessThan(0.99);
    await bubbleContent.hover();
    await expect(visual).toHaveCSS("transform", "none");
    await expect(visual).toHaveCSS("opacity", "1");
    await page.mouse.move(0, 0);

    await composer.focus();
    for (let step = 0; step < 6 && !await control.evaluate((element) => element === document.activeElement); step += 1) {
      await page.keyboard.press("Shift+Tab");
    }
    await expect(control).toBeFocused();
    await expect(visual).toHaveCSS("opacity", "1");
    await expect(visual).toHaveCSS("transform", "none");
    await composer.focus();
    await expect(visual).toHaveCSS("opacity", "0");
  });
}
