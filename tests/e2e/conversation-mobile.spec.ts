import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

/** One synthetic completion source, independent of current portfolio records. */
type Source = { id: string; title: string; href: string };
/** A controlled chunk addressed to one request, including deliberately stale requests. */
type Reply = { request?: number; text?: string; done?: boolean; error?: string; sources?: Source[]; followUps?: { label: string; question: string }[] };
/** Browser-visible transport accounting for duplicate requests and cancellation. */
type AskFixtureWindow = Window & { askFixture: { requests: unknown[]; aborted: number[] } };

/** Installs event-driven streams without provider calls or timing-dependent responses.
 * @param page - Browser page receiving the transport fixture.
 */
async function installTransport(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const fixture = { requests: [] as unknown[], aborted: [] as number[] };
    (window as unknown as AskFixtureWindow).askFixture = fixture;
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.endsWith("/api/ask")) return original(input, init);
      const request = fixture.requests.push(JSON.parse(typeof init?.body === "string" ? init.body : "{}") as unknown) - 1;
      init?.signal?.addEventListener("abort", () => { fixture.aborted.push(request); }, { once: true });
      const encoder = new TextEncoder();
      let closed = false;
      let update: ((event: Event) => void) | undefined;
      /** Detaches the fixture listener when its stream completes or is cancelled. */
      const cleanup = (): void => {
        closed = true;
        if (update) window.removeEventListener("ask-fixture-reply", update);
      };
      const stream = new ReadableStream<Uint8Array>({
        /** Keeps a synthetic response pending until its matching test event arrives.
         * @param controller - Response stream controller.
         */
        start(controller) {
          controller.enqueue(encoder.encode('event: metadata\ndata: {"mode":"live"}\n\n'));
          /** Emits one protocol update and removes completed stream listeners.
           * @param event - Test-owned response update.
           */
          update = (event: Event): void => {
            if (closed) return;
            const reply = (event as CustomEvent<Reply>).detail;
            if ((reply.request ?? fixture.requests.length - 1) !== request) return;
              if (reply.text) controller.enqueue(encoder.encode(`event: delta\ndata: ${JSON.stringify({ text: reply.text })}\n\n`));
              if (reply.error) controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: reply.error })}\n\n`));
              if (reply.done) controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ sources: reply.sources ?? [], followUps: reply.followUps ?? [] })}\n\n`));
              if (reply.done || reply.error) { cleanup(); controller.close(); }
          };
          window.addEventListener("ask-fixture-reply", update);
        },
        /** Cleans up a cancelled reader without swallowing unexpected fixture errors. */
        cancel() { cleanup(); },
      });
      return Promise.resolve(new Response(stream, { headers: { "Content-Type": "text/event-stream" } }));
    };
  });
}

/** Delivers one controlled stream update after the prior UI state is observable.
 * @param page - Page owning the fixture.
 * @param reply - Synthetic delta or terminal metadata.
 */
async function emit(page: Page, reply: Reply): Promise<void> {
  await page.evaluate((detail) => { window.dispatchEvent(new CustomEvent("ask-fixture-reply", { detail })); }, reply);
}

/** Reads request and abort accounting without relying on real HTTP timing.
 * @param page - Page owning the fixture.
 * @returns Captured transport accounting.
 */
async function transport(page: Page): Promise<AskFixtureWindow["askFixture"]> {
  return page.evaluate(() => (window as unknown as AskFixtureWindow).askFixture);
}

/** Waits for the supported entry without opening a conversation.
 * @param page - Portfolio browser page.
 * @returns Stable noneditable Ask control.
 */
async function readyEntry(page: Page): Promise<Locator> {
  await expect(page.locator('[data-conversation-shell][data-capability="supported"]')).toBeAttached();
  await expect(page.locator('[data-slot="opening-splash"]')).toHaveCount(0);
  const launcher = page.locator("button[data-launcher]");
  const input = page.getByRole("textbox", { name: "Your question" });
  await expect.poll(async () => await input.isVisible() || await launcher.isVisible()).toBe(true);
  return launcher;
}

/** Sends through the sole active composer and waits for the committed surface.
 * @param page - Portfolio browser page.
 * @param question - Synthetic visitor question.
 * @returns Visible named conversation surface.
 */
async function send(page: Page, question = "Synthetic question"): Promise<Locator> {
  const requestsBefore = (await transport(page)).requests.length;
  const input = page.getByRole("textbox", { name: "Your question" });
  if (!await input.isVisible()) {
    const launcher = await readyEntry(page);
    if ((page.viewportSize()?.width ?? 1440) < 640) await launcher.click();
    else await launcher.hover();
  }
  await input.fill(question);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "About my work" });
  await expect(dialog).toBeVisible();
  await expect.poll(async () => (await transport(page)).requests.length).toBe(requestsBefore + 1);
  return dialog;
}

/** Reads measurable geometry or fails with an actionable fixture error.
 * @param locator - Rendered element to measure.
 * @returns Viewport-relative bounding box.
 * @throws When an element is not rendered.
 */
async function box(locator: Locator): Promise<NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>> {
  const result = await locator.boundingBox();
  if (!result) throw new Error("Expected rendered conversation geometry.");
  return result;
}

/** Captures a themed, viewport-labelled rendered verification artifact.
 * @param page - Page being verified.
 * @param info - Current test result.
 * @param label - Artifact label.
 * @param animations - Whether active motion is preserved in the captured frame.
 */
async function capture(
  page: Page,
  info: TestInfo,
  label: string,
  animations: "allow" | "disabled" = "disabled",
): Promise<void> {
  const path = info.outputPath(`${label}.png`);
  await page.screenshot({ path, animations });
  await info.attach(label, { path, contentType: "image/png" });
}

/** Runs a real captured-pointer drag from the handle center.
 * @param page - Active mobile conversation page.
 * @param dx - Horizontal release displacement.
 * @param dy - Vertical release displacement.
 */
async function dragHandle(page: Page, dx: number, dy: number): Promise<void> {
  const handle = page.locator("[data-conversation-handle]");
  const rect = await box(handle);
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 5 });
  await page.mouse.up();
}

/** Installs an opt-in pause for every track in the next mobile morph.
 * @param page - Browser page receiving the animation control.
 */
async function installMobileMorphControl(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let armed = false;
    const captured = new Set<Animation>();
    (window as unknown as { testMobileMorphAnimations: Set<Animation> }).testMobileMorphAnimations = captured;
    const morphSelector = "[data-chat-frame], [data-chat-paint], [data-conversation-composer] [data-slot='input-group'], [data-chat-reveal], [data-conversation-history]";
    window.addEventListener("test-pause-mobile-morph", () => { captured.clear(); armed = true; });
    window.addEventListener("test-release-mobile-morph", () => { armed = false; });
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Forwarded with its original element receiver.
    const animate = Element.prototype.animate;
    /** Pauses each conversation animation created in the armed task. */
    Element.prototype.animate = function controlledAnimate(keyframes, options) {
      const animation = animate.call(this, keyframes, options);
      if (armed && this.matches(morphSelector)) {
        animation.pause();
        captured.add(animation);
      }
      return animation;
    };
  });
}

/** Arms the next mobile morph for synchronous inspection.
 * @param page - Browser page containing the installed animation control.
 */
async function pauseNextMobileMorph(page: Page): Promise<void> {
  await page.evaluate(() => { window.dispatchEvent(new Event("test-pause-mobile-morph")); });
}

/** Waits until the shared mobile composer owns its finite geometry track.
 * @param composer - Input group that must participate in the morph.
 */
async function waitForMobileComposerMorph(composer: Locator): Promise<void> {
  await expect.poll(() => composer.evaluate((element) => element.getAnimations().some((animation) => {
    const endTime = animation.effect?.getComputedTiming().endTime;
    const keyframes = (animation.effect as KeyframeEffect | null)?.getKeyframes() ?? [];
    return typeof endTime === "number" && Number.isFinite(endTime) && endTime > 0
      && keyframes.some((frame) => frame.transform !== undefined || frame.width !== undefined || frame.height !== undefined);
  }))).toBe(true);
}

/** Samples the shared composer after moving all morph tracks to one normalized time.
 * @param shell - Conversation shell owning the motion tracks.
 * @param composer - Shared composer whose geometry must remain continuous.
 * @param progress - Normalized animation progress.
 * @returns Composer geometry, font size, and visible composer count.
 */
async function sampleMobileComposer(
  shell: Locator,
  composer: Locator,
  progress: number,
): Promise<{ actionBottom: number; fontSize: string; height: number; visible: number; width: number; x: number; y: number }> {
  await shell.evaluate(async (_element, fraction) => {
    const captured = (window as unknown as { testMobileMorphAnimations?: Set<Animation> }).testMobileMorphAnimations;
    const animations = [...(captured ?? [])].filter((animation) => {
      const endTime = animation.effect?.getComputedTiming().endTime;
      const keyframes = (animation.effect as KeyframeEffect | null)?.getKeyframes() ?? [];
      return typeof endTime === "number" && Number.isFinite(endTime) && endTime > 0
        && keyframes.some((frame) => frame.transform !== undefined || frame.width !== undefined || frame.height !== undefined
          || frame.clipPath !== undefined || frame.opacity !== undefined);
    });
    if (animations.length === 0) throw new Error("Expected an active mobile conversation morph.");
    for (const animation of animations) {
      const duration = animation.effect?.getComputedTiming().endTime;
      if (typeof duration !== "number") throw new Error("Mobile morph duration must be numeric.");
      animation.currentTime = duration * fraction;
    }
    if (fraction === 0) window.dispatchEvent(new Event("test-release-mobile-morph"));
    await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve(); }); });
  }, progress);
  const rect = await box(composer);
  const action = await box(composer.locator("button").last());
  return {
    actionBottom: action.y + action.height,
    fontSize: await composer.locator("textarea").evaluate((element) => getComputedStyle(element).fontSize),
    height: rect.height,
    visible: await shell.locator("[data-conversation-composer]:visible").count(),
    width: rect.width,
    x: rect.x,
    y: rect.y,
  };
}

/** Resumes paused mobile morph tracks and waits for their completion.
 * @param shell - Conversation shell owning the paused tracks.
 */
async function finishMobileMorph(shell: Locator): Promise<void> {
  await shell.evaluate(async () => {
    const captured = (window as unknown as { testMobileMorphAnimations?: Set<Animation> }).testMobileMorphAnimations;
    const animations = [...(captured ?? [])].filter((animation) => {
      const endTime = animation.effect?.getComputedTiming().endTime;
      return typeof endTime === "number" && Number.isFinite(endTime) && endTime > 0;
    });
    for (const animation of animations) animation.play();
    await Promise.allSettled(animations.map(async (animation) => animation.finished));
    captured?.clear();
  });
}

for (const width of [375, 640, 768, 1024, 1440]) {
  test(`T01/T03 first accepted send alone opens the host at ${String(width)}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installTransport(page);
    await page.goto("/");
    const launcher = await readyEntry(page);
    const input = page.getByRole("textbox", { name: "Your question" });
    if (!await input.isVisible()) await launcher.hover();
    await input.focus();
    await expect(page.getByRole("dialog", { name: "About my work" })).toBeHidden();
    await expect(input).toHaveCount(1);
    await input.fill("   ");
    await input.press("Enter");
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("   ");
    expect((await transport(page)).requests).toHaveLength(0);
    await expect(page.getByRole("dialog", { name: "About my work" })).toBeHidden();
    const dialog = await send(page);
    await expect.poll(async () => (await transport(page)).requests.length).toBe(1);
    await expect(page.getByRole("textbox", { name: "Your question" })).toHaveCount(1);
    expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(width < 640);
    await expect(page.locator("[data-turn]")).toHaveCount(1);
    await input.fill("Pending draft must survive");
    await input.press("Enter");
    await expect(input).toHaveValue("Pending draft must survive");
    expect((await transport(page)).requests).toHaveLength(1);
    await expect(page.locator("[data-turn]")).toHaveCount(1);
  });
}

test.describe("phone conversation", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installTransport(page);
  });

  test("T01 oversized first question preserves entry, draft and focus", async ({ page }) => {
    await page.goto("/");
    await readyEntry(page);
    const input = page.getByRole("textbox", { name: "Your question" });
    await input.evaluate((element) => { element.removeAttribute("maxlength"); });
    await input.fill("x".repeat(12_001));
    await input.press("Enter");
    await expect(input).toHaveValue("x".repeat(12_001));
    await expect(input).toBeFocused();
    await expect(page.getByRole("dialog", { name: "About my work" })).toBeHidden();
    expect((await transport(page)).requests).toHaveLength(0);
  });

  test("T02 document movement folds at the threshold and drafts pin entry", async ({ page }) => {
    await page.goto("/");
    const launcher = await readyEntry(page);
    const input = page.getByRole("textbox", { name: "Your question" });
    await expect(input).toBeVisible();
    await page.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; window.scrollTo(0, 11); });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(11);
    await expect(input).toBeVisible();
    await page.evaluate(() => { window.scrollTo(0, 12); });
    await expect(input).toBeHidden();
    expect((await box(launcher)).height).toBeGreaterThanOrEqual(44);
    await page.evaluate(() => { window.scrollTo(0, 6); });
    await expect(input).toBeHidden();
    await page.evaluate(() => { window.scrollTo(0, 7); });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(7);
    await page.evaluate(() => { window.scrollTo(0, 1); });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(1);
    await expect(input).toBeHidden();
    await page.evaluate(() => { window.visualViewport?.dispatchEvent(new Event("scroll")); });
    await expect(input).toBeHidden();
    await page.evaluate(() => { window.scrollTo(0, 0); });
    await expect(input).toBeVisible();
    await input.fill("Keep this unsent draft visible");
    await input.blur();
    await page.evaluate(() => { window.scrollTo(0, 200); });
    await expect(input).toBeVisible();
    await expect(input).toHaveValue("Keep this unsent draft visible");
    expect((await transport(page)).requests).toHaveLength(0);
  });

  test("T05/T06 accepted sends leave typing mode; suggestions only prefill", async ({ page }) => {
    await page.goto("/");
    await readyEntry(page);
    const dialog = await send(page);
    const input = page.getByRole("textbox", { name: "Your question" });
    await expect(input).not.toBeFocused();
    await expect(page.locator("[data-conversation-handle]")).toBeHidden();
    await emit(page, { text: "Synthetic answer.", done: true, followUps: [{ label: "Explore details", question: "Explain these synthetic details fully." }] });
    await expect(dialog.getByRole("button", { name: "Explore details", exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Explore details", exact: true }).click();
    await expect(input).toHaveValue("Explain these synthetic details fully.");
    await expect(input).toBeFocused();
    await expect(page.locator("[data-conversation-handle]")).toBeVisible();
    expect((await transport(page)).requests).toHaveLength(1);
    await expect(dialog).toHaveAccessibleName("About my work");
    await input.fill("   ");
    await input.press("Enter");
    await expect(page.locator("[data-conversation-handle]")).toBeVisible();
    await expect(input).toBeFocused();
    await send(page, "Accepted follow-up");
    await expect.poll(async () => (await transport(page)).requests.length).toBe(2);
    await expect(input).not.toBeFocused();
    await expect(page.locator("[data-conversation-handle]")).toBeHidden();
  });

  for (const theme of ["light", "dark"] as const) test(`mobile ${theme} submit keeps one control while widening from Send to Stop`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "no-preference" });
    await page.addInitScript((value) => { localStorage.setItem("theme", value); }, theme);
    await page.goto("/");
    await readyEntry(page);
    await send(page, "Complete a first mobile turn");
    await emit(page, { text: "First completed reply.", done: true });
    const surface = page.locator("[data-chat-surface]");
    await expect(surface).not.toHaveAttribute("data-morph");
    const input = page.getByRole("textbox", { name: "Your question" });
    const group = page.locator('[data-conversation-composer] [data-slot="input-group"]');
    await expect(input).toHaveAttribute("placeholder", "Ask about my work…");
    await expect(input).toHaveCSS("font-size", "16px");
    await expect(input).toHaveCSS("line-height", "24px");
    const sendButton = group.getByRole("button", { name: "Send", exact: true });
    const sendHandle = await sendButton.elementHandle();
    const restingGroupBox = await box(group);
    const restingSendBox = await box(sendButton);
    expect(restingGroupBox.height).toBeCloseTo(44, 0);
    expect(restingSendBox.height).toBeCloseTo(36, 0);
    await input.fill("A second question\nwith multiple lines");
    await expect.poll(async () => (await box(group)).height).toBeGreaterThan(44);
    const groupBox = await box(group);
    const inputBox = await box(input);
    const sendBox = await box(sendButton);
    expect(groupBox.height).toBeGreaterThan(44);
    expect(sendBox.height).toBeCloseTo(36, 0);
    expect(Math.abs((inputBox.y + inputBox.height) - (sendBox.y + sendBox.height))).toBeCloseTo(3, 0);
    expect(groupBox.x + groupBox.width - (sendBox.x + sendBox.width)).toBeGreaterThanOrEqual(3);
    expect(groupBox.x + groupBox.width - (sendBox.x + sendBox.width)).toBeLessThanOrEqual(6);
    await sendHandle.evaluate((element) => {
      /** Records a deterministic intermediate frame from the real width transition, then lets it finish.
       * @param event - Width transition entering its active interval.
       */
      const recordIntermediate = (event: Event): void => {
        if (!(event instanceof TransitionEvent) || event.propertyName !== "width") return;
        const animation = element.getAnimations().find((candidate) =>
          (candidate.effect as KeyframeEffect | null)?.getKeyframes().some((frame) => frame.width !== undefined));
        if (!animation) throw new Error("Mobile submit width transition must expose a Web Animation.");
        const duration = animation.effect?.getComputedTiming().duration;
        if (typeof duration !== "number") throw new Error("Mobile submit width duration must be numeric.");
        animation.pause();
        animation.currentTime = duration / 4;
        element.setAttribute("data-test-intermediate-width", String(element.getBoundingClientRect().width));
        animation.play();
        element.removeEventListener("transitionrun", recordIntermediate);
      };
      element.addEventListener("transitionrun", recordIntermediate);
    });
    await sendButton.click();
    await expect.poll(async () => Number(await sendHandle.getAttribute("data-test-intermediate-width"))).toBeGreaterThan(sendBox.width + 1);
    const intermediateWidth = Number(await sendHandle.getAttribute("data-test-intermediate-width"));
    const stop = group.getByRole("button", { name: "Stop", exact: true });
    await expect(stop).toBeVisible();
    await capture(page, testInfo, `mobile-${theme}-stop`);
    expect(await stop.evaluate((element, original) => element === original, sendHandle)).toBe(true);
    const stopBox = await box(stop);
    expect(stopBox.width).toBeCloseTo(56, 0);
    expect(stopBox.height).toBeCloseTo(36, 0);
    expect(stopBox.width).toBeGreaterThan(sendBox.width);
    expect(intermediateWidth).toBeLessThan(stopBox.width - 1);
    expect(groupBox.x + groupBox.width - (stopBox.x + stopBox.width)).toBeGreaterThanOrEqual(3);
    expect(groupBox.x + groupBox.width - (stopBox.x + stopBox.width)).toBeLessThanOrEqual(6);
    const stopPadding = await stop.evaluate((element) => {
      const style = getComputedStyle(element);
      return { left: Number.parseFloat(style.paddingLeft), right: Number.parseFloat(style.paddingRight) };
    });
    expect(stopPadding.left).toBeGreaterThanOrEqual(12);
    expect(stopPadding.right).toBeGreaterThanOrEqual(12);
    await input.fill("Keep this valid draft after stopping");
    await stop.click();
    expect((await transport(page)).requests).toHaveLength(2);
    await expect(input).toHaveValue("Keep this valid draft after stopping");
    const restoredSend = group.getByRole("button", { name: "Send", exact: true });
    await expect(restoredSend).toBeVisible();
    expect(await restoredSend.evaluate((element, original) => element === original, sendHandle)).toBe(true);
  });

  test("the shared mobile composer moves continuously between the page field and fullscreen", async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await installMobileMorphControl(page);
    await page.goto("/");
    await readyEntry(page);
    const shell = page.locator("[data-conversation-shell]");
    const composer = page.locator('[data-conversation-composer] [data-slot="input-group"]');
    const input = page.getByRole("textbox", { name: "Your question" });
    const originalFontSize = await input.evaluate((element) => getComputedStyle(element).fontSize);
    await input.fill("Animate the mobile surface\nwithout collapsing this taller field\nor scaling its text");
    const entryBox = await box(composer);
    const sourceAction = await box(composer.getByRole("button", { name: "Send" }));
    expect(entryBox.height).toBeGreaterThan(44);
    await pauseNextMobileMorph(page);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "About my work" });
    const surface = page.locator("[data-chat-surface]");
    await expect(dialog).toBeVisible();
    await expect(surface).toHaveAttribute("data-morph", "opening");
    await waitForMobileComposerMorph(composer);

    const openingStart = await sampleMobileComposer(shell, composer, 0);
    await capture(page, testInfo, "mobile-field-to-fullscreen-start", "allow");
    const openingMiddle = await sampleMobileComposer(shell, composer, 0.5);
    await capture(page, testInfo, "mobile-field-to-fullscreen-middle", "allow");
    const openingEnd = await sampleMobileComposer(shell, composer, 1);
    await capture(page, testInfo, "mobile-field-to-fullscreen-end", "allow");
    expect(openingStart.x).toBeCloseTo(entryBox.x, 0);
    expect(openingStart.y).toBeCloseTo(entryBox.y, 0);
    expect(openingStart.width).toBeCloseTo(entryBox.width, 0);
    expect(openingStart.height).toBeCloseTo(entryBox.height, 0);
    expect(openingStart.actionBottom).toBeCloseTo(sourceAction.y + sourceAction.height, 0);
    const endCenter = { x: openingEnd.x + openingEnd.width / 2, y: openingEnd.y + openingEnd.height / 2 };
    const openingStartDistance = Math.hypot(
      openingStart.x + openingStart.width / 2 - endCenter.x,
      openingStart.y + openingStart.height / 2 - endCenter.y,
    );
    const openingMiddleDistance = Math.hypot(
      openingMiddle.x + openingMiddle.width / 2 - endCenter.x,
      openingMiddle.y + openingMiddle.height / 2 - endCenter.y,
    );
    expect(openingMiddleDistance).toBeLessThan(openingStartDistance);
    expect([openingStart, openingMiddle, openingEnd].every(({ visible }) => visible === 1)).toBe(true);
    expect([openingStart, openingMiddle, openingEnd].every(({ fontSize }) => fontSize === originalFontSize)).toBe(true);
    await finishMobileMorph(shell);
    await expect(surface).not.toHaveAttribute("data-morph");

    await pauseNextMobileMorph(page);
    await page.getByRole("button", { name: "Close conversation" }).click();
    await expect(surface).toHaveAttribute("data-morph", "closing");
    await waitForMobileComposerMorph(composer);
    const closingStart = await sampleMobileComposer(shell, composer, 0);
    await capture(page, testInfo, "mobile-fullscreen-to-field-start", "allow");
    const closingMiddle = await sampleMobileComposer(shell, composer, 0.5);
    await capture(page, testInfo, "mobile-fullscreen-to-field-middle", "allow");
    const closingEnd = await sampleMobileComposer(shell, composer, 1);
    await capture(page, testInfo, "mobile-fullscreen-to-field-end", "allow");
    const closeTarget = { x: closingEnd.x + closingEnd.width / 2, y: closingEnd.y + closingEnd.height / 2 };
    const closingStartDistance = Math.hypot(
      closingStart.x + closingStart.width / 2 - closeTarget.x,
      closingStart.y + closingStart.height / 2 - closeTarget.y,
    );
    const closingMiddleDistance = Math.hypot(
      closingMiddle.x + closingMiddle.width / 2 - closeTarget.x,
      closingMiddle.y + closingMiddle.height / 2 - closeTarget.y,
    );
    expect(closingStartDistance).toBeLessThanOrEqual(1);
    expect(closingMiddleDistance).toBeLessThanOrEqual(1);
    expect([closingStart, closingMiddle, closingEnd].every(({ visible }) => visible === 1)).toBe(true);
    expect([closingStart, closingMiddle, closingEnd].every(({ fontSize }) => fontSize === originalFontSize)).toBe(true);
    await finishMobileMorph(shell);
    await expect(dialog).toBeHidden();
    await expect(surface).not.toHaveAttribute("data-morph");
  });

  test("reduced motion moves the shared composer immediately between page and fullscreen", async ({ page }) => {
    await page.goto("/");
    await readyEntry(page);
    const input = page.getByRole("textbox", { name: "Your question" });
    await input.fill("Skip mobile surface motion");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "About my work" });
    await expect(dialog).toBeVisible();
    await expect(page.locator("[data-chat-surface]")).not.toHaveAttribute("data-morph");
    await expect(page.locator("[data-conversation-composer]:visible")).toHaveCount(1);
    await page.getByRole("button", { name: "Close conversation" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator("[data-chat-surface]")).not.toHaveAttribute("data-morph");
  });

  test("T07/T11 modality contains focus and restores page styles, offset and draft", async ({ page }) => {
    await page.goto("/");
    const launcher = await readyEntry(page);
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = "auto";
      document.documentElement.style.overflowX = "clip";
      document.body.style.overflowY = "visible";
      window.scrollTo(0, 240);
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(240);
    await launcher.hover();
    const before = await page.evaluate(() => ({ root: document.documentElement.style.cssText, body: document.body.style.cssText, y: window.scrollY }));
    const dialog = await send(page);
    const lockedY = await page.evaluate(() => window.scrollY);
    await page.mouse.move(1, 400);
    await page.mouse.wheel(0, 500);
    expect(await page.evaluate(() => window.scrollY)).toBe(lockedY);
    await expect(dialog).not.toHaveAttribute("tabindex");
    expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
    for (const key of ["Tab", "Tab", "Tab", "Shift+Tab", "Shift+Tab"]) {
      await page.keyboard.press(key);
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    }
    await emit(page, { text: "Retained history.", done: true });
    const input = page.getByRole("textbox", { name: "Your question" });
    await input.fill("Retained draft");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(launcher).toBeFocused();
    await expect.poll(() => page.evaluate(() => ({ root: document.documentElement.style.cssText, body: document.body.style.cssText, y: window.scrollY }))).toEqual(before);
    await launcher.click();
    await expect(dialog).toBeVisible();
    await expect(input).toHaveValue("Retained draft");
    await expect(input).not.toBeFocused();
    await expect(page.locator("[data-conversation-handle]")).toBeHidden();
    await expect(page.locator("[data-answer]")).toHaveText("Retained history.");
    expect((await transport(page)).requests).toHaveLength(1);
  });

  for (const gesture of [
    { label: "below distance", dx: 0, dy: 63, closes: false },
    { label: "at distance", dx: 0, dy: 64, closes: true },
    { label: "at dominance", dx: 44, dy: 66, closes: true },
    { label: "below dominance", dx: 44, dy: 65, closes: false },
    { label: "horizontal", dx: 80, dy: 10, closes: false },
    { label: "upward", dx: 0, dy: -20, closes: false },
  ]) {
    test(`T08 handle drag ${gesture.label} preserves threshold and click suppression`, async ({ page }) => {
      await page.goto("/");
      await readyEntry(page);
      const dialog = await send(page);
      const input = page.getByRole("textbox", { name: "Your question" });
      await input.fill("Retain during dismissal");
      await expect(page.locator("[data-conversation-handle]")).toBeVisible();
      await dragHandle(page, gesture.dx, gesture.dy);
      if (gesture.closes) {
        await expect(dialog).toBeHidden();
        await expect.poll(async () => (await transport(page)).aborted).toEqual([0]);
        await page.locator("button[data-launcher]").click();
        await expect(input).toHaveValue("Retain during dismissal");
      } else {
        await expect(dialog).toBeVisible();
        expect((await transport(page)).aborted).toEqual([]);
      }
      expect((await transport(page)).requests).toHaveLength(1);
    });
  }

  for (const activation of ["click", "Enter", "Space", "Escape"]) {
    test(`T08 accessible handle ${activation} dismisses once with safe focus`, async ({ page }) => {
      await page.goto("/");
      const launcher = await readyEntry(page);
      const dialog = await send(page);
      await page.getByRole("textbox", { name: "Your question" }).focus();
      const handle = page.locator("[data-conversation-handle]");
      await expect(handle).toHaveAccessibleName("Close conversation");
      await handle.focus();
      await expect(handle).toBeVisible();
      if (activation === "click") await handle.click();
      else await handle.press(activation);
      await expect(dialog).toBeHidden();
      await expect(launcher).toBeFocused();
      await expect.poll(async () => (await transport(page)).aborted).toEqual([0]);
    });
  }

  test("T08 cancelled capture suppresses its click and transcript gestures never dismiss", async ({ page }) => {
    await page.goto("/");
    await readyEntry(page);
    const dialog = await send(page);
    await page.getByRole("textbox", { name: "Your question" }).focus();
    const handle = page.locator("[data-conversation-handle]");
    const handleBox = await box(handle);
    const x = handleBox.x + handleBox.width / 2;
    const y = handleBox.y + handleBox.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 20);
    await handle.dispatchEvent("pointercancel", { pointerId: 1 });
    await page.mouse.up();
    await expect(dialog).toBeVisible();
    await page.locator("[data-conversation-history]").dispatchEvent("pointerdown", { pointerId: 8, clientX: 100, clientY: 100 });
    await page.locator("[data-conversation-history]").dispatchEvent("pointerup", { pointerId: 8, clientX: 100, clientY: 300 });
    await expect(dialog).toBeVisible();
    expect((await transport(page)).aborted).toEqual([]);
  });

  test("T09 question anchor stays stable through chunks and yields to reader scrolling", async ({ page }) => {
    await page.goto("/");
    await readyEntry(page);
    await send(page, "First anchored question");
    const history = page.locator("[data-conversation-history]");
    const question = page.locator("[data-turn]").last();
    await expect.poll(async () => Math.abs((await box(question)).y - (await box(history)).y)).toBeLessThanOrEqual(4);
    const anchoredY = (await box(question)).y;
    await emit(page, { text: Array.from({ length: 30 }, (_, index) => `Synthetic paragraph ${String(index)}. Reading stays intentional.\n\n`).join("") });
    await expect(page.locator("[data-answer]")).toContainText("Synthetic paragraph 29");
    expect(Math.abs((await box(question)).y - anchoredY)).toBeLessThanOrEqual(4);
    await history.hover();
    await page.mouse.wheel(0, 180);
    await expect.poll(() => history.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
    const readerTop = await history.evaluate((element) => element.scrollTop);
    await emit(page, { text: "Final synthetic paragraph.", done: true, followUps: [{ label: "Next", question: "What comes next?" }] });
    await expect(page.locator("[data-answer]")).toContainText("Final synthetic paragraph.");
    expect(Math.abs(await history.evaluate((element) => element.scrollTop) - readerTop)).toBeLessThanOrEqual(4);
    await page.keyboard.press("Escape");
    await page.locator("button[data-launcher]").click();
    await expect(page.getByRole("dialog", { name: "About my work" })).toBeVisible();
    expect(Math.abs(await history.evaluate((element) => element.scrollTop) - readerTop)).toBeLessThanOrEqual(4);
  });

  test("T10 retry keeps one turn and footer recovery; suggestions stay local", async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          /** Accepts copied reply text for temporary-feedback verification.
           * @param _value - Plain-text reply selected for copying.
           * @returns A resolved clipboard operation.
           */
          writeText: (_value: string) => Promise.resolve(),
        },
      });
    });
    await page.goto("/");
    await readyEntry(page);
    await send(page);
    await emit(page, { error: "Synthetic controlled failure." });
    await expect(page.getByRole("button", { name: "Retry message" })).toBeVisible();
    await page.getByRole("button", { name: "Retry message" }).click();
    await expect.poll(async () => (await transport(page)).requests.length).toBe(2);
    await expect(page.locator("[data-turn]")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
    const composer = page.locator('[data-conversation-composer] [data-slot="input-group"]');
    const restingComposerBox = await box(composer);
    await emit(page, { text: "Recovered reply.", done: true, followUps: [
      { label: "Topic one", question: "Explain synthetic topic one." },
      { label: "Topic two", question: "Explain synthetic topic two." },
    ] });
    await expect(page.locator("[data-answer]")).toHaveText("Recovered reply.");
    const firstTurn = page.locator("[data-turn]").first();
    const actions = firstTurn.locator("[data-answer-actions]");
    const copy = actions.getByRole("button", { name: "Copy reply", exact: true });
    const retry = actions.getByRole("button", { name: "Retry message", exact: true });
    await expect(copy).toBeVisible();
    await expect(retry).toBeVisible();
    await expect(copy).toHaveText("");
    await expect(retry).toHaveText("");
    await expect(copy.locator("[data-copy-icon]")).toHaveCount(2);
    await expect(retry.locator("svg")).toHaveCount(1);
    const actionsBox = await box(actions);
    const answerBox = await box(firstTurn.locator("[data-answer]"));
    const copyBox = await box(copy);
    const retryBox = await box(retry);
    expect(Math.abs(actionsBox.x - answerBox.x)).toBeLessThanOrEqual(4);
    expect(Math.abs(copyBox.x - actionsBox.x)).toBeLessThanOrEqual(4);
    expect(retryBox.x).toBeGreaterThan(copyBox.x + copyBox.width);
    expect(copyBox.height).toBeGreaterThanOrEqual(44);
    expect(retryBox.height).toBeGreaterThanOrEqual(44);
    expect(Math.abs(copyBox.width - copyBox.height)).toBeLessThanOrEqual(2);
    expect(Math.abs(retryBox.width - retryBox.height)).toBeLessThanOrEqual(2);
    const suggestions = page.locator('[data-mobile-suggestions]');
    await expect(suggestions.getByRole("button")).toHaveCount(2);
    const first = await box(suggestions.getByRole("button").first());
    const last = await box(suggestions.getByRole("button").last());
    expect(Math.abs(first.y - last.y)).toBeLessThanOrEqual(1);
    expect(first.height).toBeCloseTo(36, 0);
    expect(last.height).toBeCloseTo(36, 0);
    expect(Math.abs(first.width - last.width)).toBeLessThanOrEqual(2);
    const row = await box(suggestions);
    expect(first.x - row.x).toBeGreaterThanOrEqual(2);
    expect(first.x - row.x).toBeLessThanOrEqual(4);
    expect(row.x + row.width - (last.x + last.width)).toBeGreaterThanOrEqual(2);
    expect(row.x + row.width - (last.x + last.width)).toBeLessThanOrEqual(4);

    const input = page.getByRole("textbox", { name: "Your question" });
    const sendButton = composer.getByRole("button", { name: "Send", exact: true });
    const composerBox = await box(composer);
    const inputBox = await box(input);
    const sendBox = await box(sendButton);
    expect(composerBox.height).toBeGreaterThan(restingComposerBox.height + 24);
    expect(composerBox.y).toBeLessThan(restingComposerBox.y);
    expect(composerBox.y + composerBox.height).toBeCloseTo(restingComposerBox.y + restingComposerBox.height, 0);
    expect(row.x - composerBox.x).toBeGreaterThanOrEqual(0);
    expect(row.x - composerBox.x).toBeLessThanOrEqual(2);
    expect(composerBox.width - row.width).toBeGreaterThanOrEqual(0);
    expect(composerBox.width - row.width).toBeLessThanOrEqual(2);
    expect(row.y + row.height).toBeLessThanOrEqual(inputBox.y + 1);
    expect(sendBox.x).toBeGreaterThan(inputBox.x);
    expect(Math.abs((sendBox.y + sendBox.height / 2) - (inputBox.y + inputBox.height / 2))).toBeLessThanOrEqual(2);
    expect(sendBox.height).toBeCloseTo(36, 0);
    expect(composerBox.y + composerBox.height - (sendBox.y + sendBox.height)).toBeCloseTo(4, 0);
    await expect(sendButton).toHaveText("");
    await expect(sendButton.locator("svg")).toHaveCount(1);
    await expect(sendButton).toHaveCSS("background-image", "none");
    await capture(page, testInfo, "mobile-followup-pills");

    await copy.click();
    await expect(actions.getByRole("button", { name: "Copied" })).toBeVisible();
    await expect(actions.getByRole("button", { name: "Copy reply" })).toBeVisible({ timeout: 2_500 });

    await send(page, "Second synthetic question");
    await emit(page, { text: "Second recovered reply.", done: true });
    await expect(page.locator("[data-turn]")).toHaveCount(2);
    const secondTurn = page.locator("[data-turn]").last();
    const settledActionsBox = await box(actions);
    expect(settledActionsBox.y + settledActionsBox.height).toBeLessThanOrEqual((await box(secondTurn)).y + 1);
    await capture(page, testInfo, "mobile-two-turn-footer");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("retained mobile history unfolds a field on downward scroll and reopens the same thread", async ({ page }) => {
    await page.goto("/");
    const launcher = await readyEntry(page);
    const dialog = await send(page, "Retain this mobile thread");
    await emit(page, { text: "Retained mobile answer.", done: true });
    await page.getByRole("button", { name: "Close conversation" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator("[data-edge-entry]")).toHaveAttribute("data-entry-revealed", "false");
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = "auto";
      window.scrollTo(0, 0);
    });
    await page.evaluate(() => { window.scrollTo(0, 200); });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expect(page.locator("[data-edge-entry]")).toHaveAttribute("data-entry-revealed", "true");
    await expect(launcher).toHaveAttribute("aria-expanded", "false");
    await expect(launcher).toHaveAccessibleName("Ask about my work…");
    await expect(launcher).toContainText("Ask about my work");
    expect((await box(launcher)).height).toBeCloseTo(44, 0);
    await launcher.click();
    await expect(dialog).toBeVisible();
    await expect(page.locator("[data-answer]")).toHaveText("Retained mobile answer.");
    expect((await transport(page)).requests).toHaveLength(1);
  });

  test("T11 New chat rejects stale callbacks and keeps an empty fullscreen composer", async ({ page }) => {
    await page.goto("/");
    const launcher = await readyEntry(page);
    const dialog = await send(page);
    await emit(page, { text: "Partial before reset." });
    await expect(dialog).toHaveAccessibleName("About my work");
    await expect(dialog.locator("[data-header-chrome] span").filter({ hasText: /^About my work$/u })).toHaveCount(0);
    const newChat = page.getByRole("button", { name: "New chat" });
    const surfaceBoxBeforeReset = await box(dialog);
    const newChatBox = await box(newChat);
    expect(newChatBox.x).toBeLessThan(surfaceBoxBeforeReset.x + surfaceBoxBeforeReset.width / 2);
    expect(newChatBox.y).toBeLessThan(surfaceBoxBeforeReset.y + surfaceBoxBeforeReset.height / 4);
    const resetPaint = page.evaluate(() => new Promise<Array<{ boxShadow: string; connected: boolean; focusVisible: boolean; outlineColor: string; outlineStyle: string }>>((resolve) => {
      const button = document.querySelector<HTMLButtonElement>('[aria-label="New chat"]');
      if (!button) throw new Error("New chat must exist before pointer reset.");
      button.addEventListener("click", () => {
        const frames: Array<{ boxShadow: string; connected: boolean; focusVisible: boolean; outlineColor: string; outlineStyle: string }> = [];
        let remaining = 18;
        /** Records one pointer-reset paint frame. */
        const sample = (): void => {
          const style = getComputedStyle(button);
          frames.push({
            boxShadow: style.boxShadow,
            connected: button.isConnected,
            focusVisible: button.matches(":focus-visible"),
            outlineColor: style.outlineColor,
            outlineStyle: style.outlineStyle,
          });
          remaining -= 1;
          if (remaining === 0) resolve(frames);
          else requestAnimationFrame(sample);
        };
        sample();
      }, { once: true });
    }));
    await newChat.click();
    const resetFrames = await resetPaint;
    const paintedResetFrames = resetFrames.filter(({ connected }) => connected);
    expect(paintedResetFrames.length).toBeGreaterThan(0);
    expect(paintedResetFrames.every(({ boxShadow, focusVisible, outlineColor, outlineStyle }) => (
      !focusVisible && boxShadow === "none" && (outlineStyle === "none" || outlineColor === "rgba(0, 0, 0, 0)")
    )), JSON.stringify(resetFrames)).toBe(true);
    await expect(dialog).toBeVisible();
    await expect(page.locator("[data-turn]")).toHaveCount(0);
    const input = page.getByRole("textbox", { name: "Your question" });
    await expect(input).toBeVisible();
    await expect(input).toHaveValue("");
    await expect(input).toBeFocused();
    const dialogBox = await box(dialog);
    const composerBox = await box(page.locator("[data-conversation-composer]"));
    expect(composerBox.y + composerBox.height).toBeGreaterThan(dialogBox.y + dialogBox.height / 2);
    await expect(page.locator("[data-conversation-composer]:visible")).toHaveCount(1);
    await expect.poll(async () => (await transport(page)).aborted).toEqual([0]);
    await emit(page, { request: 0, text: "Stale answer must not return.", done: true });
    await expect(page.locator("[data-turn]")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(launcher).toBeHidden();
    await expect(input).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(input).toHaveValue("");
    expect((await transport(page)).requests).toHaveLength(1);
  });

  test("T12 both responsive transfers preserve one composer and live request", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await readyEntry(page);
    await send(page);
    await emit(page, { text: "Before transfer. " });
    const input = page.getByRole("textbox", { name: "Your question" });
    await input.fill("Draft through transfer");
    const paint = page.locator("[data-chat-paint]");
    await paint.evaluate(async (element) => {
      await Promise.allSettled(element.getAnimations().map(async (animation) => animation.finished));
      document.documentElement.dataset.transferClipCount = "0";
      // eslint-disable-next-line @typescript-eslint/unbound-method -- Forwarded with the original element receiver.
      const animate = Element.prototype.animate;
      /** Records any clip transition incorrectly replayed by a responsive host transfer. */
      Element.prototype.animate = function transferAwareAnimate(keyframes, options) {
        const animation = animate.call(this, keyframes, options);
        if (this.hasAttribute("data-chat-paint")
          && (animation.effect as KeyframeEffect | null)?.getKeyframes().some((frame) => frame.clipPath !== undefined)) {
          const root = document.documentElement;
          root.dataset.transferClipCount = String(Number(root.dataset.transferClipCount ?? "0") + 1);
        }
        return animation;
      };
    });
    for (const width of [640, 639, 768, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const dialog = page.getByRole("dialog", { name: "About my work" });
      await expect(dialog).toBeVisible();
      await expect.poll(() => dialog.evaluate((element) => element.matches(":modal"))).toBe(width < 640);
      await expect(input).toHaveCount(1);
      await expect(input).toHaveValue("Draft through transfer");
      await expect(page.locator("#portfolio-conversation")).toHaveCount(1);
      await page.evaluate(async () => {
        await new Promise<void>((resolve) => { requestAnimationFrame(() => { requestAnimationFrame(() => { resolve(); }); }); });
      });
      expect(await page.locator("html").getAttribute("data-transfer-clip-count")).toBe("0");
      expect(await page.locator("[data-chat-paint]").evaluate((element) => element.getAnimations().some((animation) =>
        (animation.playState === "running" || animation.pending)
        && (animation.effect as KeyframeEffect | null)?.getKeyframes().some((frame) => frame.clipPath !== undefined)))).toBe(false);
      expect((await transport(page)).requests).toHaveLength(1);
      expect((await transport(page)).aborted).toEqual([]);
    }
    await emit(page, { text: "After transfer.", done: true });
    await expect(page.locator("[data-answer]")).toHaveText("Before transfer. After transfer.");
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 640, height: 844 });
    await expect(page.getByRole("dialog", { name: "About my work" })).toBeHidden();
  });

  test("T12 stale native closure cannot cancel transferred host; fresh closure does", async ({ page }) => {
    await page.goto("/");
    await readyEntry(page);
    await send(page);
    await page.locator("[data-chat-surface]").evaluate((element) => { Object.assign(window, { oldAskHost: element }); });
    await page.setViewportSize({ width: 640, height: 844 });
    await expect.poll(() => page.locator("[data-chat-surface]").evaluate((element) => element.matches(":popover-open"))).toBe(true);
    await page.evaluate(() => {
      const old = (window as Window & { oldAskHost?: HTMLElement }).oldAskHost;
      old?.dispatchEvent(new Event("close"));
      old?.dispatchEvent(new ToggleEvent("toggle", { oldState: "open", newState: "closed" }));
    });
    await expect(page.getByRole("dialog", { name: "About my work" })).toBeVisible();
    expect((await transport(page)).aborted).toEqual([]);
    await page.locator("[data-chat-surface]").evaluate((element) => { (element as HTMLElement).hidePopover(); });
    await expect(page.getByRole("dialog", { name: "About my work" })).toBeHidden();
    await expect.poll(async () => (await transport(page)).aborted).toEqual([0]);
  });

  test("T13 same-path citation releases modality without overriding destination", async ({ page }) => {
    await page.goto("/");
    await readyEntry(page);
    const dialog = await send(page);
    await emit(page, { text: "Read the synthetic source [1].", done: true, sources: [{ id: "section:contact", title: "Synthetic source", href: "/#contact" }] });
    const citation = page.getByRole("link", { name: "Source 1: Synthetic source" });
    await expect(citation).toHaveAttribute("href", "/#contact");
    await citation.click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/#contact$/);
    await expect.poll(() => page.locator("#contact").evaluate((element) => Math.abs(element.getBoundingClientRect().top))).toBeLessThan(200);
    expect(await page.evaluate(() => document.documentElement.style.overflow)).not.toBe("hidden");
  });
});

for (const theme of ["light", "dark"] as const) {
  for (const viewport of [{ width: 375, height: 812 }, { width: 390, height: 844 }, { width: 568, height: 320 }]) {
    test(`T04/T15 ${theme} entry and modal fit ${String(viewport.width)}x${String(viewport.height)}`, async ({ page }, info) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript((value) => { localStorage.setItem("theme", value); }, theme);
      await installTransport(page);
      await page.goto("/");
      await readyEntry(page);
      const input = page.getByRole("textbox", { name: "Your question" });
      const contactInput = page.locator("#contact-name");
      await expect(input).toBeVisible();
      const group = page.locator('[data-conversation-composer] [data-slot="input-group"]');
      const sendButton = group.getByRole("button", { name: "Send", exact: true });
      const initialGroupHeight = (await box(group)).height;
      expect(initialGroupHeight).toBeCloseTo(44, 0);
      expect((await box(sendButton)).height).toBeCloseTo(36, 0);
      await input.fill("A multiline draft\nwith another line\nand a final line.");
      const entryBox = await box(input);
      const fadeBox = await box(page.locator("[data-entry-fade]"));
      expect(entryBox.x).toBeGreaterThanOrEqual(0);
      expect(entryBox.x + entryBox.width).toBeLessThanOrEqual(viewport.width);
      expect(entryBox.y + entryBox.height).toBeLessThanOrEqual(viewport.height);
      expect((await box(group)).height).toBeGreaterThan(44);
      await expect(input).toHaveAttribute("placeholder", "Ask about my work…");
      await expect(input).toHaveCSS("font-size", "16px");
      await expect(input).toHaveCSS("line-height", "24px");
      await expect(contactInput).toHaveCSS("font-size", "16px");
      await expect(contactInput).toHaveCSS("line-height", "24px");
      expect((await box(contactInput)).height).toBeCloseTo(initialGroupHeight, 0);
      const sharedFieldPaint = await page.evaluate(() => {
        const ask = document.querySelector<HTMLElement>('[data-conversation-composer] [data-slot="input-group"]');
        const contact = document.querySelector<HTMLElement>("#contact-name");
        if (!ask || !contact) throw new Error("Ask and Contact fields must both be rendered.");
        /**
         * Reads the shared field paint properties.
         * @param element - Rendered field surface.
         * @returns Comparable field paint values.
         */
        const pick = (element: HTMLElement) => {
          const style = getComputedStyle(element);
          return {
            backgroundColor: style.backgroundColor,
            backgroundImage: style.backgroundImage,
            borderRadius: style.borderRadius,
          };
        };
        return { ask: pick(ask), contact: pick(contact) };
      });
      expect(sharedFieldPaint.contact).toEqual(sharedFieldPaint.ask);
      expect((await box(sendButton)).height).toBeCloseTo(36, 0);
      const multilineGroupBox = await box(group);
      const multilineSendBox = await box(sendButton);
      expect(multilineGroupBox.y + multilineGroupBox.height - (multilineSendBox.y + multilineSendBox.height)).toBeCloseTo(4, 0);
      await expect(sendButton).toHaveAccessibleName("Send");
      await expect(sendButton).toHaveText("");
      await expect(sendButton.locator("svg")).toHaveCount(1);
      await expect(sendButton).toHaveCSS("background-image", "none");
      const groupPaint = await group.evaluate((element) => {
        const sample = document.createElement("span");
        sample.style.backgroundColor = "var(--background)";
        document.body.append(sample);
        const expected = getComputedStyle(sample).backgroundColor;
        sample.remove();
        const actual = getComputedStyle(element);
        return { backgroundColor: actual.backgroundColor, backgroundImage: actual.backgroundImage, expected };
      });
      if (theme === "dark") expect(groupPaint.backgroundImage).not.toBe("none");
      else expect(groupPaint.backgroundColor).toBe(groupPaint.expected);
      await expect(group).toHaveCSS("opacity", "1");
      expect(fadeBox.x).toBeCloseTo(0, 0);
      expect(fadeBox.width).toBeCloseTo(viewport.width, 0);
      const backdropFilters = await page.locator("[data-edge-entry]").evaluate((element) =>
        [element, ...element.querySelectorAll("*")].map((node) => getComputedStyle(node).backdropFilter));
      expect(backdropFilters.every((value) => value === "none")).toBe(true);
      await capture(page, info, `${theme}-entry-${String(viewport.width)}`);
      const dialog = await send(page);
      const surfaceBox = await box(dialog);
      expect(surfaceBox.x).toBeGreaterThanOrEqual(0);
      expect(surfaceBox.y).toBeGreaterThanOrEqual(0);
      expect(surfaceBox.x + surfaceBox.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(surfaceBox.y + surfaceBox.height).toBeLessThanOrEqual(viewport.height + 1);
      await emit(page, { text: "Synthetic answer with a readable mobile layout.", done: true });
      await expect(page.locator('[role="log"]')).toHaveAttribute("aria-live", "off");
      await expect(page.locator("[data-conversation-status]")).toHaveText("Answer complete.");
      await capture(page, info, `${theme}-reading-${String(viewport.width)}`);
      await input.focus();
      await expect(page.locator("[data-conversation-handle]")).toBeVisible();
      await expect(dialog).toHaveAccessibleName("About my work");
      await capture(page, info, `${theme}-typing-${String(viewport.width)}`);
    });
  }
}

for (const available of [true, false]) {
  test(`T06 focus owns typing with visualViewport ${available ? "available" : "unavailable"}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript((enabled) => {
      if (!enabled) {
        Object.defineProperty(window, "visualViewport", { configurable: true, value: undefined });
        return;
      }
      const viewport = new EventTarget();
      Object.assign(viewport, { width: 390, height: 844, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1 });
      Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
      window.addEventListener("ask-fixture-viewport", (event) => {
        Object.assign(viewport, (event as CustomEvent<{ height: number }>).detail);
        viewport.dispatchEvent(new Event("resize"));
      });
    }, available);
    await installTransport(page);
    await page.goto("/");
    await readyEntry(page);
    const dialog = await send(page);
    const handle = page.locator("[data-conversation-handle]");
    if (available) {
      await page.evaluate(() => { window.dispatchEvent(new CustomEvent("ask-fixture-viewport", { detail: { height: 700 } })); });
      await expect(handle).toBeHidden();
    }
    const input = page.getByRole("textbox", { name: "Your question" });
    await input.focus();
    await expect(handle).toBeVisible();
    await handle.focus();
    await expect(handle).toBeVisible();
    if (available) {
      await page.evaluate(() => { window.dispatchEvent(new CustomEvent("ask-fixture-viewport", { detail: { height: 400 } })); });
      await page.evaluate(() => { window.dispatchEvent(new CustomEvent("ask-fixture-viewport", { detail: { height: 844 } })); });
      await expect(handle).toBeFocused();
      await expect(handle).toBeVisible();
    }
    await expect(dialog).toHaveAccessibleName("About my work");
    await handle.press("Enter");
    await expect(dialog).toBeHidden();
  });
}

test("T03 wide touch entry does not need hover and ignores document scroll", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 768, height: 900 }, hasTouch: true, reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    await installTransport(page);
    await page.goto("http://127.0.0.1:3192/");
    await (await readyEntry(page)).tap();
    const input = page.getByRole("textbox", { name: "Your question" });
    await expect(input).toBeVisible();
    await input.fill("Persistent wide touch draft");
    await page.evaluate(() => { window.scrollTo(0, 400); });
    await expect(input).toBeVisible();
    const dialog = await send(page);
    expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(false);
    expect((await transport(page)).requests).toHaveLength(1);
  } finally {
    await context.close();
  }
});

test("T13 external editable folds the form but keeps the AI line visible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await readyEntry(page);
  const input = page.getByRole("textbox", { name: "Your question" });
  await input.focus();
  await expect(input).toBeVisible();
  const externalInput = page.locator("#contact textarea, #contact input:not([type=hidden])").first();
  await externalInput.focus();
  await expect(input).toBeHidden();
  await expect(externalInput).toBeFocused();
  const stroke = page.locator("[data-entry-stroke]");
  await expect(stroke).toBeVisible();
  expect((await box(stroke)).width).toBeGreaterThan(80);
  expect((await box(stroke)).height).toBeGreaterThan(2);
  await expect(stroke).not.toHaveCSS("background-image", "none");
});

test("mobile typing animates the expanded header into a thinner close handle", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installTransport(page);
  await page.goto("/");
  await readyEntry(page);
  await send(page, "Measure compact typing chrome");
  await emit(page, { text: "Completed answer.", done: true });
  const input = page.getByRole("textbox", { name: "Your question" });
  await input.blur();
  const header = page.locator("[data-header-chrome]");
  await expect(header).toBeVisible();
  const expandedHeight = (await box(header)).height;
  const heightTrace = page.evaluate(() => new Promise<number[]>((resolve) => {
    const frames: number[] = [];
    const inputElement = document.querySelector<HTMLTextAreaElement>('[data-conversation-composer] textarea[name="question"]');
    if (!inputElement) throw new Error("Conversation textarea must exist before typing transition.");
    inputElement.addEventListener("focus", () => {
      let remaining = 30;
      /** Records one compact-header transition frame. */
      const sample = (): void => {
        const chrome = document.querySelector<HTMLElement>("[data-header-chrome]");
        frames.push(chrome?.getBoundingClientRect().height ?? 0);
        remaining -= 1;
        if (remaining === 0) resolve(frames);
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }, { once: true });
  }));
  await input.focus();
  const heights = await heightTrace;
  const handle = page.locator("[data-conversation-handle]");
  await expect(handle).toBeVisible();
  const compactHeight = (await box(header)).height;
  expect((await box(handle)).height).toBeGreaterThanOrEqual(44);
  expect(compactHeight).toBeLessThan(expandedHeight - 8);
  expect(heights.some((height) => height > compactHeight + 1 && height < expandedHeight - 1), JSON.stringify(heights)).toBe(true);
});

test("T15 failed animation setup leaves a usable named modal and forced-color handle", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await installTransport(page);
  await page.goto("/");
  await readyEntry(page);
  await page.evaluate(() => {
    Element.prototype.animate = () => { throw new Error("Synthetic animation setup failure"); };
  });
  const dialog = await send(page);
  await page.getByRole("textbox", { name: "Your question" }).focus();
  const handle = page.locator("[data-conversation-handle]");
  await page.keyboard.press("Shift+Tab");
  await expect(handle).toBeFocused();
  await expect(handle).toBeVisible();
  await expect(handle).toHaveAccessibleName("Close conversation");
  await expect(handle).not.toHaveCSS("outline-style", "none");
  await page.getByRole("textbox", { name: "Your question" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeFocused();
  await expect(handle).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(handle).toBeFocused();
  await expect(handle).not.toHaveCSS("outline-style", "none");
  await handle.press("Space");
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.style.overflow)).not.toBe("hidden");
});

test("T13 modified citation preserves thread; same-tab route exit releases lock", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installTransport(page);
  await page.goto("/");
  await readyEntry(page);
  const dialog = await send(page);
  await emit(page, { text: "Explore synthetic sources [1].", done: true, sources: [{ id: "section:projects", title: "Synthetic collection", href: "/projects" }] });
  const citation = page.getByRole("link", { name: "Source 1: Synthetic collection" });
  const newPage = context.waitForEvent("page");
  await citation.click({ modifiers: ["ControlOrMeta"] });
  const opened = await newPage;
  await opened.close();
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
  await citation.click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.style.overflow)).not.toBe("hidden");
  await page.locator("button[data-launcher]").click();
  await expect(page.locator("[data-answer]")).toHaveText("Explore synthetic sources [1].");
  expect((await transport(page)).requests).toHaveLength(1);
});

test("T10 lone long follow-up remains a local row and hides while drafting", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await installTransport(page);
  await page.goto("/");
  await readyEntry(page);
  await send(page);
  const label = "Long synthetic question label for local horizontal scroll";
  await emit(page, { text: "One synthetic answer.", done: true, followUps: [{ label, question: "Explain this synthetic subject in more detail." }] });
  const row = page.locator("[data-mobile-suggestions]");
  await expect(row.getByRole("button")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await row.getByRole("button").click();
  await expect(row).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Your question" })).toHaveValue("Explain this synthetic subject in more detail.");
  expect((await transport(page)).requests).toHaveLength(1);
});

test("T02 desktop-to-phone at top unfolds, and clearing a scrolled draft keeps top entry visible", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installTransport(page);
  await page.goto("/");
  await readyEntry(page);
  const input = page.getByRole("textbox", { name: "Your question" });
  await expect(input).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(input).toBeVisible();
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; window.scrollTo(0, 200); });
  await expect(input).toBeHidden();
  await page.locator("button[data-launcher]").click();
  await input.fill("Pinned draft while returning to page top");
  await page.evaluate(() => { window.scrollTo(0, 0); });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await input.fill("");
  await input.blur();
  await expect(input).toBeVisible();
  await expect(page.locator("[data-edge-entry]")).toHaveAttribute("data-entry-revealed", "true");
  await expect(page.getByRole("dialog", { name: "About my work" })).toBeHidden();
  expect((await transport(page)).requests).toHaveLength(0);
});

test("T08 handle shows drag displacement and restores after cancel or multi-pointer interruption", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installTransport(page);
  await page.goto("/");
  await readyEntry(page);
  const dialog = await send(page);
  await page.getByRole("textbox", { name: "Your question" }).focus();
  const handle = page.locator("[data-conversation-handle]");
  const pointerIds: number[] = [];
  for (const interruption of ["pointercancel", "lostpointercapture", "second-pointer"] as const) {
    const rect = await box(handle);
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height / 2;
    await page.mouse.move(x, y);
    await handle.evaluate((element) => {
      element.removeAttribute("data-test-pointer-id");
      /** Records the primary browser pointer identity used by the real mouse gesture.
       * @param event - Native pointerdown dispatched by Playwright's mouse.
       */
      const recordPointer = (event: Event): void => {
        if (!(event instanceof PointerEvent)) return;
        element.setAttribute("data-test-pointer-id", String(event.pointerId));
        element.removeEventListener("pointerdown", recordPointer);
      };
      element.addEventListener("pointerdown", recordPointer);
    });
    await page.mouse.down();
    const pointerIdAttribute = await handle.getAttribute("data-test-pointer-id");
    expect(pointerIdAttribute).toMatch(/^\d+$/u);
    const pointerId = Number(pointerIdAttribute);
    pointerIds.push(pointerId);
    await page.mouse.move(x, y + 30);
    await expect.poll(() => handle.evaluate((element) => {
      const transform = getComputedStyle(element).transform;
      return transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42;
    })).toBeGreaterThan(0);
    if (interruption === "second-pointer") {
      await handle.dispatchEvent("pointerdown", { pointerId: pointerId + 1, clientX: x + 4, clientY: y + 4, button: 0 });
    } else {
      await handle.dispatchEvent(interruption, { pointerId });
    }
    await page.mouse.up();
    await expect(handle).toHaveCSS("transform", "none");
    await expect(dialog).toBeVisible();
    expect((await transport(page)).aborted).toEqual([]);
  }
  await testInfo.attach("native-pointer-ids", { body: JSON.stringify(pointerIds), contentType: "application/json" });
  expect((await transport(page)).requests).toHaveLength(1);
});
