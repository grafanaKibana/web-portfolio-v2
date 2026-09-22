import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

const liveAnswer = "Nikita focuses on software and AI engineering, supported by the portfolio evidence.";
const liveStream = "event: metadata\ndata: {\"mode\":\"live\"}\n\n"
  + `event: delta\ndata: ${JSON.stringify({ text: liveAnswer })}\n\n`
  + "event: done\ndata: {\"sources\":[],\"followUps\":[{\"label\":\"Experience\",\"question\":\"Tell me about Nikita's relevant experience.\"},{\"label\":\"Projects\",\"question\":\"Which projects best demonstrate Nikita's fit?\"}]}\n\n";

/** Waits for capability detection and splash coordination to expose the launcher.
 * @param page - Active portfolio page.
 * @returns The supported conversation launcher.
 */
async function readyLauncher(page: Page): Promise<Locator> {
  await expect(page.locator('[data-conversation-shell][data-capability="supported"]')).toBeAttached();
  await expect(page.locator('[data-slot="opening-splash"]')).toHaveCount(0);
  const launcher = page.locator("button[data-launcher]");
  const input = page.getByRole("textbox", { name: "Your question" });
  await expect.poll(async () => await input.isVisible() || await launcher.isVisible(), { timeout: 5_000 }).toBe(true);
  return launcher;
}

/** Reveals the first-message composer without opening a conversation surface.
 * @param page - Active portfolio page.
 * @returns The hidden named conversation surface reserved for the first send.
 */
async function openConversation(page: Page): Promise<Locator> {
  const launcher = await readyLauncher(page);
  const input = page.getByRole("textbox", { name: "Your question" });
  if (!await input.isVisible()) {
    await launcher.focus();
    await expect(input).toBeVisible();
    await input.focus();
  }
  const dialog = page.getByRole("dialog", { name: "About my work" });
  await expect(dialog).toBeHidden();
  await expect(input).toBeVisible();
  return dialog;
}

/** Reopens retained conversation history directly in its responsive surface.
 * @param page - Active portfolio page.
 * @returns The visible named conversation surface.
 */
async function reopenConversation(page: Page): Promise<Locator> {
  await (await readyLauncher(page)).click();
  const dialog = page.getByRole("dialog", { name: "About my work" });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Submits one question through the visible composer.
 * @param page - Active portfolio page.
 * @param question - Question to submit.
 */
async function submitQuestion(page: Page, question: string): Promise<void> {
  await page.getByRole("textbox", { name: "Your question" }).fill(question);
  await page.getByRole("button", { exact: true, name: "Send" }).click();
  await expect(page.getByRole("dialog", { name: "About my work" })).toBeVisible();
}

/** Reveals a reaction through its owning message before pointer interaction.
 * @param reaction - Control inside the message's reaction pill.
 */
async function hoverReaction(reaction: Locator): Promise<void> {
  const visual = reaction.locator("[data-reaction-visual]");
  await reaction.locator('xpath=ancestor::*[@data-slot="bubble"][1]')
    .locator('[data-slot="bubble-content"]').hover();
  await expect(visual).toHaveCSS("opacity", "1");
  await expect(visual).toHaveCSS("transform", "none");
}

/** Waits for surface/composer geometry and their reveal owners before sampling coordinates.
 * @param surface - Conversation surface whose stable hit targets are required.
 */
async function settleSurfaceMotion(surface: Locator): Promise<void> {
  await surface.evaluate(async (element) => {
    const paint = element.querySelector("[data-chat-paint]");
    const composer = element.querySelector("[data-conversation-composer]");
    if (!paint || !composer) throw new Error("Conversation paint and composer must exist before sampling.");
    const owners = [element, paint];
    const measured = [...owners, composer];
    let previous: number[] | undefined;
    let settledFrames = 0;
    for (let frame = 0; frame < 120; frame += 1) {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve(); }); });
      const moving = owners.some((owner) => owner.getAnimations().some((animation) =>
        (animation.playState === "running" || animation.pending)
        && animation.effect?.getTiming().iterations !== Infinity));
      const geometry = measured.flatMap((target) => {
        const rect = target.getBoundingClientRect();
        return [rect.x, rect.y, rect.width, rect.height];
      });
      const stable = previous !== undefined
        && geometry.every((value, index) => Math.abs(value - (previous?.[index] ?? Infinity)) < 0.01);
      settledFrames = !moving && stable ? settledFrames + 1 : 0;
      if (settledFrames >= 3) return;
      previous = geometry;
    }
    throw new Error("Conversation surface/composer geometry did not settle before sampling.");
  });
}

/** Positions a page link above the bottom conversation surface for a real pointer click.
 * @param locator - Link that must remain independently actionable while chat is open.
 */
async function placeInUpperViewport(locator: Locator): Promise<void> {
  await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    window.scrollTo(0, window.scrollY + rect.top - 128);
  });
  await expect.poll(() => locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return target === element || element.contains(target);
  })).toBe(true);
}

/** Releases a synthetic stale stream only after the tested cancellation has completed.
 * @param page - Active portfolio page.
 */
async function releaseStaleReply(page: Page): Promise<void> {
  await page.evaluate(() => { window.dispatchEvent(new Event("test-release-stale-reply")); });
}

/** Reads a locator's required viewport box.
 * @param locator - Element whose rendered geometry is required.
 * @returns The element's viewport box.
 * @throws When the element has no rendered box.
 */
async function requiredBox(locator: Locator): Promise<NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Conversation element must be measurable.");
  return box;
}

/** Saves and attaches a rendered conversation screenshot to the test result.
 * @param page - Active portfolio page.
 * @param testInfo - Current Playwright result metadata.
 * @param name - Stable screenshot artifact name.
 * @param animations - Whether active motion is preserved in the captured frame.
 */
async function captureConversation(
  page: Page,
  testInfo: TestInfo,
  name: string,
  animations: "allow" | "disabled" = "disabled",
): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ animations, path });
  await testInfo.attach(name, { contentType: "image/png", path });
}

/** Verifies the default generated suggestions remain compact and clear of reply actions.
 * @param page - Browser page containing one completed reply.
 */
async function expectCompactSuggestionGeometry(page: Page): Promise<void> {
  const latestTurn = page.locator("[data-turn]").last();
  if ((page.viewportSize()?.width ?? 1440) < 640) {
    const suggestions = page.locator("[data-mobile-suggestions]");
    await expect(suggestions).toBeVisible();
    const row = await requiredBox(suggestions);
    const buttons = await suggestions.getByRole("button").all();
    for (const suggestion of buttons) {
      const button = await requiredBox(suggestion);
      expect(button.height).toBeCloseTo(36, 0);
      expect(button.y).toBeGreaterThanOrEqual(row.y);
      expect(button.y + button.height).toBeLessThanOrEqual(row.y + row.height);
    }
    if (buttons.length > 1) {
      const first = await requiredBox(buttons[0] as Locator);
      const last = await requiredBox(buttons[buttons.length - 1] as Locator);
      expect(last.x - (first.x + first.width)).toBeGreaterThanOrEqual(3);
      expect(last.x - (first.x + first.width)).toBeLessThanOrEqual(4);
      expect(first.x - row.x).toBeGreaterThanOrEqual(2);
      expect(first.x - row.x).toBeLessThanOrEqual(4);
      expect(row.x + row.width - (last.x + last.width)).toBeGreaterThanOrEqual(2);
      expect(row.x + row.width - (last.x + last.width)).toBeLessThanOrEqual(4);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    return;
  }
  const suggestions = latestTurn.locator('[data-slot="bubble-reactions"][aria-label="Suggested questions"]');
  const actions = latestTurn.locator('[data-slot="bubble-reactions"][aria-label="Reply actions"]');
  await expect(suggestions).toBeVisible();
  await expect(actions).toBeAttached();
  for (const suggestion of await suggestions.getByRole("button").all()) {
    await expect.poll(async () => (await requiredBox(suggestion)).height).toBeCloseTo(24, 0);
  }
  const suggestionsBox = await requiredBox(suggestions);
  const actionsBox = await requiredBox(actions);
  expect(suggestionsBox.y >= actionsBox.y + actionsBox.height
    || suggestionsBox.x >= actionsBox.x + actionsBox.width).toBe(true);
}

/** Proves that a shadow paints around the visible shape through a pixel comparison.
 * @param page - Browser page containing the painted element.
 * @param locator - Element whose exterior shadow is required.
 * @param property - Shadow property temporarily disabled for the control image.
 * @param testInfo - Current Playwright result metadata.
 * @param name - Stable artifact prefix for the compared shadow regions.
 */
async function expectExteriorShadow(
  page: Page,
  locator: Locator,
  property: "boxShadow" | "filter",
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  const box = await requiredBox(locator);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("A fixed viewport is required for exterior shadow evidence.");
  // Include the center beneath rounded lines and space exposed by shrinking clips.
  const x = Math.max(0, Math.ceil(box.x - 24));
  const clip = {
    x,
    y: Math.max(0, Math.floor(box.y - 8)),
    width: Math.min(Math.ceil(box.width + 48), viewport.width - x),
    height: Math.min(Math.ceil(box.height + 16), viewport.height - Math.max(0, Math.floor(box.y - 8))),
  };
  if (clip.width < 1 || clip.height < 1) throw new Error("Exterior shadow strip must fit inside the viewport.");
  const withShadow = await page.screenshot({ animations: "allow", clip });
  const inlineValue = await locator.evaluate((element, key) => {
    const style = (element as HTMLElement).style;
    const previous = style[key];
    style[key] = "none";
    return previous;
  }, property);
  const withoutShadow = await page.screenshot({ animations: "allow", clip });
  await locator.evaluate((element, { key, value }) => {
    (element as HTMLElement).style[key] = value;
  }, { key: property, value: inlineValue });
  expect(withShadow.equals(withoutShadow)).toBe(false);
  await testInfo.attach(`${name}-with-shadow`, { body: withShadow, contentType: "image/png" });
  await testInfo.attach(`${name}-without-shadow`, { body: withoutShadow, contentType: "image/png" });
}

/** Installs a test control that pauses every track in the next conversation morph.
 * @param page - Browser page receiving the animation control.
 */
async function installSurfaceClipAnimationControl(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let pauseNextClip = false;
    const captured = new Set<Animation>();
    (window as unknown as { testSurfaceMorphAnimations: Set<Animation> }).testSurfaceMorphAnimations = captured;
    const morphSelector = "[data-chat-frame], [data-chat-paint], [data-conversation-composer] [data-slot='input-group'], [data-chat-reveal], [data-conversation-history]";
    window.addEventListener("test-pause-next-surface-clip", () => { captured.clear(); pauseNextClip = true; });
    window.addEventListener("test-release-surface-clip", () => { pauseNextClip = false; });
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Forwarded below with the original receiver via .call.
    const animate = Element.prototype.animate;
    /** Pauses only the next armed conversation surface clip animation.
     * @param keyframes - Browser animation keyframes.
     * @param options - Browser animation timing.
     * @returns The original animation, paused when armed for the surface clip.
     */
    Element.prototype.animate = function controlledAnimate(keyframes, options) {
      const animation = animate.call(this, keyframes, options);
      if (pauseNextClip && this.matches(morphSelector)) {
        animation.pause();
        captured.add(animation);
      }
      return animation;
    };
  });
}

/** Arms the next conversation morph for synchronous inspection.
 * @param page - Browser page containing the installed animation control.
 */
async function pauseNextSurfaceClipAnimation(page: Page): Promise<void> {
  await page.evaluate(() => { window.dispatchEvent(new Event("test-pause-next-surface-clip")); });
}

/** Waits until the moving composer owns its finite geometry track.
 * @param composer - Input group that must participate in the morph.
 */
async function waitForComposerMorph(composer: Locator): Promise<void> {
  await expect.poll(() => composer.evaluate((element) => element.getAnimations().some((animation) => {
    const endTime = animation.effect?.getComputedTiming().endTime;
    const keyframes = (animation.effect as KeyframeEffect | null)?.getKeyframes() ?? [];
    return typeof endTime === "number" && Number.isFinite(endTime) && endTime > 0
      && keyframes.some((frame) => frame.transform !== undefined || frame.width !== undefined || frame.height !== undefined);
  }))).toBe(true);
}

/** Moves every active descendant animation to the same normalized point.
 * @param locator - Conversation shell with synchronized motion tracks.
 * @param progress - Normalized animation progress from zero through one.
 */
async function setMotionProgress(locator: Locator, progress: number): Promise<void> {
  await locator.evaluate((_element, fraction) => {
    const captured = (window as unknown as { testSurfaceMorphAnimations?: Set<Animation> }).testSurfaceMorphAnimations;
    const animations = [...(captured ?? [])].filter((animation) => {
      const endTime = animation.effect?.getComputedTiming().endTime;
      const keyframes = (animation.effect as KeyframeEffect | null)?.getKeyframes() ?? [];
      return typeof endTime === "number" && Number.isFinite(endTime) && endTime > 0
        && keyframes.some((frame) => frame.transform !== undefined || frame.width !== undefined || frame.height !== undefined
          || frame.clipPath !== undefined || frame.opacity !== undefined);
    });
    if (animations.length === 0) throw new Error("Expected finite conversation morph tracks.");
    for (const animation of animations) {
      const duration = animation.effect?.getComputedTiming().endTime;
      if (typeof duration !== "number") throw new Error("Morph animation duration must be numeric.");
      animation.currentTime = duration * fraction;
    }
    if (fraction === 0) window.dispatchEvent(new Event("test-release-surface-clip"));
  }, progress);
}

/** Resumes every synchronized descendant track and waits for its settled frame.
 * @param locator - Conversation shell with paused motion tracks.
 */
async function finishMotion(locator: Locator): Promise<void> {
  await locator.evaluate(async () => {
    const captured = (window as unknown as { testSurfaceMorphAnimations?: Set<Animation> }).testSurfaceMorphAnimations;
    const animations = [...(captured ?? [])].filter((animation) => {
      const endTime = animation.effect?.getComputedTiming().endTime;
      return typeof endTime === "number" && Number.isFinite(endTime) && endTime > 0;
    });
    for (const animation of animations) animation.play();
    await Promise.allSettled(animations.map(async (animation) => animation.finished));
    captured?.clear();
  });
}

test("the supported shell exposes one launcher across representative routes", async ({ page }) => {
  for (const path of [
    "/",
    "/projects",
    "/articles",
    "/privacy",
  ]) {
    await page.goto(path);
    await readyLauncher(page);
    await expect(page.locator("button[data-launcher]")).toHaveCount(1);
    await expect(page.locator("[data-chat-surface]")).toHaveCount(0);
    await expect(page.locator("[data-conversation-composer]")).toHaveCount(1);
  }
});

test("live transport keeps bounded follow-up history and page context", async ({ page }) => {
  const payloads: unknown[] = [];
  await page.route("**/api/ask", async (route) => {
    await route.fulfill({ body: liveStream, contentType: "text/event-stream; charset=utf-8" });
  });
  page.on("request", (request) => {
    if (request.url().endsWith("/api/ask") && request.method() === "POST") {
      payloads.push(request.postDataJSON() as unknown);
    }
  });
  await page.goto("/");
  await openConversation(page);
  await page.locator("#projects").evaluate((section) => { section.scrollIntoView(); });

  await submitQuestion(page, "What kind of work do you do?");
  await expect(page.locator("[data-turn]")).toHaveCount(1);
  await expect(page.locator("[data-answer]").first()).toHaveText(liveAnswer);
  await expect(page.locator("[data-conversation-status]")).toHaveText("Answer complete.");

  await submitQuestion(page, "Tell me more about that.");
  await expect(page.locator("[data-turn]")).toHaveCount(2);
  await expect(page.locator("[data-answer]").last()).toHaveText(liveAnswer);
  await expect.poll(() => payloads.length).toBe(2);
  expect(payloads[1]).toMatchObject({
    context: { pathname: "/", sectionId: "projects" },
    messages: [
      { role: "user", content: "What kind of work do you do?" },
      { role: "assistant", content: liveAnswer },
      { role: "user", content: "Tell me more about that." },
    ],
  });
});

test("a delayed live transport keeps pending state visible before the first answer", async ({ page }) => {
  await page.route("**/api/ask", async (route) => {
    await new Promise((resolve) => { setTimeout(resolve, 900); });
    await route.fulfill({ body: liveStream, contentType: "text/event-stream; charset=utf-8" });
  });
  await page.goto("/");
  await openConversation(page);

  const startedAt = Date.now();
  await submitQuestion(page, "Show the delayed answer");
  const turn = page.locator("[data-turn]");
  await expect(turn.getByText("Thinking...", { exact: true })).toBeVisible();
  await expect(turn.getByRole("button", { name: "Stop" })).toHaveCount(0);
  await expect(page.locator('[data-chat-surface] [data-slot="input-group"]')
    .getByRole("button", { name: "Stop" })).toBeVisible();
  await page.waitForTimeout(450);
  await expect(turn.getByText("Thinking...", { exact: true })).toBeVisible();
  await expect(turn.locator("[data-answer]")).toHaveCount(0);

  await expect(turn.locator("[data-answer]")).toHaveText(liveAnswer);
  expect(Date.now() - startedAt).toBeGreaterThanOrEqual(800);
});

test("a live transport failure keeps recovery on the sent message", async ({ page }) => {
  await page.route("**/api/ask", async (route) => {
    await route.fulfill({
      body: 'event: error\ndata: {"message":"Unable to finish the answer. Please try again."}\n\n',
      contentType: "text/event-stream; charset=utf-8",
    });
  });
  await page.goto("/");
  await openConversation(page);
  await submitQuestion(page, "Explain the relevant experience");

  const failedReply = page.locator('[data-slot="bubble"][data-variant="destructive"]');
  const sentMessage = page.locator('[data-slot="message"][data-align="end"] [data-slot="bubble"]');
  await expect(failedReply).toContainText("Unable to finish the answer. Please try again.");
  await expect(sentMessage.locator('[data-slot="bubble-reactions"] button[aria-label="Retry message"]')).toBeAttached();
  await expect(failedReply.getByRole("button", { name: "Retry message" })).toHaveCount(0);
  await expect(page.locator('[aria-label="Failure details"]')).toBeAttached();
  await expect(page.getByRole("button", { name: "Options for failed reply" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit question" })).toHaveCount(0);
});

test("questions and replies use generated messages and bubbles with distinct alignment and tone", async ({ page }) => {
  await page.route("**/api/ask", async (route) => {
    await route.fulfill({ body: liveStream, contentType: "text/event-stream; charset=utf-8" });
  });
  await page.goto("/");
  await openConversation(page);
  await submitQuestion(page, "Show the message treatments");

  const turn = page.locator("[data-turn]");
  await expect(turn.locator('[data-slot="message"]')).toHaveCount(2);
  await expect(turn.locator('[data-slot="bubble"]')).toHaveCount(2);
  const question = turn.locator('[data-slot="message"][data-align="end"]');
  const reply = turn.locator('[data-slot="message"][data-align="start"]');
  await expect(question.locator('[data-slot="message-content"] [data-slot="bubble"][data-align="end"]'))
    .toContainText("Show the message treatments");
  await expect(reply.locator('[data-slot="message-content"] [data-slot="bubble"][data-align="start"][data-variant="muted"]'))
    .toContainText(liveAnswer);
  await expect(reply.locator('[data-slot="bubble-reactions"][aria-label="Reply actions"]')).toBeAttached();
});

test("validated sources become inline numbered citations while authored Markdown links and media stay inert", async ({ page }) => {
  const remoteRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith("https://example.invalid/")) remoteRequests.push(request.url());
  });
  const markdown = "**Strong evidence** and *measured fit* from the project [2], article [1], and project again [2].\n\n- First item\n- Second item\n\n"
    + "[Untrusted link](https://example.invalid/profile)\n\n"
    + "[Authored matching source](/projects/web-portfolio-v2)\n\n"
    + "![Untrusted image](https://example.invalid/image.png)\n\n"
    + "![Authored matching image](/projects/web-portfolio-v2)\n\n"
    + "<img src=\"https://example.invalid/raw.png\" onerror=\"alert(1)\">";
  const stream = "event: metadata\ndata: {\"mode\":\"live\"}\n\n"
    + `event: delta\ndata: ${JSON.stringify({ text: markdown })}\n\n`
    + `event: done\ndata: ${JSON.stringify({
      sources: [
        { id: "article:building-reliable-ai", title: "Building reliable AI", href: "/articles/building-reliable-ai" },
        { id: "project:web-portfolio-v2", title: "Portfolio v2", href: "/projects/web-portfolio-v2" },
      ],
      followUps: [],
    })}\n\n`;
  await page.route("**/api/ask", async (route) => {
    await route.fulfill({ body: stream, contentType: "text/event-stream; charset=utf-8" });
  });
  await page.goto("/");
  await openConversation(page);
  await submitQuestion(page, "Show safe formatting");

  const answer = page.locator("[data-answer]");
  await expect(answer.locator("strong")).toHaveText("Strong evidence");
  await expect(answer.locator("strong")).toHaveCSS("font-weight", "600");
  await expect(answer.locator("em")).toHaveCSS("font-style", "italic");
  await expect(answer.locator("em")).toHaveText("measured fit");
  await expect(answer.locator("li")).toHaveCount(2);
  await expect(answer.locator("img, script, video, iframe")).toHaveCount(0);
  await expect(answer.getByRole("link", { name: "Source 1: Building reliable AI" })).toHaveAttribute("href", "/articles/building-reliable-ai");
  await expect(answer.getByRole("link", { name: "Source 1: Building reliable AI" })).toHaveText("[1]");
  await expect(answer.getByRole("link", { name: "Source 2: Portfolio v2" })).toHaveCount(2);
  for (const citation of await answer.getByRole("link", { name: "Source 2: Portfolio v2" }).all()) {
    await expect(citation).toHaveAttribute("href", "/projects/web-portfolio-v2");
    await expect(citation).toHaveText("[2]");
  }
  const firstCitation = answer.getByRole("link", { name: "Source 1: Building reliable AI" });
  for (const dark of [false, true]) {
    const accentColor = await page.evaluate((useDark) => {
      document.documentElement.classList.toggle("dark", useDark);
      const sample = document.createElement("span");
      sample.style.color = "var(--brand-accent-text)";
      document.body.append(sample);
      const color = getComputedStyle(sample).color;
      sample.remove();
      return color;
    }, dark);
    await expect(firstCitation).toHaveCSS("color", accentColor);
  }
  await expect(answer.getByRole("link", { name: "Untrusted link" })).toHaveCount(0);
  await expect(answer.getByRole("link", { name: "Authored matching source" })).toHaveCount(0);
  await expect(page.locator("[data-answer-sources]")).toHaveCount(0);
  expect(remoteRequests).toEqual([]);
});

test("the textarea keeps Shift+Enter newlines and ignores composing Enter", async ({ page }) => {
  const payloads: Array<{ messages?: Array<{ content?: string }> }> = [];
  await page.route("**/api/ask", async (route) => {
    payloads.push(route.request().postDataJSON() as { messages?: Array<{ content?: string }> });
    await route.fulfill({ body: liveStream, contentType: "text/event-stream; charset=utf-8" });
  });
  await page.goto("/");
  await openConversation(page);
  const composer = page.getByRole("textbox", { name: "Your question" });
  await composer.fill("First line");
  await page.keyboard.press("Shift+Enter");
  await composer.pressSequentially("Second line");
  await composer.evaluate((element) => {
    const event = new KeyboardEvent("keydown", { bubbles: true, key: "Enter" });
    Object.defineProperty(event, "isComposing", { value: true });
    element.dispatchEvent(event);
  });
  await expect(page.locator("[data-turn]")).toHaveCount(0);
  await expect(composer).toHaveValue("First line\nSecond line");

  await composer.press("Enter");
  await expect(page.locator("[data-turn]")).toHaveCount(1);
  expect(payloads[0]?.messages?.at(-1)?.content).toBe("First line\nSecond line");
});

test("retry preserves the original detail-page context after client navigation", async ({ page }) => {
  const payloads: Array<{ context?: unknown }> = [];
  await page.route("**/api/ask", async (route) => {
    payloads.push(route.request().postDataJSON() as { context?: unknown });
    await route.fulfill({ body: liveStream, contentType: "text/event-stream; charset=utf-8" });
  });
  await page.goto("/projects");
  const detailLinks = page.locator('a[href^="/projects/"]');
  if (await detailLinks.count() === 0) {
    test.skip(true, "Project collection is empty");
    return;
  }
  const detailPath = await detailLinks.first().getAttribute("href");
  if (!detailPath) throw new Error("Rendered project link must have an href.");
  expect(detailPath).toMatch(/^\/projects\/[a-z0-9]+(?:-[a-z0-9]+)*$/u);
  const slug = detailPath.slice("/projects/".length);
  await page.goto(detailPath);
  await openConversation(page);
  await submitQuestion(page, "What is this project about?");
  await expect(page.locator("[data-answer]")).toHaveText(liveAnswer);
  expect(payloads[0]?.context).toEqual({
    pathname: detailPath,
    record: { kind: "project", slug },
  });

  await page.getByRole("link", { exact: true, name: "Home" }).click();
  await expect(page).toHaveURL(/\/$/u);
  await reopenConversation(page);
  const retry = page.getByRole("button", { name: "Retry message" });
  await hoverReaction(retry);
  await retry.click();
  await expect.poll(() => payloads.length).toBe(2);
  expect(payloads[1]?.context).toEqual(payloads[0]?.context);
});

test("only the latest reply exposes compact follow-ups that prefill the focused composer", async ({ page }) => {
  let requestCount = 0;
  await page.route("**/api/ask", async (route) => {
    requestCount += 1;
    await route.fulfill({ body: liveStream, contentType: "text/event-stream; charset=utf-8" });
  });
  await page.goto("/");
  await openConversation(page);
  await submitQuestion(page, "First question");
  await expect(page.locator('[data-slot="bubble-reactions"][aria-label="Suggested questions"]')).toHaveCount(1);

  await submitQuestion(page, "Second question");
  const turns = page.locator("[data-turn]");
  await expect(turns).toHaveCount(2);
  await expect(turns.first().locator('[data-slot="bubble-reactions"][aria-label="Suggested questions"]')).toHaveCount(0);
  const reactions = turns.last().locator('[data-slot="bubble-reactions"][aria-label="Suggested questions"]');
  const bubble = turns.last().locator('[data-slot="message"][data-align="start"] [data-slot="bubble"]');
  const footer = turns.last().locator('[data-slot="bubble-reactions"][aria-label="Reply actions"]');
  await expect(footer).toBeAttached();
  await hoverReaction(footer.getByRole("button", { name: "Copy reply" }));
  await expect(reactions).toBeVisible();
  await expect(reactions.getByRole("button", { name: "Experience" })).toBeVisible();
  await expect(reactions.getByRole("button", { name: "Projects" })).toBeVisible();
  const bubbleBox = await requiredBox(bubble);
  const footerBox = await requiredBox(footer);
  expect(footerBox.x - bubbleBox.x).toBeCloseTo(12, 0);
  await expectCompactSuggestionGeometry(page);
  await page.setViewportSize({ width: 640, height: 800 });
  await hoverReaction(footer.getByRole("button", { name: "Copy reply" }));
  await expectCompactSuggestionGeometry(page);

  const composer = page.getByRole("textbox", { name: "Your question" });
  await composer.fill("Unrelated draft text");
  await composer.evaluate((element) => { (element as HTMLTextAreaElement).setCustomValidity("Stale validation"); });
  await reactions.getByRole("button", { name: "Experience" }).click();
  await expect(composer).toHaveValue("Tell me about Nikita's relevant experience.");
  await expect(composer).toBeFocused();
  expect(await composer.evaluate((element: HTMLTextAreaElement) => element.validationMessage)).toBe("");
  await expect(turns).toHaveCount(2);
  expect(requestCount).toBe(2);

  await page.getByRole("button", { exact: true, name: "Send" }).click();
  await expect(turns).toHaveCount(3);
  await expect(turns.last().locator("[data-user-message]")).toHaveText("Tell me about Nikita's relevant experience.");
  expect(requestCount).toBe(3);
});

test("completed exchange pairs meet without an extra transcript gap", async ({ page }) => {
  await page.route("**/api/ask", async (route) => {
    await route.fulfill({ body: liveStream, contentType: "text/event-stream; charset=utf-8" });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await openConversation(page);
  await submitQuestion(page, "First spacing check");
  await expect(page.locator("[data-answer]")).toHaveText(liveAnswer);
  await submitQuestion(page, "Second spacing check");
  await expect(page.locator("[data-answer]")).toHaveCount(2);

  const turns = page.locator("[data-turn]");
  await expect(turns).toHaveCount(2);
  const firstBox = await requiredBox(turns.first());
  const secondBox = await requiredBox(turns.last());
  expect(secondBox.y - (firstBox.y + firstBox.height)).toBeCloseTo(0, 0);
  for (const turn of await turns.all()) await expect(turn).toHaveCSS("padding-bottom", "0px");
  await expect(page.locator('[role="log"]')).toHaveCSS("gap", "0px");
});

test("one long mobile follow-up scrolls locally and prefills its full question", async ({ page }) => {
  const longQuestion = "How does Nikita's project evidence transfer to an adjacent AI engineering role that uses Python and LangChain?";
  const longLabel = "Assess an adjacent AI role using detailed portfolio evidence";
  const stream = "event: metadata\ndata: {\"mode\":\"live\"}\n\n"
    + `event: delta\ndata: ${JSON.stringify({ text: liveAnswer })}\n\n`
    + `event: done\ndata: ${JSON.stringify({
      sources: [],
      followUps: [{ label: longLabel, question: longQuestion }],
    })}\n\n`;
  const payloads: Array<{ messages?: Array<{ content?: string }> }> = [];
  await page.route("**/api/ask", async (route) => {
    payloads.push(route.request().postDataJSON() as { messages?: Array<{ content?: string }> });
    await route.fulfill({ body: stream, contentType: "text/event-stream; charset=utf-8" });
  });
  await page.goto("/");
  await openConversation(page);
  await submitQuestion(page, "Assess fit");

  await page.setViewportSize({ width: 320, height: 800 });
  const suggestion = page.getByRole("button", { name: longLabel });
  await expect(suggestion).toBeVisible();
  const suggestionBox = await requiredBox(suggestion);
  const suggestionGroupBox = await requiredBox(page.locator('[aria-label="Suggested questions"]'));
  const actionsBox = await requiredBox(page.locator("[data-turn]").last().locator("[data-answer-actions]"));
  expect(suggestionBox.height).toBeGreaterThanOrEqual(30);
  expect(suggestionBox.x).toBeGreaterThanOrEqual(suggestionGroupBox.x);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(suggestionGroupBox.y).toBeGreaterThanOrEqual(actionsBox.y + actionsBox.height);
  await suggestion.click();
  await expect(page.getByRole("textbox", { name: "Your question" })).toHaveValue(longQuestion);
  await expect(page.locator("[data-turn]")).toHaveCount(1);
  expect(payloads).toHaveLength(1);
});

for (const theme of ["light", "dark"] as const) {
  test(`message action pills follow their own bubble hover and keyboard focus in ${theme}`, async ({ page }, testInfo) => {
    let requests = 0;
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.route("**/api/ask", async (route) => {
      requests += 1;
      await route.fulfill({
        body: requests === 1 ? liveStream : 'event: error\ndata: {"message":"Provider failure"}\n\n',
        contentType: "text/event-stream; charset=utf-8",
      });
    });
    await page.goto("/");
    const dialog = await openConversation(page);
    await submitQuestion(page, "Show message actions");
    await expect(page.locator("[data-answer]")).toHaveText(liveAnswer);
    const composer = page.getByRole("textbox", { name: "Your question" });
    const copy = page.getByRole("button", { name: "Copy reply" });
    const retry = page.getByRole("button", { name: "Retry message" });
    const copyVisual = copy.locator("[data-reaction-visual]");
    const retryVisual = retry.locator("[data-reaction-visual]");
    await page.mouse.move(0, 0);
    await composer.focus();
    await expect(copyVisual).toHaveCSS("opacity", "0");
    await expect(retryVisual).toHaveCSS("opacity", "0");
    await expect.poll(() => copy.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    })).toBe(false);
    await expect(page.locator('[aria-label="Suggested questions"]')).toHaveCSS("opacity", "1");
    const restingHeight = (await requiredBox(dialog)).height;
    const restingCopyBox = await requiredBox(copy);
    await captureConversation(page, testInfo, `action-pills-resting-${theme}`);

    await hoverReaction(copy);
    await expect(copyVisual).toHaveCSS("opacity", "1");
    await expect(retryVisual).toHaveCSS("opacity", "0");
    await copy.hover();
    const revealedCopyBox = await requiredBox(copy);
    expect(revealedCopyBox).toEqual(restingCopyBox);
    await captureConversation(page, testInfo, `copy-pill-hover-${theme}`);
    await page.mouse.move(0, 0);
    await expect(copyVisual).toHaveCSS("opacity", "0");
    expect((await requiredBox(dialog)).height).toBeCloseTo(restingHeight, 1);
    await hoverReaction(retry);
    await expect(retryVisual).toHaveCSS("opacity", "1");
    await expect(copyVisual).toHaveCSS("opacity", "0");
    await page.mouse.move(0, 0);
    await expect(retryVisual).toHaveCSS("opacity", "0");

    await composer.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(copy).toBeFocused();
    await expect(copyVisual).toHaveCSS("opacity", "1");
    await expect(copyVisual).toHaveCSS("transform", "none");
    await page.keyboard.press("Shift+Tab");
    await expect(retry).toBeFocused();
    await expect(retryVisual).toHaveCSS("opacity", "1");
    await expect(retryVisual).toHaveCSS("transform", "none");
    await expect(copyVisual).toHaveCSS("opacity", "0");
    await page.keyboard.press("Enter");

    const info = page.locator('[aria-label="Failure details"]');
    const infoVisual = info.locator("[data-reaction-visual]");
    await expect(info).toBeAttached();
    await composer.focus();
    await expect(infoVisual).toHaveCSS("opacity", "0");
    await hoverReaction(info);
    await expect(infoVisual).toHaveCSS("opacity", "1");
    await info.hover();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await captureConversation(page, testInfo, `info-pill-hover-${theme}`);
    await page.mouse.move(0, 0);
    await expect(infoVisual).toHaveCSS("opacity", "0");
    await page.keyboard.press("Shift+Tab");
    await expect(info).toBeFocused();
    await expect(infoVisual).toHaveCSS("opacity", "1");
    await expect(infoVisual).toHaveCSS("transform", "none");
  });
}

test.describe("message actions without hover", () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 812 } });

  test("touch keeps mobile answer actions and failure details available", async ({ page }, testInfo) => {
    let requests = 0;
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.route("**/api/ask", async (route) => {
      requests += 1;
      await route.fulfill({
        body: requests === 1 ? liveStream : 'event: error\ndata: {"message":"Provider failure"}\n\n',
        contentType: "text/event-stream; charset=utf-8",
      });
    });
    await page.goto("/");
    await openConversation(page);
    expect(await page.evaluate(() => matchMedia("(hover: none)").matches)).toBe(true);
    await submitQuestion(page, "Touch actions");
    await expect(page.locator("[data-answer]")).toHaveText(liveAnswer);
    const actions = page.locator("[data-answer-actions]");
    await expect(actions.getByRole("button", { name: "Copy reply" })).toBeVisible();
    await expect(actions.getByRole("button", { name: "Retry message" })).toBeVisible();
    await page.getByRole("button", { name: "Retry message" }).tap();
    const info = page.locator('[aria-label="Failure details"]');
    await expect(info).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry message" })).toBeVisible();
    await captureConversation(page, testInfo, "touch-answer-actions");
  });
});

test("the first pointer click activates Copy through its stable hidden target", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        /** Stores the value written by the first physical Copy activation.
         * @param value - Plain-text reply selected for copying.
         * @returns A resolved clipboard operation.
         */
        writeText: (value: string) => {
          sessionStorage.setItem("test-first-pointer-copy", value);
          return Promise.resolve();
        },
      },
    });
  });
  await page.route("**/api/ask", async (route) => {
    await route.fulfill({ body: liveStream, contentType: "text/event-stream; charset=utf-8" });
  });
  await page.goto("/");
  await openConversation(page);
  await submitQuestion(page, "Copy this reply");

  const composer = page.getByRole("textbox", { name: "Your question" });
  const copy = page.locator('[data-slot="bubble-reactions"][aria-label="Reply actions"] button');
  await expect(copy).toHaveAccessibleName("Copy reply");
  await expect(copy).not.toHaveAttribute("aria-disabled", "true");
  await expect(page.locator('[data-answer-presentation]')).toHaveCSS("opacity", "1");
  await composer.focus();
  await page.mouse.move(0, 0);
  await expect(composer).toBeFocused();
  await settleSurfaceMotion(page.locator("[data-chat-surface]"));
  const hiddenGeometry = await copy.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      centerX: box.x + box.width / 2,
      centerY: box.y + box.height / 2,
    };
  });
  await page.mouse.click(hiddenGeometry.centerX, hiddenGeometry.centerY);

  await expect(copy).toHaveAccessibleName("Copied");
  expect(await page.evaluate(() => sessionStorage.getItem("test-first-pointer-copy"))).toBe(liveAnswer);
  const revealedBox = await requiredBox(copy);
  expect(hiddenGeometry.width).toBeCloseTo(24, 0);
  expect(hiddenGeometry.height).toBeCloseTo(24, 0);
  expect(revealedBox.x).toBeCloseTo(hiddenGeometry.x, 3);
  expect(revealedBox.y).toBeCloseTo(hiddenGeometry.y, 3);
  expect(revealedBox.width).toBeCloseTo(hiddenGeometry.width, 3);
  expect(revealedBox.height).toBeCloseTo(hiddenGeometry.height, 3);
});

test("Copy reply writes the exact plain-text answer on every successful activation", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        /** Stores copied reply text for the browser assertion.
         * @param value - Plain-text reply selected for copying.
         * @returns A resolved clipboard operation.
         */
        writeText: (value: string) => {
          const count = Number(sessionStorage.getItem("test-copy-count") ?? "0") + 1;
          sessionStorage.setItem("test-copy-count", String(count));
          sessionStorage.setItem(`test-copied-reply-${String(count)}`, value);
          return Promise.resolve();
        },
      },
    });
  });
  await page.route("**/api/ask", async (route) => {
    await route.fulfill({ body: liveStream, contentType: "text/event-stream; charset=utf-8" });
  });
  await page.goto("/");
  await openConversation(page);
  await submitQuestion(page, "Copy this reply");
  const copy = page.getByRole("button", { name: "Copy reply" });
  await hoverReaction(copy);
  const copyHandle = await copy.elementHandle();
  await copy.click();

  const iconFrames = await copyHandle.evaluate(async (element) => {
    const frames: Array<{ copy: number; check: number }> = [];
    const until = performance.now() + 240;
    while (performance.now() < until) {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve(); }); });
      const copyIcon = element.querySelector<HTMLElement>('[data-copy-icon="copy"]');
      const checkIcon = element.querySelector<HTMLElement>('[data-copy-icon="check"]');
      if (!copyIcon || !checkIcon) throw new Error("Both copy feedback glyphs must remain mounted during feedback.");
      frames.push({
        copy: Number.parseFloat(getComputedStyle(copyIcon).opacity),
        check: Number.parseFloat(getComputedStyle(checkIcon).opacity),
      });
    }
    return frames;
  });
  expect(iconFrames.some(({ copy: opacity }) => opacity > 0 && opacity < 1)).toBe(true);
  expect(iconFrames.some(({ check: opacity }) => opacity > 0 && opacity < 1)).toBe(true);

  expect(await page.evaluate(() => [sessionStorage.getItem("test-copied-reply-1")])).toEqual([liveAnswer]);
  const copied = page.getByRole("button", { name: "Copied" });
  await expect(copied.locator("svg.lucide-check")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Reply copied." })).toHaveText("Reply copied.");
  await page.waitForTimeout(1_200);
  await hoverReaction(copied);
  await copied.click();
  expect(await page.evaluate(() => [
    sessionStorage.getItem("test-copied-reply-1"),
    sessionStorage.getItem("test-copied-reply-2"),
  ])).toEqual([liveAnswer, liveAnswer]);
  await expect(copied.locator("svg.lucide-check")).toBeVisible();
  await page.waitForTimeout(1_000);
  await expect(copied).toHaveAccessibleName("Copied");
  const restoredCopy = page.getByRole("button", { name: "Copy reply" });
  await expect(restoredCopy).toBeVisible({ timeout: 1_500 });
  await expect(restoredCopy.locator('[data-copy-icon="copy"]')).toHaveCSS("opacity", "1");
  await expect(restoredCopy.locator('[data-copy-icon="check"]')).toHaveCSS("opacity", "0");
  await page.mouse.move(0, 0);
  await expect(page.locator("[data-answer-actions] [data-reaction-visual]")).toHaveCSS("opacity", "0");
});

test("Copy reply keeps focus and prevents duplicate writes while clipboard work is pending", async ({ page }) => {
  await page.addInitScript(() => {
    let finishWrite: (() => void) | undefined;
    window.addEventListener("test-finish-copy", () => { finishWrite?.(); });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        /** Holds clipboard completion until the test releases it.
         * @param value - Plain-text reply selected for copying.
         * @returns A pending clipboard operation.
         */
        writeText: (value: string) => {
          const count = Number(sessionStorage.getItem("test-copy-count") ?? "0") + 1;
          sessionStorage.setItem("test-copy-count", String(count));
          sessionStorage.setItem("test-pending-copy", value);
          return new Promise<void>((resolve) => { finishWrite = resolve; });
        },
      },
    });
  });
  await page.route("**/api/ask", async (route) => {
    await route.fulfill({ body: liveStream, contentType: "text/event-stream; charset=utf-8" });
  });
  await page.goto("/");
  await openConversation(page);
  await submitQuestion(page, "Copy this reply");
  const reaction = page.locator('[data-slot="bubble-reactions"][aria-label="Reply actions"] button');
  const copy = page.getByRole("button", { name: "Copy reply" });
  await hoverReaction(copy);
  await copy.click();

  await expect(copy).toBeFocused();
  await expect(copy).toHaveAttribute("aria-disabled", "true");
  await expect(reaction.locator('[data-copy-icon="copy"]')).toHaveCSS("opacity", "1");
  await expect(reaction.locator('[data-copy-icon="check"]')).toHaveCSS("opacity", "0");
  expect(await page.evaluate(() => sessionStorage.getItem("test-pending-copy"))).toBe(liveAnswer);
  await copy.click({ force: true });
  expect(await page.evaluate(() => sessionStorage.getItem("test-copy-count"))).toBe("1");
  await page.evaluate(() => { window.dispatchEvent(new Event("test-finish-copy")); });
  await expect(reaction).toHaveAccessibleName("Copied");
  await expect(reaction.locator('[data-copy-icon="copy"]')).toHaveCSS("opacity", "0");
  await expect(reaction.locator('[data-copy-icon="check"]')).toHaveCSS("opacity", "1");
  await expect(reaction).not.toHaveAttribute("aria-disabled", "true");
});

test("a late clipboard rejection cannot copy after the conversation closes", async ({ page }) => {
  await page.addInitScript(() => {
    let rejectWrite: ((reason: DOMException) => void) | undefined;
    window.addEventListener("test-reject-copy", () => {
      rejectWrite?.(new DOMException("The request is not allowed", "NotAllowedError"));
      sessionStorage.setItem("test-copy-rejected", "true");
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        /** Holds modern clipboard completion until the conversation has closed.
         * @returns A pending clipboard operation.
         */
        writeText: () => {
          sessionStorage.setItem("test-copy-started", "true");
          return new Promise<void>((_resolve, reject) => { rejectWrite = reject; });
        },
      },
    });
    /* eslint-disable @typescript-eslint/no-deprecated -- Counts accidental legacy copy attempts without changing native behavior. */
    const execCommand = document.execCommand.bind(document);
    document.execCommand = (commandId, showUi, value) => {
      if (commandId === "copy") {
        const count = Number(sessionStorage.getItem("test-legacy-copy-count") ?? "0") + 1;
        sessionStorage.setItem("test-legacy-copy-count", String(count));
      }
      return execCommand(commandId, showUi, value);
    };
    /* eslint-enable @typescript-eslint/no-deprecated */
  });
  await page.route("**/api/ask", async (route) => {
    await route.fulfill({ body: liveStream, contentType: "text/event-stream; charset=utf-8" });
  });
  await page.goto("/");
  const launcher = await readyLauncher(page);
  await openConversation(page);
  await submitQuestion(page, "Close before copy finishes");
  const copy = page.getByRole("button", { name: "Copy reply" });
  await hoverReaction(copy);
  await copy.click();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("test-copy-started"))).toBe("true");

  await page.getByRole("button", { name: "Close conversation" }).click();
  await expect(page.locator("[data-chat-surface]")).toBeHidden();
  await expect(page.locator("[data-morph]")).toHaveCount(0);
  await expect(launcher).toBeFocused();
  await page.evaluate(() => { window.dispatchEvent(new Event("test-reject-copy")); });
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("test-copy-rejected"))).toBe("true");

  expect(await page.evaluate(() => sessionStorage.getItem("test-legacy-copy-count"))).toBeNull();
  await expect(page.locator('button[aria-label="Copied"]')).toHaveCount(0);
  await expect(page.locator('textarea[aria-label="Copy reply text"]')).toHaveCount(0);
  await expect(launcher).toBeFocused();
});

for (const clipboardPath of ["primary", "denied modern API fallback"] as const) {
  test(`the first Copy activation writes the exact reply through the ${clipboardPath}`, async ({ browserName, context, page }, testInfo) => {
    await page.route("**/api/ask", async (route) => {
      await route.fulfill({ body: liveStream, contentType: "text/event-stream; charset=utf-8" });
    });
    if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/");
    await openConversation(page);
    await submitQuestion(page, "Copy this reply");
    const composer = page.getByRole("textbox", { name: "Your question" });
    const pasteShortcut = process.platform === "darwin" ? "Meta+V" : "Control+V";
    if (browserName === "chromium") {
      await page.evaluate(async () => {
        const pageWindow = window as Window & { __conversationPriorClipboard?: string };
        pageWindow.__conversationPriorClipboard = await navigator.clipboard.readText();
      });
    } else {
      await composer.focus();
      await page.keyboard.press(pasteShortcut);
      await composer.evaluate((element) => {
        const pageWindow = window as Window & { __conversationPriorClipboard?: string };
        pageWindow.__conversationPriorClipboard = (element as HTMLInputElement).value;
      });
      await composer.fill("");
    }
    if (clipboardPath === "denied modern API fallback") {
      await page.evaluate(() => {
        Object.defineProperty(navigator.clipboard, "writeText", {
          configurable: true,
          /** Reproduces Safari's clipboard denial without replacing native read access.
           * @returns A rejected modern clipboard write.
           */
          value: () => Promise.reject(new DOMException("The request is not allowed", "NotAllowedError")),
        });
      });
    }

    try {
      await composer.fill("Clipboard before Copy");
      await composer.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
      await page.keyboard.press(process.platform === "darwin" ? "Meta+C" : "Control+C");
      await composer.fill("");
      const copy = page.getByRole("button", { name: "Copy reply" });
      await hoverReaction(copy);
      await copy.click();
      const copied = page.getByRole("button", { name: "Copied" });

      await expect(copied).toBeFocused();
      await expect(copied.locator('[data-copy-icon="copy"]')).toHaveCSS("opacity", "0");
      await expect(copied.locator('[data-copy-icon="check"]')).toHaveCSS("opacity", "1");
      await expect(page.getByRole("textbox", { name: "Copy reply text" })).toHaveCount(0);
      await captureConversation(page, testInfo, `first-copy-${clipboardPath.replaceAll(" ", "-")}`);
      if (browserName === "chromium") {
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(liveAnswer);
      } else {
        await composer.focus();
        await page.keyboard.press(pasteShortcut);
        await expect(composer).toHaveValue(liveAnswer);
      }
    } finally {
      if (clipboardPath === "denied modern API fallback") {
        await page.evaluate(() => { Reflect.deleteProperty(navigator.clipboard, "writeText"); });
      }
      if (browserName === "chromium") {
        await page.evaluate(async () => {
          const pageWindow = window as Window & { __conversationPriorClipboard?: string };
          await navigator.clipboard.writeText(pageWindow.__conversationPriorClipboard ?? "");
          delete pageWindow.__conversationPriorClipboard;
        });
      } else {
        await page.evaluate(() => {
          const pageWindow = window as Window & { __conversationPriorClipboard?: string };
          const surface = document.querySelector<HTMLElement>("[data-chat-surface]");
          if (!surface) throw new Error("Conversation surface must own clipboard restoration.");
          const restore = document.createElement("button");
          restore.dataset.restoreClipboard = "true";
          restore.style.cssText = "position:fixed;inset:1px auto auto 1px;width:1px;height:1px;padding:0;opacity:.01;z-index:2147483647";
          restore.addEventListener("click", () => {
            const textarea = document.createElement("textarea");
            textarea.value = pageWindow.__conversationPriorClipboard ?? "";
            surface.append(textarea);
            textarea.select();
            // eslint-disable-next-line @typescript-eslint/no-deprecated -- Restores Safari clipboard through a user-activated compatibility path.
            document.execCommand("copy");
            textarea.remove();
            restore.remove();
            delete pageWindow.__conversationPriorClipboard;
          }, { once: true });
          surface.append(restore);
        });
        await page.locator('[data-restore-clipboard="true"]').click({ force: true });
      }
    }
  });
}

test("Copy reply reports failure when modern and fallback clipboard access both fail", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        /** Simulates Safari denying its modern clipboard API.
         * @returns A clipboard denial matching the browser's native exception.
         */
        writeText: () => Promise.reject(new DOMException("The request is not allowed", "NotAllowedError")),
      },
    });
    /* eslint-disable @typescript-eslint/no-deprecated -- Forces both branches of the legacy clipboard compatibility path to fail. */
    const execCommand = document.execCommand.bind(document);
    document.execCommand = (commandId, showUi, value) => commandId === "copy"
      ? false
      : execCommand(commandId, showUi, value);
    /* eslint-enable @typescript-eslint/no-deprecated */
  });
  await page.route("**/api/ask", async (route) => {
    await route.fulfill({ body: liveStream, contentType: "text/event-stream; charset=utf-8" });
  });
  await page.goto("/");
  await openConversation(page);
  await submitQuestion(page, "Copy this reply");
  const copy = page.getByRole("button", { name: "Copy reply" });
  const answer = page.locator("[data-answer]");
  await hoverReaction(copy);
  await answer.evaluate((element) => {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  const selectedReply = await page.evaluate(() => window.getSelection()?.toString() ?? "");
  expect(selectedReply.trimEnd()).toBe(liveAnswer);
  await copy.click();

  await expect(page.getByRole("status").filter({ hasText: "Copy unavailable." }))
    .toHaveText("Copy unavailable. Select the reply text to copy it.");
  await expect(copy).toBeFocused();
  await expect(copy.locator('[data-copy-icon="copy"]')).toHaveCSS("opacity", "1");
  await expect(page.getByRole("button", { name: "Copied" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Copy reply text" })).toHaveCount(0);
  await expect(page.locator("[data-chat-surface] textarea")).toHaveCount(1);
  await expect(page.getByRole("textbox", { name: "Your question" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString() ?? ""))
    .toBe(selectedReply);
});

test("Retry message regenerates the same exchange without duplicating its question", async ({ page }) => {
  const payloads: unknown[] = [];
  let requestCount = 0;
  await page.route("**/api/ask", async (route) => {
    requestCount += 1;
    payloads.push(route.request().postDataJSON() as unknown);
    const answer = requestCount === 1 ? "Original reply" : "Regenerated reply";
    await route.fulfill({
      body: "event: metadata\ndata: {\"mode\":\"live\"}\n\n"
        + `event: delta\ndata: ${JSON.stringify({ text: answer })}\n\n`
        + "event: done\ndata: {\"sources\":[],\"followUps\":[]}\n\n",
      contentType: "text/event-stream; charset=utf-8",
    });
  });
  await page.goto("/");
  await openConversation(page);
  await submitQuestion(page, "Regenerate this answer");
  const turn = page.locator("[data-turn]");
  const sentBubble = turn.locator('[data-slot="message"][data-align="end"] [data-slot="bubble"]');
  const answerBubble = turn.locator('[data-slot="message"][data-align="start"] [data-slot="bubble"]');
  await expect(answerBubble).toContainText("Original reply");
  await expect(answerBubble.getByRole("button", { name: "Retry message" })).toHaveCount(0);
  await expect(sentBubble.locator('[data-slot="bubble-reactions"] button[aria-label="Retry message"]')).toHaveCount(1);
  await hoverReaction(sentBubble.getByRole("button", { name: "Retry message" }));
  await sentBubble.getByRole("button", { name: "Retry message" }).click();

  await expect(page.locator("[data-turn]")).toHaveCount(1);
  await expect(page.locator("[data-user-message]")).toHaveCount(1);
  await expect(page.locator("[data-user-message]")).toHaveText("Regenerate this answer");
  await expect(page.locator("[data-answer]")).toHaveText("Regenerated reply");
  expect(payloads).toHaveLength(2);
  expect(payloads[1]).toEqual({
    context: { pathname: "/" },
    messages: [{ role: "user", content: "Regenerate this answer" }],
  });
});

test("desktop entry reveals a composer on intent without opening chat", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1_440, height: 900 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
  let requests = 0;
  await page.route("**/api/ask", async (route) => {
    requests += 1;
    await route.fulfill({ body: liveStream, contentType: "text/event-stream" });
  });
  await page.goto("/");
  const launcher = await readyLauncher(page);
  const entry = page.locator("[data-edge-entry]");
  const stroke = page.locator("[data-entry-stroke]");
  const strokeHandle = await stroke.elementHandle();
  const resting = await requiredBox(stroke);
  expect(resting.width).toBeCloseTo(120, 0);
  expect(resting.height).toBeCloseTo(5, 0);
  expect((await requiredBox(launcher)).height).toBeCloseTo(40, 0);
  await expect(stroke).not.toHaveCSS("box-shadow", "none");
  await expectExteriorShadow(page, stroke, "boxShadow", testInfo, "conversation-desktop-line-shadow");
  await launcher.hover();
  const input = page.getByRole("textbox", { name: "Your question" });
  const composer = page.locator('[data-conversation-composer] [data-slot="input-group"]');
  const fade = page.locator("[data-entry-fade]");
  const send = page.getByRole("button", { name: "Send", exact: true });
  await expect(input).toBeVisible();
  await expect(input).toHaveAttribute("placeholder", "Ask about my work…");
  await expect(input).toHaveCSS("font-size", "14px");
  await expect(input).toHaveCSS("line-height", "20px");
  await expect(page.locator("[data-entry-composer-star]")).toBeVisible();
  await expect(send).toBeVisible();
  await expect(send).toHaveText("Send");
  await expect(send).toHaveCSS("background-image", "none");
  expect(await composer.evaluate((element) => {
    const sample = document.createElement("span");
    sample.style.backgroundColor = "var(--background)";
    document.body.append(sample);
    const expected = getComputedStyle(sample).backgroundColor;
    sample.remove();
    return getComputedStyle(element).backgroundColor === expected;
  })).toBe(true);
  await expect(composer).toHaveCSS("opacity", "1");
  expect((await requiredBox(composer)).height).toBeCloseTo(40, 0);
  expect((await requiredBox(input)).height).toBeCloseTo(38, 0);
  expect((await requiredBox(send)).height).toBeCloseTo(32, 0);
  const fadeBox = await requiredBox(fade);
  const entryBox = await requiredBox(entry);
  expect(fadeBox.width).toBeCloseTo(Math.min(entryBox.width + 96, 1_440), 0);
  expect(fadeBox.x + fadeBox.width / 2).toBeCloseTo(720, 0);
  await expect(page.getByRole("dialog", { name: "About my work" })).toBeHidden();
  expect(await stroke.evaluate((element, original) => element === original, strokeHandle)).toBe(true);
  await captureConversation(page, testInfo, "conversation-desktop-hover");
  await input.fill("An unsent first question\nwith a second line\nand a final line");
  const multilineGroupBox = await requiredBox(composer);
  const starBox = await requiredBox(page.locator("[data-entry-composer-star]"));
  const multilineSendBox = await requiredBox(send);
  const starCenter = starBox.y + starBox.height / 2;
  const sendCenter = multilineSendBox.y + multilineSendBox.height / 2;
  expect(starCenter).toBeGreaterThan(multilineGroupBox.y + multilineGroupBox.height / 2);
  expect(sendCenter).toBeGreaterThan(multilineGroupBox.y + multilineGroupBox.height / 2);
  expect(Math.abs(starCenter - sendCenter)).toBeLessThanOrEqual(2);
  expect(multilineGroupBox.y + multilineGroupBox.height - (multilineSendBox.y + multilineSendBox.height)).toBeCloseTo(4, 0);
  await page.mouse.move(0, 0);
  await expect(input).toBeVisible();
  await expect(input).toHaveValue("An unsent first question\nwith a second line\nand a final line");
  await input.fill("");
  await input.blur();
  await expect(entry).toHaveAttribute("data-entry-revealed", "false");
  await expect(input).toBeHidden();
  await expect.poll(async () => (await requiredBox(stroke)).width).toBeCloseTo(120, 0);
  await expect.poll(async () => (await requiredBox(stroke)).height).toBeCloseTo(5, 0);
  expect(requests).toBe(0);
});

test("retained desktop composer moves continuously between the page field and panel", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1_440, height: 900 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
  await installSurfaceClipAnimationControl(page);
  await page.route("**/api/ask", async (route) => {
    await route.fulfill({ body: liveStream, contentType: "text/event-stream; charset=utf-8" });
  });
  await page.goto("/");
  const shell = page.locator("[data-conversation-shell]");
  const surface = page.locator("[data-chat-surface]");
  const composer = page.locator('[data-conversation-composer] [data-slot="input-group"]');
  const reopenField = page.locator("[data-reopen-field]");
  const launcher = await readyLauncher(page);

  await openConversation(page);
  await submitQuestion(page, "Retain one continuous desktop composer");
  await expect(page.locator("[data-answer]")).toHaveText(liveAnswer);
  await page.getByRole("button", { name: "Close conversation" }).click();
  await expect(surface).toBeHidden();
  await expect(surface).not.toHaveAttribute("data-morph");
  await settleSurfaceMotion(surface);
  await launcher.hover();
  await expect(reopenField).toBeVisible();
  const entryBox = await requiredBox(reopenField);
  const originalFontSize = await reopenField.evaluate((element) => getComputedStyle(element).fontSize);

  await pauseNextSurfaceClipAnimation(page);
  await expect(page.locator("[data-edge-entry]")).toHaveAttribute("data-entry-revealed", "true");
  await launcher.click();
  await expect(surface).toHaveAttribute("data-morph", "opening");
  await waitForComposerMorph(composer);
  const history = page.locator("[data-conversation-history]");
  const firstTurn = page.locator("[data-turn]:visible").first();
  /**
   * Samples composer and retained-transcript geometry at one controlled morph point.
   * @param fraction - Normalized opening progress.
   * @returns Composer geometry and transcript position.
   */
  const sampleOpening = async (fraction: number) => {
    await setMotionProgress(shell, fraction);
    return {
      turnY: (await requiredBox(firstTurn)).y,
      composer: await requiredBox(composer),
      scrollTop: await history.evaluate((element) => element.scrollTop),
    };
  };
  const openingStartSample = await sampleOpening(0);
  const openingStart = openingStartSample.composer;
  await captureConversation(page, testInfo, "desktop-reopen-morph-start", "allow");
  const retainedMotionSamples = [openingStartSample, await sampleOpening(0.25)];
  const openingMiddleSample = await sampleOpening(0.5);
  retainedMotionSamples.push(openingMiddleSample);
  const openingMiddle = openingMiddleSample.composer;
  await captureConversation(page, testInfo, "desktop-reopen-morph-middle", "allow");
  retainedMotionSamples.push(await sampleOpening(0.75), await sampleOpening(0.9));
  const openingEndSample = await sampleOpening(1);
  retainedMotionSamples.push(openingEndSample);
  const openingEnd = openingEndSample.composer;
  const transcriptEndY = openingEndSample.turnY;
  await captureConversation(page, testInfo, "desktop-reopen-morph-end", "allow");

  expect(Math.max(...retainedMotionSamples.map(({ turnY }) => turnY))
    - Math.min(...retainedMotionSamples.map(({ turnY }) => turnY)), JSON.stringify(retainedMotionSamples)).toBeLessThanOrEqual(1);
  expect(new Set(retainedMotionSamples.map(({ scrollTop }) => Math.round(scrollTop))).size).toBe(1);

  expect(openingStart.x).toBeCloseTo(entryBox.x, 0);
  expect(openingStart.y).toBeCloseTo(entryBox.y, 0);
  expect(openingStart.width).toBeCloseTo(entryBox.width, 0);
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
  await expect(page.locator("[data-conversation-composer]:visible")).toHaveCount(1);
  await expect(page.locator("[data-reopen-field]:visible, [data-conversation-composer]:visible")).toHaveCount(1);
  expect(await page.getByRole("textbox", { name: "Your question" })
    .evaluate((element) => getComputedStyle(element).fontSize)).toBe(originalFontSize);
  const surfaceBox = await requiredBox(surface);
  expect(openingEnd.x).toBeGreaterThanOrEqual(surfaceBox.x - 1);
  expect(openingEnd.y).toBeGreaterThanOrEqual(surfaceBox.y - 1);
  expect(openingEnd.x + openingEnd.width).toBeLessThanOrEqual(surfaceBox.x + surfaceBox.width + 1);
  expect(openingEnd.y + openingEnd.height).toBeLessThanOrEqual(surfaceBox.y + surfaceBox.height + 1);
  await finishMotion(shell);
  await expect(page.locator("[data-morph]")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Your question" })).toBeFocused();
  await expect.poll(async () => Math.abs((await requiredBox(firstTurn)).y - transcriptEndY)).toBeLessThanOrEqual(1);

  await pauseNextSurfaceClipAnimation(page);
  await page.getByRole("button", { name: "Close conversation" }).click();
  await expect(surface).toHaveAttribute("data-morph", "closing");
  await waitForComposerMorph(composer);
  await setMotionProgress(shell, 0);
  const closingStart = await requiredBox(composer);
  await captureConversation(page, testInfo, "desktop-close-morph-start", "allow");
  await setMotionProgress(shell, 0.5);
  const closingMiddle = await requiredBox(composer);
  await captureConversation(page, testInfo, "desktop-close-morph-middle", "allow");
  await setMotionProgress(shell, 1);
  const closingEnd = await requiredBox(composer);
  await captureConversation(page, testInfo, "desktop-close-morph-end", "allow");
  expect(closingStart.y).toBeCloseTo(openingEnd.y, 0);
  const closeTarget = { x: closingEnd.x + closingEnd.width / 2, y: closingEnd.y + closingEnd.height / 2 };
  const closingStartDistance = Math.hypot(
    closingStart.x + closingStart.width / 2 - closeTarget.x,
    closingStart.y + closingStart.height / 2 - closeTarget.y,
  );
  const closingMiddleDistance = Math.hypot(
    closingMiddle.x + closingMiddle.width / 2 - closeTarget.x,
    closingMiddle.y + closingMiddle.height / 2 - closeTarget.y,
  );
  expect(closingMiddleDistance).toBeLessThan(closingStartDistance);
  await expect(page.locator("[data-conversation-composer]:visible")).toHaveCount(1);
  await expect(page.locator("[data-reopen-field]:visible, [data-conversation-composer]:visible")).toHaveCount(1);
  await finishMotion(shell);
  await expect(surface).toBeHidden();
  await expect(page.locator("[data-morph]")).toHaveCount(0);
});

test("interrupted opening clears motion state before reopening", async ({ page }) => {
  await page.setViewportSize({ width: 1_440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installControlledReply(page, false);
  await page.goto("/");
  const launcher = await readyLauncher(page);
  const surface = page.locator("[data-chat-surface]");

  await launcher.hover();
  await page.getByRole("textbox", { name: "Your question" }).focus();
  await page.getByRole("textbox", { name: "Your question" }).fill("Interrupt this opening");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(surface).toHaveAttribute("data-morph", "opening");
  await page.keyboard.press("Escape");
  await expect(surface).toBeHidden();
  await expect(page.locator("[data-morph]")).toHaveCount(0);

  await reopenConversation(page);
  await expect(surface).toBeVisible();
  await expect(page.locator("[data-morph]")).toHaveCount(0);
  const reopened = await requiredBox(surface);
  expect(reopened.width).toBeCloseTo(652.8, 0);
  await expect(page.locator("[data-conversation-composer]:visible")).toHaveCount(1);
  await expect(page.getByRole("textbox", { name: "Your question" })).toBeFocused();
});

test("reduced motion opens at final geometry without an opening transition", async ({ page }) => {
  await page.setViewportSize({ width: 1_440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installControlledReply(page);
  await page.goto("/");
  const surface = page.locator("[data-chat-surface]");

  await openConversation(page);
  await submitQuestion(page, "Grow without motion");
  await expect(surface).toBeVisible();
  const finalBox = await requiredBox(surface);
  expect(finalBox.width).toBeCloseTo(652.8, 0);
  await expect(page.locator("[data-morph]")).toHaveCount(0);
  await expect(surface).not.toHaveCSS("filter", "none");
  await expect(page.locator("[data-conversation-composer]:visible")).toHaveCount(1);
  await emitReply(page, "Reduced-motion portfolio detail. ".repeat(220));
  await expect(page.locator("[data-answer]")).toContainText("Reduced-motion portfolio detail.");
  expect((await requiredBox(surface)).height).toBeCloseTo(600, 0);
  expect(await surface.evaluate((element) => element.getAnimations().some((animation) => (
    (animation.effect as KeyframeEffect | null)?.getKeyframes().some((frame) => frame.height !== undefined)
  )))).toBe(false);
});

test("streaming content grows the panel smoothly and Start over returns to the focused page field", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1_440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installControlledReply(page);
  await page.goto("/");
  await openConversation(page);
  const surface = page.locator("[data-chat-surface]");
  await submitQuestion(page, "Grow with the streamed answer");
  await expect(surface).not.toHaveAttribute("data-morph");
  await settleSurfaceMotion(surface);
  const pendingHeight = (await requiredBox(surface)).height;
  await emitReply(page, "Short answer.");
  await expect.poll(() => surface.evaluate((element) => element.getAnimations().length)).toBe(0);
  const shortHeight = (await requiredBox(surface)).height;
  const growthFrames = await page.evaluate(async () => {
    const panel = document.querySelector<HTMLElement>("[data-chat-surface]");
    if (!panel) throw new Error("Conversation surface must exist before streaming growth.");
    const startedAt = performance.now();
    const frames: Array<{
      actionsTranslateY: number;
      active: number;
      bubbleActive: number;
      bubbleClipBottom: number;
      bubblePaintedHeight: number;
      duration: number | null;
      height: number;
      time: number;
    }> = [];
    window.dispatchEvent(new CustomEvent("test-reply-chunk", { detail: { text: " More useful detail.".repeat(20), done: false } }));
    let observedAnimation = false;
    while (performance.now() - startedAt < 700) {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve(); }); });
      const animations = panel.getAnimations().filter((animation) => (
        (animation.effect as KeyframeEffect | null)?.getKeyframes().some((frame) => frame.height !== undefined)
      ));
      observedAnimation ||= animations.length > 0;
      const timing = (animations[0]?.effect as KeyframeEffect | null)?.getTiming();
      const bubble = document.querySelector<HTMLElement>("[data-answer-bubble-content]");
      const actions = document.querySelector<HTMLElement>("[data-answer-actions]");
      if (!bubble || !actions) throw new Error("Answer paint and actions must exist during streamed growth.");
      const bubbleActive = bubble.dataset.bubbleGrowing === "true";
      const bubbleClip = getComputedStyle(bubble).clipPath;
      const clipBody = /^inset\(([^)]*)\)/u.exec(bubbleClip)?.[1] ?? "";
      const clipValues = (clipBody.split(/\s+round\s+/u, 1)[0] ?? "").trim().split(/\s+/u);
      const bubbleClipBottom = Number.parseFloat(clipValues.length < 3 ? clipValues[0] ?? "0" : clipValues[2] ?? "0") || 0;
      const actionsTransform = getComputedStyle(actions).transform;
      frames.push({
        actionsTranslateY: actionsTransform === "none" ? 0 : new DOMMatrixReadOnly(actionsTransform).m42,
        active: animations.length,
        bubbleActive: bubbleActive ? 1 : 0,
        bubbleClipBottom,
        bubblePaintedHeight: bubble.getBoundingClientRect().height - bubbleClipBottom,
        duration: typeof timing?.duration === "number" ? timing.duration : null,
        height: panel.getBoundingClientRect().height,
        time: performance.now() - startedAt,
      });
      if (observedAnimation && animations.length === 0 && !bubbleActive) break;
    }
    return frames;
  });
  await testInfo.attach("conversation-growth-frames", { body: JSON.stringify(growthFrames), contentType: "application/json" });
  const animatedFrames = growthFrames.filter(({ active }) => active > 0);
  expect(animatedFrames.length).toBeGreaterThan(1);
  expect(animatedFrames.every(({ active }) => active === 1)).toBe(true);
  expect(animatedFrames.every(({ duration }) => duration !== null && duration >= 240 && duration <= 320)).toBe(true);
  const settledGrowth = growthFrames.at(-1)?.height ?? 0;
  expect(growthFrames.some(({ height }) => height > shortHeight + 1 && height < settledGrowth - 1)).toBe(true);
  const synchronizedFrames = growthFrames.filter(({ active, bubbleActive }) => active > 0 && bubbleActive > 0);
  expect(synchronizedFrames.length).toBeGreaterThan(1);
  expect(synchronizedFrames.some(({ bubbleClipBottom }) => bubbleClipBottom > 1)).toBe(true);
  expect(synchronizedFrames.some(({ actionsTranslateY }) => actionsTranslateY < -1)).toBe(true);
  expect(
    synchronizedFrames.every(({ actionsTranslateY, bubbleClipBottom }) => Math.abs(actionsTranslateY + bubbleClipBottom) < 2),
    JSON.stringify(synchronizedFrames),
  ).toBe(true);
  expect(new Set(synchronizedFrames.map(({ bubblePaintedHeight }) => Math.round(bubblePaintedHeight))).size).toBeGreaterThan(1);
  expect(animatedFrames.at(-1)?.time).toBeLessThanOrEqual(340);
  expect(growthFrames.at(-1)?.active).toBe(0);
  await expect.poll(async () => (await requiredBox(surface)).height).toBeGreaterThan(shortHeight + 8);
  const mediumHeight = (await requiredBox(surface)).height;
  await emitReply(page, " Extended portfolio evidence.".repeat(220));
  const viewportHeight = await page.evaluate(() => window.visualViewport?.height ?? window.innerHeight);
  await expect.poll(async () => (await requiredBox(surface)).height).toBeCloseTo(viewportHeight * 2 / 3, 0);
  const cappedHeight = (await requiredBox(surface)).height;
  expect(new Set([pendingHeight, shortHeight, mediumHeight, cappedHeight].map(Math.round)).size).toBeGreaterThanOrEqual(3);
  expect(cappedHeight).toBeLessThanOrEqual(viewportHeight * 2 / 3 + 1);
  expect(cappedHeight).toBeCloseTo(viewportHeight * 2 / 3, 0);
  const history = page.locator("[data-conversation-history]");
  expect(await history.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  const surfaceBox = await requiredBox(surface);
  const composerBox = await requiredBox(page.getByRole("textbox", { name: "Your question" }));
  expect(composerBox.y + composerBox.height).toBeLessThan(surfaceBox.y + surfaceBox.height);
  await expectExteriorShadow(page, surface, "filter", testInfo, "conversation-intrinsic-height-shadow");

  const activeInput = page.getByRole("textbox", { name: "Your question" });
  await activeInput.focus();
  await expect(activeInput).toBeFocused();
  const activeGroup = page.locator('[data-conversation-composer] [data-slot="input-group"]:visible');
  const focusedRing = await activeGroup.evaluate((element) => getComputedStyle(element).boxShadow);
  expect(focusedRing).not.toBe("none");
  expect(focusedRing).toContain("3px");
  const startOver = page.getByRole("button", { name: "Start over" });
  const resetComposerPaint = page.evaluate(() => new Promise<Array<{ count: number; shadow: string }>>((resolve) => {
    const button = document.querySelector<HTMLButtonElement>('[aria-label="Start over"]');
    if (!button) throw new Error("Start over must exist before tracing composer paint.");
    button.addEventListener("click", () => {
      const frames: Array<{ count: number; shadow: string }> = [];
      const startedAt = performance.now();
      /** Records one visible composer-ring frame through reset. */
      const sample = (): void => {
        const groups = [...document.querySelectorAll<HTMLElement>('[data-conversation-composer] [data-slot="input-group"]')]
          .filter((element) => {
            const style = getComputedStyle(element);
            return element.getClientRects().length > 0
              && style.display !== "none"
              && style.visibility === "visible"
              && style.opacity !== "0";
          });
        const [group] = groups;
        frames.push({ count: groups.length, shadow: groups.length === 1 && group ? getComputedStyle(group).boxShadow : "" });
        if (performance.now() - startedAt >= 450) resolve(frames);
        else requestAnimationFrame(sample);
      };
      sample();
    }, { once: true });
  }));
  const resetPaint = page.evaluate(() => new Promise<Array<{ boxShadow: string; connected: boolean; focusVisible: boolean; outlineColor: string; outlineStyle: string }>>((resolve) => {
    const button = document.querySelector<HTMLButtonElement>('[aria-label="Start over"]');
    if (!button) throw new Error("Start over must exist before pointer reset.");
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
  await startOver.click();
  const resetComposerFrames = await resetComposerPaint;
  const resetFrames = await resetPaint;
  await testInfo.attach("desktop-reset-composer-ring", { body: JSON.stringify(resetComposerFrames), contentType: "application/json" });
  expect(resetComposerFrames.length).toBeGreaterThan(2);
  expect(resetComposerFrames.every(({ count, shadow }) => count === 1 && shadow === focusedRing), JSON.stringify(resetComposerFrames)).toBe(true);
  const paintedResetFrames = resetFrames.filter(({ connected }) => connected);
  expect(paintedResetFrames.length).toBeGreaterThan(0);
  expect(paintedResetFrames.every(({ boxShadow, focusVisible, outlineColor, outlineStyle }) => (
    !focusVisible && boxShadow === "none" && (outlineStyle === "none" || outlineColor === "rgba(0, 0, 0, 0)")
  )), JSON.stringify(resetFrames)).toBe(true);
  await expect(page.locator("[data-turn]")).toHaveCount(0);
  await expect(surface).toBeHidden();
  const freshInput = page.getByRole("textbox", { name: "Your question" });
  await expect(freshInput).toBeVisible();
  await expect(freshInput).toHaveValue("");
  await expect(freshInput).toBeFocused();
  await expect(page.locator("[data-edge-entry]")).toHaveAttribute("data-entry-revealed", "true");
  await expect(page.locator("[data-conversation-composer]:visible")).toHaveCount(1);
  await captureConversation(page, testInfo, "desktop-start-over-field");
});

test("new content retargets active panel growth without stale completion", async ({ page }) => {
  await page.setViewportSize({ width: 1_440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installControlledReply(page);
  await page.goto("/");
  await openConversation(page);
  await submitQuestion(page, "Retarget the panel growth");
  const surface = page.locator("[data-chat-surface]");
  await expect(surface).not.toHaveAttribute("data-morph");
  await settleSurfaceMotion(surface);
  await emitReply(page, "Short answer.");
  await expect.poll(() => surface.evaluate((element) => element.getAnimations().length)).toBe(0);

  const frames = await page.evaluate(async () => {
    const panel = document.querySelector<HTMLElement>("[data-chat-surface]");
    if (!panel) throw new Error("Conversation surface must exist before retargeting growth.");
    const captured: Array<{ active: number; height: number }> = [];
    window.dispatchEvent(new CustomEvent("test-reply-chunk", { detail: { text: " First growth.".repeat(20), done: false } }));
    for (let index = 0; index < 2; index += 1) {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve(); }); });
    }
    window.dispatchEvent(new CustomEvent("test-reply-chunk", { detail: { text: " Retargeted growth.".repeat(220), done: false } }));
    let observedAnimation = false;
    const startedAt = performance.now();
    while (performance.now() - startedAt < 700) {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve(); }); });
      const active = panel.getAnimations().filter((animation) => (
        (animation.effect as KeyframeEffect | null)?.getKeyframes().some((frame) => frame.height !== undefined)
      )).length;
      observedAnimation ||= active > 0;
      captured.push({
        active,
        height: panel.getBoundingClientRect().height,
      });
      if (observedAnimation && active === 0) break;
    }
    return captured;
  });
  expect(frames.some(({ active }) => active === 1)).toBe(true);
  expect(Math.max(...frames.map(({ active }) => active))).toBe(1);
  expect(frames.at(-1)?.active).toBe(0);
  const viewportHeight = await page.evaluate(() => window.visualViewport?.height ?? window.innerHeight);
  await expect.poll(async () => (await requiredBox(surface)).height).toBeCloseTo(viewportHeight * 2 / 3, 0);
  expect(await surface.evaluate((element) => element.style.height)).toBe("");
});

test("the active conversation stays inside representative compact, tablet, and desktop widths", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installControlledReply(page, false);
  for (const width of [320, 1_024, 1_440]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await openConversation(page);
    await submitQuestion(page, `Check ${String(width)} pixel bounds`);
    const surface = await requiredBox(page.locator("[data-chat-surface]"));

    expect(await page.locator("html").evaluate((root) => root.scrollWidth <= root.clientWidth)).toBe(true);
    expect(surface.width).toBeLessThanOrEqual(width < 640 ? width : 653);
    expect(surface.height).toBeLessThanOrEqual(width < 640 ? 800 : 800 * 2 / 3 + 1);
    expect(surface.x).toBeGreaterThanOrEqual(0);
    expect(surface.x + surface.width).toBeLessThanOrEqual(width);
  }
});

test("pointer reopen keeps focus paint off the launcher throughout the reveal", async ({ page }) => {
  await page.setViewportSize({ width: 1_440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installSurfaceClipAnimationControl(page);
  await installControlledReply(page, false);
  await page.goto("/");
  const launcher = await readyLauncher(page);
  const shell = page.locator("[data-conversation-shell]");
  const composer = page.locator('[data-conversation-composer] [data-slot="input-group"]');
  const stroke = page.locator("[data-entry-stroke]");
  const surface = page.locator("[data-chat-surface]");

  await openConversation(page);
  await expect(page.getByRole("textbox", { name: "Your question" })).toBeFocused();
  await submitQuestion(page, "Preserve pointer reopen focus paint");
  await page.getByRole("button", { name: "Close conversation" }).click();
  await expect(surface).toBeHidden();
  await expect(surface).not.toHaveAttribute("data-morph");
  await settleSurfaceMotion(surface);
  await launcher.hover();
  await pauseNextSurfaceClipAnimation(page);
  await expect(page.locator("[data-edge-entry]")).toHaveAttribute("data-entry-revealed", "true");
  await launcher.click();
  await waitForComposerMorph(composer);
  await setMotionProgress(shell, 0);
  await expect(launcher).toHaveCSS("outline-style", "none");
  await expect(launcher).toHaveCSS("box-shadow", "none");
  await expect(stroke).toHaveCSS("outline-style", "none");
  await setMotionProgress(shell, 0.5);
  await expect(launcher).toHaveCSS("outline-style", "none");
  await expect(launcher).toHaveCSS("box-shadow", "none");
  await expect(stroke).toHaveCSS("outline-style", "none");
  await finishMotion(shell);
  await expect(page.getByRole("textbox", { name: "Your question" })).toBeFocused();
});

test("pointer dismissal restores the launcher line while keyboard dismissal restores visible focus", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1_440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installControlledReply(page, false);
  await page.goto("/");
  const launcher = await readyLauncher(page);
  const entry = page.locator("[data-edge-entry]");
  const stroke = page.locator("[data-entry-stroke]");

  await openConversation(page);
  await expect(page.getByRole("textbox", { name: "Your question" })).toBeFocused();
  await submitQuestion(page, "Preserve dismissal focus behavior");
  await page.getByRole("button", { name: "Close conversation" }).click();
  await expect(launcher).toBeFocused();
  expect((await requiredBox(stroke)).width).toBeCloseTo(120, 0);
  expect((await requiredBox(stroke)).height).toBeCloseTo(5, 0);
  await expect(launcher).toHaveCSS("box-shadow", "none");
  expect(await launcher.evaluate((element) => {
    const style = getComputedStyle(element);
    return style.outlineStyle === "none" || style.outlineColor === "rgba(0, 0, 0, 0)";
  })).toBe(true);

  await launcher.hover();
  await expect(entry).toHaveAttribute("data-entry-revealed", "true");
  await captureConversation(page, testInfo, "launcher-hover-after-pointer-close");
  await expect(launcher).toHaveCSS("box-shadow", "none");
  await expect(launcher).toHaveCSS("outline-style", "none");
  await page.mouse.move(0, 0);
  await expect(entry).toHaveAttribute("data-entry-revealed", "false");
  await expect(launcher).toHaveCSS("box-shadow", "none");

  await launcher.focus();
  await page.keyboard.press("Enter");
  const close = page.getByRole("button", { name: "Close conversation" });
  await close.focus();
  await page.keyboard.press("Enter");
  await expect(launcher).toBeFocused();
  expect(await launcher.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await expect(entry).toHaveAttribute("data-entry-revealed", "false");
  await expect(launcher).toHaveCSS("outline-style", "none");
  await expect(launcher).toHaveCSS("box-shadow", "none");
  await expect(stroke).toHaveCSS("outline-style", "solid");
  await expect(stroke).toHaveCSS("outline-width", "2px");

  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "About my work" })).toBeHidden();
  await expect(page.locator("[data-morph]")).toHaveCount(0);
  await expect(launcher).toBeFocused();

  await launcher.hover();
  await expect(entry).toHaveAttribute("data-entry-revealed", "true");
  await launcher.click();
  const email = page.getByRole("textbox", { name: "Email" });
  await email.click();
  await expect(page.getByRole("dialog", { name: "About my work" })).toBeHidden();
  await expect(email).toBeFocused();
  await expect(stroke).toBeVisible();
  await expect(stroke).not.toHaveCSS("background-image", "none");
});

test("desktop retained line reveals a stable rounded field and reopens its existing thread", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1_440, height: 900 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "no-preference" });
  await page.route("**/api/ask", async (route) => {
    await route.fulfill({ body: liveStream, contentType: "text/event-stream; charset=utf-8" });
  });
  await page.goto("/");
  const launcher = await readyLauncher(page);
  await openConversation(page);
  await submitQuestion(page, "Keep this retained desktop thread");
  await expect(page.locator("[data-answer]")).toHaveText(liveAnswer);
  await page.getByRole("button", { name: "Close conversation" }).click();
  await expect(page.locator("[data-chat-surface]")).toBeHidden();
  await expect(page.locator("[data-entry-stroke]")).not.toHaveCSS("background-image", "none");

  await launcher.hover();
  const entry = page.locator("[data-edge-entry]");
  const field = page.locator("[data-reopen-field]");
  await expect(entry).toHaveAttribute("data-entry-revealed", "true");
  await expect(field).toBeVisible();
  expect((await requiredBox(field)).height).toBeCloseTo(40, 0);
  const samples = await entry.evaluate(async (element) => {
    const launcherElement = element.querySelector<HTMLElement>("[data-launcher]");
    const fieldElement = element.querySelector<HTMLElement>("[data-reopen-field]");
    if (!launcherElement || !fieldElement) throw new Error("Retained launcher paint must be available while hovered.");
    const frames: Array<{ revealed: string | null; launcherBackground: string; fieldBackground: string }> = [];
    const until = performance.now() + 650;
    while (performance.now() < until) {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve(); }); });
      frames.push({
        revealed: element.getAttribute("data-entry-revealed"),
        launcherBackground: getComputedStyle(launcherElement).backgroundColor,
        fieldBackground: getComputedStyle(fieldElement).backgroundColor,
      });
    }
    return frames;
  });
  expect(samples.every(({ revealed }) => revealed === "true")).toBe(true);
  expect(samples.every(({ launcherBackground }) => launcherBackground === "rgba(0, 0, 0, 0)")).toBe(true);
  expect(samples.every(({ fieldBackground }) => fieldBackground !== "rgba(0, 0, 0, 0)")).toBe(true);

  const roundedPaint = await launcher.screenshot({ animations: "allow" });
  const originalStyle = await field.evaluate((element) => {
    const value = element.getAttribute("style");
    element.style.borderRadius = "0";
    element.style.clipPath = "none";
    return value;
  });
  const squarePaint = await launcher.screenshot({ animations: "allow" });
  await field.evaluate((element, value) => {
    if (value === null) element.removeAttribute("style");
    else element.setAttribute("style", value);
  }, originalStyle);
  expect(roundedPaint.equals(squarePaint)).toBe(false);
  await captureConversation(page, testInfo, "desktop-retained-reopen-field");
  expect(await field.evaluate((element) => getComputedStyle(element).borderRadius)).toBe(
    await page.locator("#contact-name").evaluate((element) => getComputedStyle(element).borderRadius),
  );

  await launcher.click();
  const dialog = page.getByRole("dialog", { name: "About my work" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-header-chrome] span").filter({ hasText: /^About my work$/u })).toHaveCount(0);
  await expect(page.locator("[data-answer]")).toHaveText(liveAnswer);
  await expect(page.locator("[data-user-message]")).toHaveText("Keep this retained desktop thread");
});

test("validation, safe Markdown, and completion announcements stay separated", async ({ page }) => {
  let responseCount = 0;
  await page.route("**/api/ask", async (route) => {
    responseCount += 1;
    await route.fulfill({
      body: responseCount === 1
        ? "event: metadata\ndata: {\"mode\":\"live\"}\n\n"
          + "event: delta\ndata: {\"text\":\"<img src=x onerror=alert(1)>\"}\n\n"
          + "event: done\ndata: {\"sources\":[],\"followUps\":[]}\n\n"
        : "event: metadata\ndata: {\"mode\":\"live\"}\n\n"
          + "event: error\ndata: {\"message\":\"SECRET provider detail\"}\n\n",
      contentType: "text/event-stream; charset=utf-8",
    });
  });
  await page.goto("/");
  await openConversation(page);
  const input = page.getByRole("textbox", { name: "Your question" });

  await input.fill("   ");
  await page.getByRole("button", { exact: true, name: "Send" }).click();
  expect(await input.evaluate((element: HTMLTextAreaElement) => element.validationMessage)).toContain("Write a question");
  await expect(page.locator("[data-turn]")).toHaveCount(0);
  await input.fill("x".repeat(12_001));
  await expect(input).toHaveAttribute("maxlength", "12000");
  await expect(input).toHaveValue("x".repeat(12_000));

  await input.fill("Render this literally");
  await page.getByRole("button", { exact: true, name: "Send" }).click();
  const answer = page.locator("[data-answer]");
  await expect(answer).toHaveText("<img src=x onerror=alert(1)>");
  await expect(answer.locator("img")).toHaveCount(0);
  await expect(page.getByRole("log", { name: "Conversation" })).toHaveAttribute("aria-live", "off");
  await expect(page.locator("[data-conversation-status]")).toHaveAttribute("aria-live", "polite");
  await expect(page.locator("[data-conversation-status]")).toHaveText("Answer complete.");

  await page.getByRole("button", { name: "Start over" }).click();
  await submitQuestion(page, "Cause a safe error");
  await expect(page.locator("[data-turn]").getByText("Unable to finish the answer. Please try again.", { exact: true }))
    .toBeVisible();
  const failedReply = page.locator('[data-slot="bubble"][data-variant="destructive"]');
  await expect(failedReply).toContainText("Unable to finish the answer. Please try again.");
  await expect(page.locator('[aria-label="Failure details"]')).toBeAttached();
  const sentMessage = page.locator('[data-slot="message"][data-align="end"] [data-slot="bubble"]');
  await expect(sentMessage.locator('[data-slot="bubble-reactions"] button[aria-label="Retry message"]')).toBeAttached();
  await expect(failedReply.getByRole("button", { name: "Retry message" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Options for failed reply" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit question" })).toHaveCount(0);
  await expect(page.locator("[data-conversation-status]")).toHaveText("Unable to finish the answer. Please try again.");
  await expect(page.locator("[data-conversation-status]")).not.toContainText("SECRET");
});

test("Retry message in the sent bubble replaces the failed reply", async ({ page }) => {
  let requestCount = 0;
  await page.route("**/api/ask", async (route) => {
    requestCount += 1;
    await route.fulfill({
      body: requestCount === 1
        ? "event: metadata\ndata: {\"mode\":\"live\"}\n\n"
          + "event: error\ndata: {\"message\":\"Private provider detail\"}\n\n"
        : liveStream,
      contentType: "text/event-stream; charset=utf-8",
    });
  });
  await page.goto("/");
  await openConversation(page);
  await submitQuestion(page, "Try this request again");
  const turn = page.locator("[data-turn]");
  const sentMessage = turn.locator('[data-slot="message"][data-align="end"] [data-slot="bubble"]');
  await expect(sentMessage.locator('[data-slot="bubble-reactions"] button[aria-label="Retry message"]')).toBeAttached();
  await hoverReaction(turn.getByRole("button", { name: "Retry message" }));
  await turn.getByRole("button", { name: "Retry message" }).click();

  await expect(page.locator("[data-turn]")).toHaveCount(1);
  await expect(page.locator('[data-slot="bubble"][data-variant="destructive"]')).toHaveCount(0);
  await expect(page.locator("[data-answer]")).toHaveText(liveAnswer);
  expect(requestCount).toBe(2);
});

test("failure details open on hover and focus without adding recovery options", async ({ page }, testInfo) => {
  await page.route("**/api/ask", async (route) => {
    await route.fulfill({
      body: "event: metadata\ndata: {\"mode\":\"live\"}\n\n"
        + "event: error\ndata: {\"message\":\"Private provider detail\"}\n\n",
      contentType: "text/event-stream; charset=utf-8",
    });
  });
  await page.setViewportSize({ width: 1_440, height: 900 });
  await page.goto("/");
  const conversation = await openConversation(page);
  await submitQuestion(page, "Explain this failure");
  const info = page.locator('[aria-label="Failure details"]');
  const tooltip = page.getByRole("tooltip");
  const turn = page.locator("[data-turn]");
  const infoPill = turn.locator('[data-slot="bubble-reactions"]').filter({ has: info });
  const retryPill = turn.locator('[data-slot="bubble-reactions"][aria-label="Message actions"]');
  const retry = turn.getByRole("button", { name: "Retry message" });
  const infoVisual = info.locator("[data-reaction-visual]");
  const retryVisual = retry.locator("[data-reaction-visual]");
  await expect(info).toBeAttached();
  await expect(infoVisual).toHaveCSS("opacity", "0");
  await expect(retryVisual).toHaveCSS("opacity", "0");
  expect(await info.evaluate((element) => element.tagName)).toBe("SPAN");
  await expect(info).toHaveCSS("cursor", "default");
  await expect(retry).toHaveCSS("cursor", "pointer");
  const bubbleBox = await requiredBox(turn.locator('[data-slot="message"][data-align="start"] [data-slot="bubble"]'));
  await hoverReaction(info);
  const footerBox = await requiredBox(infoPill);
  expect(footerBox.x - bubbleBox.x).toBeCloseTo(12, 0);
  await page.mouse.move(0, 0);
  await hoverReaction(retry);
  const retryBox = await requiredBox(retryPill);
  expect(footerBox.width).toBeCloseTo(footerBox.height, 0);
  expect(footerBox.width).toBeCloseTo(retryBox.width, 0);
  expect(footerBox.height).toBeCloseTo(retryBox.height, 0);

  await page.mouse.move(0, 0);
  await hoverReaction(info);
  await info.hover();
  await expect(tooltip).toContainText("The answer service reported a failure while generating this reply.");
  await expect(tooltip).not.toContainText("Private provider detail");
  await info.click();
  await expect(tooltip).toBeVisible();
  await expect(info).toHaveAccessibleDescription("The answer service reported a failure while generating this reply.");
  await captureConversation(page, testInfo, "conversation-failed-details-desktop");
  await page.mouse.move(0, 0);
  await expect(tooltip).toBeHidden();
  await page.getByRole("textbox", { name: "Your question" }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(info).toBeFocused();
  await expect(tooltip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tooltip).toBeHidden();
  await expect(conversation).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit question" })).toHaveCount(0);
});

test("closing the native conversation clears an open failure tooltip", async ({ page }) => {
  await page.route("**/api/ask", async (route) => {
    await route.fulfill({
      body: "event: metadata\ndata: {\"mode\":\"live\"}\n\n"
        + "event: error\ndata: {\"message\":\"Private provider detail\"}\n\n",
      contentType: "text/event-stream; charset=utf-8",
    });
  });
  await page.goto("/");
  const conversation = await openConversation(page);
  await submitQuestion(page, "Close with details open");
  const info = page.locator('[aria-label="Failure details"]');
  await page.getByRole("textbox", { name: "Your question" }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(info).toBeFocused();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  await conversation.evaluate((element: HTMLElement) => { element.hidePopover(); });
  await expect(conversation).toBeHidden();
  await expect(tooltip).toBeHidden();

  await reopenConversation(page);
  await expect(tooltip).toBeHidden();
  await expect(page.locator('[aria-label="Failure details"]')).toBeAttached();
});

test("Stop preserves partial text, Retry replaces it, and Start over invalidates memory", async ({ page }) => {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    let requestCount = 0;
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.endsWith("/api/ask")) return nativeFetch(input, init);
      requestCount += 1;
      const encoder = new TextEncoder();
      const first = requestCount === 1;
      const body = new ReadableStream<Uint8Array>({
        /** Emits a partial first answer or a complete retry response.
         * @param controller - Synthetic answer stream controller.
         */
        start: (controller) => {
          controller.enqueue(encoder.encode("event: metadata\ndata: {\"mode\":\"live\"}\n\n"));
          controller.enqueue(encoder.encode(`event: delta\ndata: {\"text\":\"${first ? "Old partial" : "Fresh answer"}\"}\n\n`));
          if (first) {
            window.addEventListener("test-release-stale-reply", () => {
              try {
                controller.enqueue(encoder.encode("event: delta\ndata: {\"text\":\" stale suffix\"}\n\n"));
                controller.enqueue(encoder.encode("event: done\ndata: {\"sources\":[],\"followUps\":[]}\n\n"));
                controller.close();
              } catch {
                // Reader cancellation intentionally wins this delayed stale response.
              }
            }, { once: true });
          } else {
            controller.enqueue(encoder.encode("event: done\ndata: {\"sources\":[],\"followUps\":[]}\n\n"));
            controller.close();
          }
        },
      });
      return Promise.resolve(new Response(body, { headers: { "Content-Type": "text/event-stream" } }));
    };
  });
  await page.goto("/");
  await openConversation(page);
  await submitQuestion(page, "Test cancellation");
  const answer = page.locator("[data-answer]");
  await expect(answer).toHaveText("Old partial");
  await expect(page.locator("[data-conversation-status]")).toBeEmpty();

  await page.getByRole("button", { name: "Stop" }).click();
  await expect(answer).toHaveText("Old partial");
  const stoppedTurn = page.locator("[data-turn]");
  const stoppedBubbleLocator = stoppedTurn.locator('[data-slot="message"][data-align="start"] [data-slot="bubble"]');
  const sentMessage = stoppedTurn.locator('[data-slot="message"][data-align="end"] [data-slot="bubble"]');
  await expect(stoppedBubbleLocator.getByRole("button", { name: "Retry message" })).toHaveCount(0);
  await expect(sentMessage.locator('[data-slot="bubble-reactions"] button[aria-label="Retry message"]')).toHaveCount(1);
  await expect(stoppedTurn.locator('[data-slot="bubble-reactions"][aria-label="Message actions"]')).toHaveCount(1);
  await hoverReaction(page.getByRole("button", { name: "Retry message" }));
  await page.getByRole("button", { name: "Retry message" }).click();
  await expect(answer).toHaveText("Fresh answer");
  await expect(page.locator("[data-conversation-status]")).toHaveText("Answer complete.");
  await releaseStaleReply(page);
  await expect(answer).toHaveText("Fresh answer");

  const startOver = page.getByRole("button", { name: "Start over" });
  await expect(startOver.locator("svg.lucide-message-circle-plus")).toHaveCount(1);
  await startOver.click();
  await expect(page.locator("[data-turn]")).toHaveCount(0);
  await expect(page.locator("[data-chat-surface]")).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Your question" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Your question" })).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "Your question" })).toBeFocused();
  await expect(page.locator("[data-conversation-composer]:visible")).toHaveCount(1);
  await expect(page.locator("[data-conversation-status]")).toHaveCount(0);
});

test("transcript scrolling stays local while page scrolling remains available outside", async ({ page }) => {
  const longAnswer = "A long portfolio answer. ".repeat(90);
  await page.route("**/api/ask", async (route) => {
    await route.fulfill({
      body: "event: metadata\ndata: {\"mode\":\"live\"}\n\n"
        + `event: delta\ndata: ${JSON.stringify({ text: longAnswer })}\n\n`
        + "event: done\ndata: {\"sources\":[],\"followUps\":[]}\n\n",
      contentType: "text/event-stream; charset=utf-8",
    });
  });
  await page.setViewportSize({ width: 1_440, height: 800 });
  await page.goto("/");
  await openConversation(page);
  await submitQuestion(page, "Give me the long version");
  await expect(page.locator("[data-answer]")).toHaveText(longAnswer);
  const history = page.locator("[data-conversation-history]");
  await history.evaluate((element) => { element.scrollTop = 0; });
  const documentStart = await page.evaluate(() => window.scrollY);
  await history.hover();
  await page.mouse.wheel(0, 500);
  await expect.poll(() => history.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(documentStart, 0);

  await page.getByRole("button", { name: "Close conversation" }).click();
  await page.mouse.move(200, 300);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(documentStart);
});

test("an unrelated generated sheet marker does not suppress or cancel conversation", async ({ page }) => {
  await page.route("**/api/ask", async (route) => {
    await new Promise<void>((resolveDone) => { setTimeout(resolveDone, 150); });
    await route.fulfill({ body: liveStream, contentType: "text/event-stream; charset=utf-8" });
  });
  await page.goto("/");
  const dialog = await openConversation(page);
  await submitQuestion(page, "Keep this request active");
  await page.evaluate(() => {
    const unrelatedSheet = document.createElement("div");
    unrelatedSheet.dataset.slot = "sheet-content";
    unrelatedSheet.dataset.testUnrelatedSheet = "true";
    document.body.append(unrelatedSheet);
  });

  await expect(dialog).toBeVisible();
  await expect(page.locator("[data-conversation-shell]")).toHaveAttribute("data-hidden", "false");
  await expect(page.locator("[data-answer]")).toHaveText(liveAnswer);
  await expect(page.locator("[data-conversation-status]")).toHaveText("Answer complete.");
  await page.locator("[data-test-unrelated-sheet]").evaluate((element) => { element.remove(); });
});

test("mobile navigation suppresses conversation and route changes preserve completed memory", async ({ page }) => {
  await page.route("**/api/ask", async (route) => {
    await route.fulfill({ body: liveStream, contentType: "text/event-stream; charset=utf-8" });
  });
  await page.setViewportSize({ width: 768, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await openConversation(page);
  await page.locator("#about").evaluate((section) => { section.scrollIntoView(); });
  await expect(page.getByRole("button", { name: "Jump to section" })).toBeVisible();
  await page.getByRole("button", { name: "Jump to section" }).click();
  const navigation = page.getByRole("dialog", { name: "Jump to section" });
  await expect(navigation).toBeVisible();
  await expect(page.getByRole("button", { name: "Close navigation" })).toBeFocused();
  await expect(page.getByRole("dialog", { name: "About my work" })).toBeHidden();
  await expect(page.locator("[data-conversation-shell]")).toHaveAttribute("data-hidden", "true");
  await page.getByRole("button", { name: "Close navigation" }).click();
  await expect(navigation).toBeHidden();
  await expect(page.getByRole("button", { name: "Jump to section" })).toBeFocused();
  await expect(await readyLauncher(page)).toBeVisible();

  await openConversation(page);
  await submitQuestion(page, "Remember this question");
  await expect(page.locator("[data-answer]")).toHaveText(liveAnswer);
  await page.getByRole("textbox", { name: "Your question" }).fill("Preserved draft");
  const projectsLink = page.locator('[data-slot="more-projects-link"]');
  await placeInUpperViewport(projectsLink);
  await projectsLink.click();
  await expect(page).toHaveURL(/\/projects$/u);
  await expect(page.getByRole("dialog", { name: "About my work" })).toBeHidden();
  await reopenConversation(page);
  await expect(page.locator("[data-turn]")).toHaveCount(1);
  await expect(page.getByRole("textbox", { name: "Your question" })).toHaveValue("Preserved draft");
});

test("route navigation during close motion preserves history without stealing destination focus", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.route("**/api/ask", async (route) => {
    await route.fulfill({ body: liveStream, contentType: "text/event-stream; charset=utf-8" });
  });
  await page.goto("/");
  await openConversation(page);
  await submitQuestion(page, "Remember this closing conversation");
  await expect(page.locator("[data-answer]")).toHaveText(liveAnswer);
  await page.getByRole("textbox", { name: "Your question" }).fill("Preserved during close");
  const projectsLink = page.locator('[data-slot="more-projects-link"]');
  await placeInUpperViewport(projectsLink);
  const surface = page.locator("[data-chat-surface]");
  await page.getByRole("button", { name: "Close conversation" }).click();
  await expect(surface).toHaveAttribute("data-morph", "closing");
  await surface.evaluate((element) => {
    for (const animation of element.getAnimations({ subtree: true })) {
      if (animation.effect?.getTiming().iterations !== Infinity) animation.pause();
    }
  });

  await projectsLink.click();
  await expect(page).toHaveURL(/\/projects$/u);
  const routeFocus = await page.evaluate(() => {
    const active = document.activeElement;
    return {
      id: active?.id ?? "",
      isLauncher: active instanceof HTMLElement && active.dataset.launcher === "true",
      tag: active?.tagName ?? "",
    };
  });
  expect(routeFocus.isLauncher).toBe(false);
  await testInfo.attach("focus-after-route", {
    body: Buffer.from(JSON.stringify(routeFocus)),
    contentType: "application/json",
  });
  const destinationLink = page.locator("main a").first();
  await destinationLink.focus();
  await expect(destinationLink).toBeFocused();
  await expect(page.locator("[data-morph]")).toHaveCount(0);
  await page.waitForTimeout(350);
  await expect(destinationLink).toBeFocused();
  const launcher = await readyLauncher(page);
  await expect(launcher).toBeVisible();
  await launcher.click();
  await expect(page.locator("[data-turn]")).toHaveCount(1);
  await expect(page.getByRole("textbox", { name: "Your question" })).toHaveValue("Preserved during close");
});

test("modal, route, and reset cancellation reject delayed stale answers", async ({ page }) => {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    let requestCount = 0;
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.endsWith("/api/ask")) return nativeFetch(input, init);
      requestCount += 1;
      const answer = `Partial ${String(requestCount)}`;
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        /** Emits a partial answer followed by a deliberately delayed completion.
         * @param controller - Synthetic answer stream controller.
         */
        start: (controller) => {
          controller.enqueue(encoder.encode("event: metadata\ndata: {\"mode\":\"live\"}\n\n"));
          controller.enqueue(encoder.encode(`event: delta\ndata: ${JSON.stringify({ text: answer })}\n\n`));
          window.addEventListener("test-release-stale-reply", () => {
            try {
              controller.enqueue(encoder.encode("event: delta\ndata: {\"text\":\" stale\"}\n\n"));
              controller.enqueue(encoder.encode("event: done\ndata: {\"sources\":[],\"followUps\":[]}\n\n"));
              controller.close();
            } catch {
              // Shell cancellation intentionally wins the delayed response.
            }
          }, { once: true });
        },
      });
      return Promise.resolve(new Response(body, { headers: { "Content-Type": "text/event-stream" } }));
    };
  });
  await page.setViewportSize({ width: 768, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await openConversation(page);

  await submitQuestion(page, "Cancel for modal");
  await expect(page.locator("[data-answer]")).toHaveText("Partial 1");
  await page.locator("#about").evaluate((section) => { section.scrollIntoView(); });
  await page.getByRole("button", { name: "Jump to section" }).click();
  await expect(page.getByText("Reply stopped.", { exact: true })).toBeAttached();
  await releaseStaleReply(page);
  await page.getByRole("button", { name: "Close navigation" }).click();
  await reopenConversation(page);
  await expect(page.locator("[data-answer]")).toHaveText("Partial 1");
  await expect(page.getByText("Reply stopped.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Start over" }).click();
  await submitQuestion(page, "Cancel for route");
  await expect(page.locator("[data-answer]")).toHaveText("Partial 2");
  const projectsLink = page.locator('[data-slot="more-projects-link"]');
  await placeInUpperViewport(projectsLink);
  await projectsLink.click();
  await expect(page).toHaveURL(/\/projects$/u);
  await expect(page.getByText("Reply stopped.", { exact: true })).toBeAttached();
  await releaseStaleReply(page);
  await reopenConversation(page);
  await expect(page.locator("[data-answer]")).toHaveText("Partial 2");
  await expect(page.getByText("Reply stopped.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Start over" }).click();
  await submitQuestion(page, "Cancel for reset");
  await expect(page.locator("[data-answer]")).toHaveText("Partial 3");
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.locator("[data-turn]")).toHaveCount(0);
  await releaseStaleReply(page);
  await expect(page.locator("[data-conversation-status]")).toHaveCount(0);
  await expect(page.locator("[data-chat-surface]")).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Your question" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Your question" })).toBeFocused();
});

test("splash suppression, viewport bounds, reduced motion, and themes preserve the shell", async ({ page }, testInfo) => {
  await page.route("**/api/ask", async (route) => {
    await route.fulfill({ body: liveStream, contentType: "text/event-stream; charset=utf-8" });
  });
  await page.setViewportSize({ width: 1_440, height: 900 });
  await page.goto("/?debugSplash");
  await expect(page.locator('[data-slot="opening-splash"]')).toBeVisible();
  await expect(page.locator("button[data-launcher]")).toBeHidden();

  const themeSurfaceColors: string[] = [];
  const themeLauncherColors: string[] = [];
  for (const preference of [
    { colorScheme: "light", theme: "light" },
    { colorScheme: "dark", theme: "dark" },
    { colorScheme: "dark", theme: "system" },
  ] as const) {
    await page.goto("/");
    await page.evaluate((value) => { localStorage.setItem("theme", value); }, preference.theme);
    await page.emulateMedia({ colorScheme: preference.colorScheme, reducedMotion: "reduce" });
    await page.reload();
    const launcher = await readyLauncher(page);
    await launcher.hover();
    const launcherPaint = await page.getByRole("textbox", { name: "Your question" }).evaluate((element) => {
      const sample = document.createElement("span");
      sample.style.color = "var(--foreground)";
      sample.style.backgroundImage = "var(--brand-accent-text-gradient)";
      document.body.append(sample);
      const expectedColor = getComputedStyle(sample).color;
      const expectedBackground = getComputedStyle(sample).backgroundImage;
      sample.remove();
      const stroke = document.querySelector<HTMLElement>("[data-entry-stroke]");
      if (!stroke) throw new Error("Launcher stroke must exist for theme sampling.");
      return {
        actualBackground: getComputedStyle(stroke).backgroundImage,
        actualColor: getComputedStyle(element).color,
        expectedBackground,
        expectedColor,
      };
    });
    expect(launcherPaint.actualColor).toBe(launcherPaint.expectedColor);
    expect(launcherPaint.actualBackground).toBe(launcherPaint.expectedBackground);
    themeLauncherColors.push(launcherPaint.actualColor);
    await captureConversation(page, testInfo, `conversation-launcher-${preference.theme}`);
    await page.mouse.move(0, 0);
    const entryBox = await requiredBox(page.locator("[data-edge-entry]"));
    expect(entryBox.y + entryBox.height).toBeLessThanOrEqual(900 - 8 + 1);
    await openConversation(page);
    const entryComposer = page.locator('[data-conversation-composer] [data-slot="input-group"]');
    const entryPaint = await entryComposer.evaluate((element) => {
      const sample = document.createElement("span");
      sample.style.backgroundColor = "var(--background)";
      document.body.append(sample);
      const expected = getComputedStyle(sample).backgroundColor;
      sample.remove();
      const actual = getComputedStyle(element);
      return { backgroundColor: actual.backgroundColor, backgroundImage: actual.backgroundImage, expected };
    });
    if (preference.colorScheme === "dark") {
      expect(entryPaint.backgroundImage).not.toBe("none");
    } else {
      expect(entryPaint.backgroundColor).toBe(entryPaint.expected);
    }
    await submitQuestion(page, `Expanded ${preference.theme} screenshot`);
    const surface = page.locator("[data-chat-surface]");
    const frame = page.locator("[data-chat-frame]");
    const surfaceBox = await requiredBox(surface);
    expect(surfaceBox.width).toBeLessThanOrEqual(653);
    expect(surfaceBox.x).toBeGreaterThanOrEqual(0);
    expect(surfaceBox.x + surfaceBox.width).toBeLessThanOrEqual(1_440);
    expect(Number.parseFloat(await surface.evaluate((element) => getComputedStyle(element).borderRadius)))
      .toBeCloseTo(45, 0);
    await expect(page.locator("[data-entry-stroke]")).toHaveCSS("transition-duration", "0s");
    await expect(page.locator("html")).toHaveClass(preference.colorScheme === "dark" ? /dark/u : /^(?!.*dark)/u);
    if (preference.colorScheme === "dark") {
      expect(await frame.evaluate((element) => {
        const sample = document.createElement("span");
        sample.style.backgroundColor = "var(--card)";
        document.body.append(sample);
        const expected = getComputedStyle(sample).backgroundColor;
        sample.remove();
        return getComputedStyle(element).backgroundColor === expected;
      })).toBe(true);
    }
    themeSurfaceColors.push(await frame.evaluate((element) => getComputedStyle(element).backgroundColor));
    await expect(page.locator("[data-answer]")).toHaveText(liveAnswer);
    await expectCompactSuggestionGeometry(page);
    await captureConversation(page, testInfo, `conversation-desktop-${preference.theme}`);

    if (preference.theme === "light") {
      expect(await page.evaluate(() => {
        const shell = document.querySelector<HTMLElement>("[data-conversation-shell]");
        const viewport = window.visualViewport;
        if (!shell || !viewport) return false;
        shell.style.setProperty("--edge-gutter", "29px");
        shell.style.setProperty("--safe-bottom", "47px");
        shell.style.setProperty("--safe-left", "37px");
        shell.style.setProperty("--safe-right", "61px");
        shell.style.setProperty("--safe-top", "31px");
        Object.defineProperties(viewport, {
          height: { configurable: true, value: 650 },
          offsetLeft: { configurable: true, value: 200 },
          offsetTop: { configurable: true, value: 50 },
          width: { configurable: true, value: 1_000 },
        });
        viewport.dispatchEvent(new Event("resize"));
        return true;
      })).toBe(true);
      await expect.poll(async () => {
        const box = await requiredBox(surface);
        return box.y + box.height;
      }).toBe(655);
      const insetBox = await requiredBox(surface);
      expect(insetBox.x).toBeGreaterThanOrEqual(237);
      expect(insetBox.x + insetBox.width).toBeLessThanOrEqual(1_139);
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      const scaledBox = await requiredBox(surface);
      expect(scaledBox.x).toBeGreaterThanOrEqual(237);
      expect(scaledBox.x + scaledBox.width).toBeLessThanOrEqual(1_139);
      const scaleOverflow = await page.evaluate(() => {
        const root = document.documentElement;
        const shell = document.querySelector<HTMLElement>("[data-conversation-shell]");
        if (!shell) throw new Error("Conversation shell must exist for overflow isolation.");
        const withConversation = root.scrollWidth;
        const previousDisplay = shell.style.display;
        shell.style.display = "none";
        const withoutConversation = root.scrollWidth;
        shell.style.display = previousDisplay;
        const offenders = Array.from(document.querySelectorAll<HTMLElement>("body *"))
          .filter((element) => !shell.contains(element) && element.getBoundingClientRect().right > root.clientWidth + 1)
          .slice(0, 5)
          .map((element) => ({
            className: element.className,
            id: element.id,
            right: Math.round(element.getBoundingClientRect().right),
            tag: element.tagName,
          }));
        return { clientWidth: root.clientWidth, offenders, withConversation, withoutConversation };
      });
      testInfo.annotations.push({
        description: JSON.stringify(scaleOverflow),
        type: "existing-root-text-scale-overflow",
      });
      expect(scaleOverflow.withConversation).toBe(scaleOverflow.withoutConversation);
    }
  }
  expect(new Set(themeSurfaceColors).size).toBe(2);
  expect(new Set(themeLauncherColors).size).toBe(2);
  expect(themeLauncherColors[2]).toBe(themeLauncherColors[1]);
});

test.describe("with a compact touch viewport", () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 812 } });

  test("the first send opens a full-screen modal without reopening the keyboard", async ({ page }, testInfo) => {
    await page.route("**/api/ask", async (route) => {
      await route.fulfill({ body: liveStream, contentType: "text/event-stream; charset=utf-8" });
    });
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
    await page.goto("/");
    const launcher = await readyLauncher(page);
    const dialog = page.getByRole("dialog", { name: "About my work" });
    const input = page.getByRole("textbox", { name: "Your question" });
    if (!await input.isVisible()) await launcher.tap();
    await input.focus();
    await expect(dialog).toBeHidden();
    await expect(input).toBeFocused();
    await input.fill("Expanded compact light screenshot");
    await page.getByRole("button", { name: "Send", exact: true }).tap();

    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("data-mobile", "true");
    await expect(input).not.toBeFocused();
    const bounds = await requiredBox(dialog);
    expect(bounds.x).toBeCloseTo(0, 0);
    expect(bounds.y).toBeCloseTo(0, 0);
    expect(bounds.width).toBeCloseTo(375, 0);
    expect(bounds.height).toBeCloseTo(812, 0);
    const inactiveHandle = page.locator("[data-conversation-handle]");
    await expect(inactiveHandle).toBeHidden();
    await expect(inactiveHandle.locator("..")).toHaveAttribute("aria-hidden", "true");
    await expect(inactiveHandle.locator("..")).toHaveAttribute("inert", "");
    await expect(page.locator("[data-answer]")).toHaveText(liveAnswer);
    await expectCompactSuggestionGeometry(page);
    await captureConversation(page, testInfo, "conversation-mobile-modal-light");

    await page.getByRole("button", { name: "Close conversation" }).tap();
    await expect(dialog).toBeHidden();
    await expect(launcher).toBeFocused();
    await launcher.tap();
    await expect(dialog).toBeVisible();
    await expect(input).not.toBeFocused();
    await page.getByRole("button", { name: "Close conversation" }).tap();

    await page.evaluate(() => { localStorage.setItem("theme", "dark"); });
    await page.reload();
    const darkLauncher = await readyLauncher(page);
    if (!await page.getByRole("textbox", { name: "Your question" }).isVisible()) await darkLauncher.tap();
    await expect(dialog).toBeHidden();
    await page.getByRole("textbox", { name: "Your question" }).fill("Expanded compact dark screenshot");
    await page.getByRole("button", { name: "Send", exact: true }).tap();
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("data-mobile", "true");
    await expect(page.locator("[data-answer]")).toHaveText(liveAnswer);
    await captureConversation(page, testInfo, "conversation-mobile-modal-dark");
  });
});

for (const missingMethod of ["showPopover", "hidePopover"] as const) {
  test(`missing ${missingMethod} receives the ordinary Contact fallback`, async ({ page }) => {
    await page.addInitScript((method) => {
      Object.defineProperty(HTMLElement.prototype, method, { configurable: true, value: undefined });
    }, missingMethod);
    await page.goto("/");
    await expect(page.locator('[data-conversation-shell][data-capability="unsupported"]')).toBeAttached();
    await expect(page.locator("button[data-launcher]")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Contact me" })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("link", { name: "Contact me" })).toHaveAttribute("href", "/#contact");
    await expect(page.locator("[data-chat-surface]")).toHaveCount(0);
  });
}

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the shell leaves a native Contact fallback", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Contact me" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Contact me" })).toHaveAttribute("href", "/#contact");
    await expect(page.locator("button[data-launcher]")).toHaveCount(0);
  });
});

/** Installs an event-controlled reply stream without timing-dependent chunk races.
 * @param page - Browser page receiving the synthetic transport.
 * @param includeMetadata - Whether the transport emits metadata before the first controlled delta.
 */
async function installControlledReply(page: Page, includeMetadata = true): Promise<void> {
  await page.addInitScript((emitMetadata) => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.endsWith("/api/ask")) return nativeFetch(input, init);
      const encoder = new TextEncoder();
      let release: ((event: Event) => void) | undefined;
      const stream = new ReadableStream<Uint8Array>({
        /** Opens a controlled response until an explicit chunk event arrives.
         * @param controller - Browser response stream controller.
         */
        start(controller) {
          if (emitMetadata) controller.enqueue(encoder.encode('event: metadata\ndata: {"mode":"live"}\n\n'));
          release = (event) => {
            const { text, done, sources = [] } = (event as CustomEvent<{ text?: string; done?: boolean; sources?: { id: string; title: string; href: string }[] }>).detail;
            if (text) controller.enqueue(encoder.encode(`event: delta\ndata: ${JSON.stringify({ text })}\n\n`));
            if (done) {
              controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ sources, followUps: [{ label: "Experience", question: "Tell me about Nikita's relevant experience." }] })}\n\n`));
              controller.close();
              if (release) window.removeEventListener("test-reply-chunk", release);
            }
          };
          window.addEventListener("test-reply-chunk", release);
        },
        /** Detaches the event listener when the model cancels this response. */
        cancel() {
          if (release) window.removeEventListener("test-reply-chunk", release);
        },
      });
      return Promise.resolve(new Response(stream, { headers: { "Content-Type": "text/event-stream" } }));
    };
  }, includeMetadata);
}

/** Releases one controlled response update after browser assertions establish the prior state.
 * @param page - Browser owning the controlled stream.
 * @param text - Optional next answer text.
 * @param done - Whether the response completes after this chunk.
 */
async function emitReply(page: Page, text = "", done = false): Promise<void> {
  await page.evaluate((detail) => {
    window.dispatchEvent(new CustomEvent("test-reply-chunk", { detail }));
  }, { text, done });
}

/** Measures the actual viewport's distance from its latest content.
 * @param history - Scrollable conversation viewport.
 * @returns Remaining scroll distance in pixels.
 */
async function distanceFromLatest(history: Locator): Promise<number> {
  return history.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop);
}

test("stopping before the first reply keeps recovery on the sent message without fabricating an answer", async ({ page }) => {
  await installControlledReply(page, false);
  await page.goto("/");
  await openConversation(page);
  await submitQuestion(page, "Stop before an answer arrives");

  const turn = page.locator("[data-turn]");
  const group = page.locator('[data-chat-surface] [data-slot="input-group"]');
  await expect(turn.locator('[data-slot="marker"][data-variant="default"]')).toHaveText("Thinking...");
  await expect(turn.locator('[data-slot="message"][data-align="start"] [data-slot="bubble"]')).toHaveCount(0);
  await group.getByRole("button", { name: "Stop", exact: true }).click();

  const answerBubble = turn.locator('[data-slot="message"][data-align="start"] [data-slot="bubble"]');
  const sentBubble = turn.locator('[data-slot="message"][data-align="end"] [data-slot="bubble"]');
  await expect(turn.locator('[data-slot="marker"][data-variant="separator"]')).toHaveText("Reply stopped.");
  await expect(answerBubble).toHaveCount(0);
  await expect(sentBubble.locator('[data-slot="bubble-reactions"] button[aria-label="Retry message"]')).toHaveCount(1);
  await expect(turn.locator('[data-slot="bubble-reactions"][aria-label="Message actions"]')).toHaveCount(1);
  await expect(turn.getByRole("button", { name: "Retry message" })).toHaveCount(1);
  await expect(group.getByRole("button", { name: "Send", exact: true })).toBeVisible();
});

test("the first submit keeps the panel and composer rendered through every growth frame", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1_440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installControlledReply(page, false);
  await page.goto("/");
  await openConversation(page);
  const surface = page.locator("[data-chat-surface]");
  const restingHeight = (await requiredBox(page.locator("[data-conversation-composer]"))).height;
  await page.getByRole("textbox", { name: "Your question" })
    .fill("Keep every growth frame visible\nfrom this taller desktop field\nwithout a first-frame jump");
  const sourceField = await requiredBox(page.locator('[data-conversation-composer] [data-slot="input-group"]'));

  const frames = await page.evaluate(async () => {
    const send = document.querySelector<HTMLButtonElement>('[data-conversation-composer] button[type="submit"]');
    if (!send) throw new Error("The first-entry Send control must exist.");
    /** Captures painted panel and composer geometry for one animation frame.
     * @returns Current visible geometry and response-bubble count.
     */
    const sample = () => {
      const panel = document.querySelector<HTMLElement>("[data-chat-surface]");
      const composer = document.querySelector<HTMLElement>("[data-conversation-composer]");
      const field = composer?.querySelector<HTMLElement>("[data-slot='input-group']");
      const panelRect = panel?.getBoundingClientRect();
      const composerRect = composer?.getBoundingClientRect();
      const fieldRect = field?.getBoundingClientRect();
      const style = panel ? getComputedStyle(panel) : null;
      return {
        answerBubbles: panel?.querySelectorAll('[data-slot="message"][data-align="start"] [data-slot="bubble"]').length ?? 0,
        clipPath: style?.clipPath ?? "none",
        composerBottom: composerRect?.bottom ?? 0,
        composerHeight: composerRect?.height ?? 0,
        composerTop: composerRect?.top ?? 0,
        fieldHeight: fieldRect?.height ?? 0,
        fieldTop: fieldRect?.top ?? 0,
        opacity: Number.parseFloat(style?.opacity ?? "0"),
        panelBottom: panelRect?.bottom ?? 0,
        panelHeight: panelRect?.height ?? 0,
        panelTop: panelRect?.top ?? 0,
        visibleComposers: Array.from(document.querySelectorAll<HTMLElement>("[data-conversation-composer]"))
          .filter((element) => element.getClientRects().length > 0).length,
      };
    };
    const captured = [sample()];
    send.click();
    captured.push(sample());
    for (let index = 0; index < 18; index += 1) {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve(); }); });
      captured.push(sample());
    }
    return captured;
  });
  await testInfo.attach("first-submit-frames", { body: JSON.stringify(frames), contentType: "application/json" });

  const initialFrame = frames[0];
  if (!initialFrame) throw new Error("First-submit geometry requires an initial page-field frame.");
  expect(initialFrame.fieldTop).toBeCloseTo(sourceField.y, 0);
  expect(initialFrame.fieldHeight).toBeCloseTo(sourceField.height, 0);
  expect(frames.every(({ composerHeight }) => composerHeight >= 35)).toBe(true);
  expect(frames.every(({ visibleComposers }) => visibleComposers === 1)).toBe(true);
  const panelFrames = frames.filter(({ panelHeight }) => panelHeight > 0);
  expect(panelFrames.length).toBeGreaterThan(1);
  expect(panelFrames.every(({ composerBottom, composerTop, panelBottom, panelTop }) => (
    composerTop >= panelTop - 1 && composerBottom <= panelBottom + 1
  ))).toBe(true);
  expect(panelFrames.every(({ answerBubbles }) => answerBubbles === 0)).toBe(true);
  expect(panelFrames.at(-1)?.opacity).toBeGreaterThanOrEqual(0.99);
  expect(Math.max(...panelFrames.map(({ panelHeight }) => panelHeight))).toBeGreaterThan(restingHeight);
  await expect(surface.locator('[data-slot="marker"]')).toHaveText("Thinking...");
});

test("Enter cannot submit another question while Stop replaces Send", async ({ page }) => {
  await installControlledReply(page);
  await page.goto("/");
  await page.evaluate(() => {
    const controlledFetch = window.fetch.bind(window);
    sessionStorage.setItem("test-chat-request-count", "0");
    window.fetch = (...args) => {
      const [input] = args;
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/api/ask")) {
        const count = Number.parseInt(sessionStorage.getItem("test-chat-request-count") ?? "0", 10) + 1;
        sessionStorage.setItem("test-chat-request-count", String(count));
      }
      return controlledFetch(...args);
    };
  });
  await openConversation(page);
  await submitQuestion(page, "Keep this reply pending");
  const input = page.getByRole("textbox", { name: "Your question" });
  const group = page.locator('[data-chat-surface] [data-slot="input-group"]');

  await input.fill("Do not submit this follow-up yet");
  await input.press("Enter");
  await expect(page.locator("[data-turn]")).toHaveCount(1);
  await expect(page.locator("[data-user-message]")).toHaveText("Keep this reply pending");
  expect(await page.evaluate(() => sessionStorage.getItem("test-chat-request-count"))).toBe("1");
  await expect(page.getByText("Thinking...", { exact: true })).toBeVisible();
  await expect(group.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
});

test("closing cancels reply chunks emitted during the painted collapse", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installControlledReply(page);
  await page.goto("/");
  await openConversation(page);
  await submitQuestion(page, "Cancel while the panel collapses");
  await emitReply(page, "Visible partial");
  await expect(page.locator("[data-answer]")).toHaveText("Visible partial");

  await page.getByRole("button", { name: "Close conversation" }).click();
  await emitReply(page, " late collapsed text");
  await expect(page.getByRole("dialog", { name: "About my work" })).toBeHidden();
  await reopenConversation(page);

  await expect(page.locator("[data-answer]")).toHaveText("Visible partial");
  await expect(page.locator("[data-answer]")).not.toContainText("late collapsed text");
  await expect(page.locator('[data-chat-surface] [data-slot="marker"][data-variant="separator"]'))
    .toHaveText("Reply stopped.");
});

test("closing during panel growth pins painted height and reopening restores intrinsic sizing", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installControlledReply(page);
  await page.goto("/");
  await openConversation(page);
  await submitQuestion(page, "Close while the panel grows");
  await emitReply(page, "Short answer.");
  const surface = page.locator("[data-chat-surface]");
  await expect(surface).not.toHaveAttribute("data-morph");
  await settleSurfaceMotion(surface);
  await emitReply(page, " Growing portfolio detail.".repeat(80));
  await expect.poll(() => surface.evaluate((element) => element.getAnimations().some((animation) => (
    (animation.effect as KeyframeEffect | null)?.getKeyframes().some((frame) => frame.height !== undefined)
  )))).toBe(true);

  await page.getByRole("button", { name: "Close conversation" }).click();
  const closingHeights = await surface.evaluate(async (element) => {
    const heights: number[] = [];
    for (let index = 0; index < 8; index += 1) {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve(); }); });
      heights.push(element.getBoundingClientRect().height);
    }
    return heights;
  });
  expect(Math.max(...closingHeights) - Math.min(...closingHeights)).toBeLessThanOrEqual(1);
  await expect(surface).toBeHidden();

  await reopenConversation(page);
  await expect(surface).not.toHaveAttribute("data-morph");
  await settleSurfaceMotion(surface);
  expect(await surface.evaluate((element) => element.style.height)).toBe("");
  await expect(surface).not.toHaveAttribute("data-closing");
  await expect(page.locator("[data-answer]")).toContainText("Growing portfolio detail.");
});

for (const width of [640, 1_440]) {
  for (const theme of ["light", "dark", "system-dark"] as const) {
    test(`shadcn composer preserves shared controls and intentional entry geometry at ${String(width)}px in ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme === "light" ? "light" : "dark", reducedMotion: "reduce" });
      await page.addInitScript((value) => {
        if (value === "system-dark") localStorage.removeItem("theme");
        else localStorage.setItem("theme", value);
      }, theme);
      await installControlledReply(page);
      await page.goto("/");
      const dialog = await openConversation(page);
      const input = page.getByRole("textbox", { name: "Your question" });
      const send = page.getByRole("button", { name: "Send", exact: true });
      const group = page.locator('[data-conversation-composer] [data-slot="input-group"]');
      const contactInput = page.locator("#contact-name");
      const contactSend = page.locator('form:has(#contact-name) button[type="submit"]');
      await expect(group).toBeVisible();
      await expect(group).toHaveAttribute("data-slot", "input-group");
      await expect(input).toHaveAttribute("data-slot", "input-group-control");
      await expect(send).toHaveAttribute("data-slot", "button");
      expect((await requiredBox(group)).height).toBeCloseTo(40, 0);
      await expect(input).toHaveAttribute("placeholder", "Ask about my work…");
      const expectedFontSize = width < 768 ? "16px" : "14px";
      const expectedLineHeight = width < 768 ? "24px" : "20px";
      await expect(input).toHaveCSS("font-size", expectedFontSize);
      await expect(input).toHaveCSS("line-height", expectedLineHeight);
      await expect(contactInput).toHaveCSS("font-size", expectedFontSize);
      await expect(contactInput).toHaveCSS("line-height", expectedLineHeight);
      expect((await requiredBox(input)).height).toBeCloseTo(38, 0);
      expect((await requiredBox(send)).height).toBeCloseTo(32, 0);
      expect((await requiredBox(contactInput)).height).toBeCloseTo((await requiredBox(group)).height, 0);
      expect((await requiredBox(contactSend)).height).toBeCloseTo(36, 0);
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
      await expect(send).toHaveText("Send");
      await expect(send).toHaveCSS("background-image", "none");
      await expect(send).toHaveAttribute("type", "submit");
      await expect(page.locator("[data-conversation-history]")).toHaveCount(0);
      await captureConversation(page, testInfo, `composer-${String(width)}-${theme}-default`);
      await input.focus();
      await captureConversation(page, testInfo, `composer-${String(width)}-${theme}-focus`);
      await input.fill("A multiline question\nwith a second line\nand a final line");
      const multilineGroup = await requiredBox(group);
      const multilineInput = await requiredBox(input);
      const multilineSend = await requiredBox(send);
      expect(multilineGroup.height).toBeGreaterThan(40);
      expect(multilineGroup.y + multilineGroup.height - (multilineSend.y + multilineSend.height)).toBeCloseTo(4, 0);
      expect(multilineInput.y + multilineInput.height - (multilineSend.y + multilineSend.height)).toBeCloseTo(3, 0);
      await captureConversation(page, testInfo, `composer-${String(width)}-${theme}-multiline`);
      await input.fill("   ");
      await send.click();
      await expect(input).toBeFocused();
      await expect(page.locator("[data-turn]")).toHaveCount(0);
      await captureConversation(page, testInfo, `composer-${String(width)}-${theme}-invalid`);
      await input.fill("x".repeat(12_001));
      await expect(input).toHaveValue("x".repeat(12_000));
      await send.click();
      await expect(page.locator("[data-user-message]")).toHaveText("x".repeat(12_000));
      await expect(dialog).toBeVisible();
      expect((await requiredBox(page.getByRole("button", { name: "Close conversation" }))).height).toBeCloseTo(36, 0);
      await expect(dialog).toHaveCSS("border-radius", "45px");
      const stop = group.getByRole("button", { name: "Stop", exact: true });
      await expect(send).toHaveCount(0);
      await expect(stop).toBeVisible();
      await expect(stop).toHaveAttribute("type", "button");
      expect((await requiredBox(stop)).height).toBeCloseTo(32, 0);
      await expect(dialog.locator("[data-turn]").getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
      await expect(dialog.locator('[data-slot="marker"][data-variant="default"]')).toHaveText("Thinking...");
      await captureConversation(page, testInfo, `composer-${String(width)}-${theme}-pending`);
      await input.fill("A pending multiline follow-up\nwith a second line\nand a final line");
      await captureConversation(page, testInfo, `composer-${String(width)}-${theme}-pending-multiline`);
      await emitReply(page, "Partial reply.");
      await expect(page.locator("[data-answer]")).toHaveText("Partial reply.");
      await stop.click();
      await expect(dialog.locator('[data-slot="marker"][data-variant="separator"]')).toHaveText("Reply stopped.");
      await expect(group.getByRole("button", { name: "Send", exact: true })).toBeVisible();
      await captureConversation(page, testInfo, `composer-${String(width)}-${theme}-stopped`);
    });
  }
}

test("composer typography follows Contact Input across the 768px boundary", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await installControlledReply(page);
  await page.setViewportSize({ width: 767, height: 900 });
  await page.goto("/");
  await openConversation(page);
  const input = page.getByRole("textbox", { name: "Your question" });
  const contactInput = page.locator("#contact-name");
  await expect(input).toHaveCSS("font-size", "16px");
  await expect(input).toHaveCSS("line-height", "24px");
  await expect(contactInput).toHaveCSS("font-size", "16px");
  await expect(contactInput).toHaveCSS("line-height", "24px");

  await page.setViewportSize({ width: 768, height: 900 });
  await expect(input).toHaveCSS("font-size", "14px");
  await expect(input).toHaveCSS("line-height", "20px");
  await expect(contactInput).toHaveCSS("font-size", "14px");
  await expect(contactInput).toHaveCSS("line-height", "20px");
});

test("shadcn pending and stopped markers preserve one exchange node and announcement owner", async ({ page }, testInfo) => {
  await installControlledReply(page);
  await page.goto("/");
  await openConversation(page);
  await submitQuestion(page, "A controlled first reply");
  const turn = page.locator("[data-turn]");
  await expect(turn).toBeVisible();
  expect((await requiredBox(turn)).height).toBeGreaterThan(30);
  const shortHistoryHeight = (await requiredBox(page.locator("[data-conversation-history]"))).height;
  expect(shortHistoryHeight).toBeLessThan(250);
  await testInfo.attach("short-history-height", { body: JSON.stringify({ height: shortHistoryHeight }), contentType: "application/json" });
  const original = await turn.elementHandle();
  expect(original).not.toBeNull();
  const marker = turn.locator('[data-slot="marker"]');
  await expect(marker).toHaveText("Thinking...");
  await expect(marker).toHaveAttribute("data-variant", "default");
  await expect(turn.locator('[data-slot="message"][data-align="start"] [data-slot="bubble"]')).toHaveCount(0);
  const composerGroup = page.locator('[data-chat-surface] [data-slot="input-group"]');
  await expect(composerGroup.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await expect(turn.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
  await expect(turn.getByRole("button", { name: "Retry message" })).toHaveCount(0);
  await expect(page.locator('[role="log"]')).toHaveAttribute("aria-live", "off");
  await expect(page.locator('[data-conversation-status][role="status"][aria-live="polite"]')).toHaveCount(1);
  await expect(marker.locator('[role="status"]')).toHaveCount(0);
  expect(await marker.getAttribute("role")).not.toBe("status");
  await emitReply(page, "\n  ");
  await expect(marker).toHaveText("Thinking...");
  await expect(turn.locator('[data-slot="message"][data-align="start"] [data-slot="bubble"]')).toHaveCount(0);
  await expect(turn.getByRole("button", { name: "Retry message" })).toHaveCount(0);
  await emitReply(page, "Partial visible text");
  await expect(turn.locator("[data-answer]")).toHaveText("Partial visible text");
  expect(await turn.locator("[data-answer]").textContent()).toBe("Partial visible text");
  await expect(marker).toHaveCount(0);
  const answerBubble = turn.locator('[data-slot="message"][data-align="start"] [data-slot="bubble"]');
  const originalBubble = await answerBubble.elementHandle();
  expect(originalBubble).not.toBeNull();
  await emitReply(page, " appended text");
  await expect(turn.locator("[data-answer]")).toHaveText("Partial visible text appended text");
  expect(await answerBubble.evaluate((element, saved) => element === saved, originalBubble)).toBe(true);
  expect(await turn.evaluate((element, saved) => element === saved, original)).toBe(true);
  await composerGroup.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(marker).toHaveAttribute("data-variant", "separator");
  const sentBubble = turn.locator('[data-slot="message"][data-align="end"] [data-slot="bubble"]');
  await expect(answerBubble.getByRole("button", { name: "Retry message" })).toHaveCount(0);
  await expect(sentBubble.locator('[data-slot="bubble-reactions"] button[aria-label="Retry message"]')).toHaveCount(1);
  expect(await turn.evaluate((element, saved) => element === saved, original)).toBe(true);
  await hoverReaction(page.getByRole("button", { name: "Retry message" }));
  await page.getByRole("button", { name: "Retry message" }).click();
  await expect(marker).toHaveText("Thinking...");
  await emitReply(page, "Complete replacement", true);
  await expect(turn.locator("[data-answer]")).toHaveText("Complete replacement");
  await expect(marker).toHaveCount(0);
  expect(await turn.evaluate((element, saved) => element === saved, original)).toBe(true);
  await expect(page.getByRole("button", { name: "Copy reply" })).toBeAttached();
  const startOver = page.getByRole("button", { name: "Start over" });
  await expect(startOver.locator("svg.lucide-message-circle-plus")).toHaveCount(1);
  await startOver.click();
  await expect(turn).toHaveCount(0);
  expect(await original.evaluate((element) => element.isConnected)).toBe(false);
});

test("the default pending marker spins and shimmers unless reduced motion is requested", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installControlledReply(page);
  await page.goto("/");
  await openConversation(page);
  await submitQuestion(page, "Show pending motion");
  const marker = page.locator('[data-chat-surface] [data-slot="marker"][data-variant="default"]');
  const spinner = marker.locator('[data-slot="marker-icon"] [data-slot="spinner"]');
  const shimmer = marker.locator('[data-slot="marker-content"].shimmer');

  await expect(marker).toHaveText("Thinking...");
  await expect(spinner).toBeVisible();
  await expect(spinner).toHaveAttribute("aria-hidden", "true");
  await expect.poll(() => spinner.evaluate((element) => getComputedStyle(element).animationName)).not.toBe("none");
  await expect(shimmer).toBeVisible();
  await expect(shimmer).toHaveCSS("background-clip", "text");
  await expect.poll(() => shimmer.evaluate((element) => getComputedStyle(element).animationName)).not.toBe("none");

  await expect(page.locator("[data-chat-surface]")).not.toHaveAttribute("data-resizing", "true");
  const spinContainer = marker.locator('[data-slot="marker-icon"]');
  const firstSpin = await spinContainer.screenshot({ animations: "allow" });
  const firstShimmer = await shimmer.screenshot({ animations: "allow" });
  const transform = await spinner.evaluate((element) => getComputedStyle(element).transform);
  const position = await shimmer.evaluate((element) => getComputedStyle(element).backgroundPosition);
  await page.waitForTimeout(230);
  expect((await spinContainer.screenshot({ animations: "allow" })).equals(firstSpin)).toBe(false);
  expect((await shimmer.screenshot({ animations: "allow" })).equals(firstShimmer)).toBe(false);
  expect(await spinner.evaluate((element) => getComputedStyle(element).transform)).not.toBe(transform);
  expect(await shimmer.evaluate((element) => getComputedStyle(element).backgroundPosition)).not.toBe(position);
  await testInfo.attach("pending-animated", { body: await marker.screenshot({ animations: "allow" }), contentType: "image/png" });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => spinner.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  await expect.poll(() => shimmer.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
});

test("pending, streaming, and completion preserve the answer bubble and bottom composer", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1_440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installControlledReply(page);
  await page.goto("/");
  await openConversation(page);
  await submitQuestion(page, "Keep response states stable");
  const surface = page.locator("[data-chat-surface]");
  await settleSurfaceMotion(surface);
  const pendingHeight = (await requiredBox(surface)).height;
  const composer = page.getByRole("textbox", { name: "Your question" });
  const pendingComposer = await requiredBox(composer);

  const whitespaceFrames = await page.evaluate(async () => {
    const panel = document.querySelector<HTMLElement>("[data-chat-surface]");
    if (!panel) throw new Error("Conversation surface must exist.");
    /** Captures whether response state triggered panel resizing.
     * @returns Current panel height and resize state.
     */
    const sample = () => ({ height: panel.getBoundingClientRect().height, resizing: panel.getAnimations().length > 0 });
    const captured = [sample()];
    window.dispatchEvent(new CustomEvent("test-reply-chunk", { detail: { text: "\n  ", done: false } }));
    captured.push(sample());
    for (let index = 0; index < 8; index += 1) {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve(); }); });
      captured.push(sample());
    }
    return captured;
  });
  expect(whitespaceFrames.every(({ resizing }) => !resizing)).toBe(true);
  expect(
    Math.max(...whitespaceFrames.map(({ height }) => height))
      - Math.min(...whitespaceFrames.map(({ height }) => height)),
  ).toBeLessThanOrEqual(1);
  expect((await requiredBox(surface)).height).toBeGreaterThanOrEqual(pendingHeight);
  await expect(surface.locator('[data-slot="marker"]')).toHaveText("Thinking...");

  await emitReply(page, "First visible text");
  const answerBubble = page.locator('[data-slot="message"][data-align="start"] [data-slot="bubble"]');
  await expect(answerBubble).toContainText("First visible text");
  const firstCopy = answerBubble.getByRole("button", { name: "Copy reply" });
  const firstSuggestions = answerBubble.getByRole("button", { name: "Experience" });
  await expect(firstCopy).toBeAttached();
  await expect(firstCopy).toBeDisabled();
  await expect(firstSuggestions).toHaveCount(0);
  const originalCopy = await firstCopy.elementHandle();
  const originalBubble = await answerBubble.elementHandle();
  expect(originalBubble).not.toBeNull();
  await expect.poll(() => surface.evaluate((element) => element.getAnimations().length)).toBe(0);
  expect((await requiredBox(surface)).height).toBeGreaterThanOrEqual(pendingHeight);
  expect((await requiredBox(composer)).y).toBeCloseTo(pendingComposer.y, 0);
  await captureConversation(page, testInfo, "response-first-chunk");

  const responseFrames = await page.evaluate(async () => {
    const panel = document.querySelector<HTMLElement>("[data-chat-surface]");
    const bubble = document.querySelector<HTMLElement>('[data-slot="message"][data-align="start"] [data-slot="bubble"]');
    const paint = bubble?.querySelector<HTMLElement>('[data-slot="bubble-content"]');
    const input = document.querySelector<HTMLElement>('[data-chat-surface] textarea[name="question"]');
    const history = document.querySelector<HTMLElement>("[data-conversation-history]");
    if (!panel || !bubble || !paint || !input || !history) throw new Error("First response and composer must be rendered before sampling.");
    /** Records the painted reply footprint while chunks and completion arrive.
     * @returns Geometry and persistent node ownership for this frame.
     */
    const sample = () => ({
      height: panel.getBoundingClientRect().height,
      outerWidth: bubble.getBoundingClientRect().width,
      paintedWidth: paint.getBoundingClientRect().width,
      composerY: input.getBoundingClientRect().y,
      composerHeight: input.getBoundingClientRect().height,
      historyHeight: history.getBoundingClientRect().height,
      bottomGap: panel.getBoundingClientRect().bottom - input.getBoundingClientRect().bottom,
      sameNode: bubble === document.querySelector('[data-slot="message"][data-align="start"] [data-slot="bubble"]'),
    });
    const captured = [sample()];
    window.dispatchEvent(new CustomEvent("test-reply-chunk", { detail: { text: " appended", done: false } }));
    for (let index = 0; index < 12; index += 1) {
      if (index === 6) window.dispatchEvent(new CustomEvent("test-reply-chunk", { detail: { text: "", done: true } }));
      await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve(); }); });
      captured.push(sample());
    }
    return captured;
  });
  expect(responseFrames.every(({ sameNode }) => sameNode)).toBe(true);
  for (const dimension of ["outerWidth", "paintedWidth", "composerY", "composerHeight", "bottomGap"] as const) {
    const values = responseFrames.map((frame) => frame[dimension]);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
  }
  await testInfo.attach("response-transition-frames", { body: JSON.stringify(responseFrames), contentType: "application/json" });
  await expect(answerBubble).toContainText("First visible text appended");
  expect(await firstCopy.evaluate((element, saved) => element === saved, originalCopy)).toBe(true);
  await expect(firstCopy).toBeEnabled();
  await expect(firstSuggestions).toBeVisible();
  await expect(firstSuggestions).toBeEnabled();
  await expect(page.locator("[data-conversation-status]")).toHaveText("Answer complete.");
  expect(await answerBubble.evaluate((element, saved) => element === saved, originalBubble)).toBe(true);
  await expect.poll(() => surface.evaluate((element) => element.getAnimations().length)).toBe(0);
  expect((await requiredBox(surface)).height).toBeGreaterThanOrEqual(pendingHeight);
  expect((await requiredBox(composer)).y).toBeCloseTo(pendingComposer.y, 0);
  await captureConversation(page, testInfo, "response-complete");
});

/** Scrolls older history with real wheel input so generated user-intent detection runs.
 * @param page - Browser receiving wheel input.
 * @param history - Scrollable conversation viewport.
 */
async function scrollToOlderHistory(page: Page, history: Locator): Promise<void> {
  await history.hover();
  // WebKit can consume the first gesture to stop an in-flight scroll before moving upward.
  await expect(async () => {
    await page.mouse.wheel(0, -10_000);
    await expect.poll(() => history.evaluate((element) => element.scrollTop), { timeout: 500 }).toBeLessThanOrEqual(1);
  }).toPass({ timeout: 5_000 });
  await expect(page.getByRole("button", { name: /latest/i })).toHaveCSS("opacity", "1");
}

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`latest scroll is ${reducedMotion === "reduce" ? "immediate" : "smooth and snappy"} with ${reducedMotion}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1_440, height: 900 });
    await page.emulateMedia({ reducedMotion });
    await installControlledReply(page);
    await page.goto("/");
    await openConversation(page);
    await submitQuestion(page, "Create scrollable history");
    await emitReply(page, "Scrollable portfolio detail. ".repeat(250));
    await expect(page.locator("[data-answer]")).toHaveText("Scrollable portfolio detail. ".repeat(250).trim());
    const history = page.locator("[data-conversation-history]");
    await expect.poll(() => distanceFromLatest(history)).toBeLessThanOrEqual(32);
    await scrollToOlderHistory(page, history);

    const samples = await page.evaluate(async () => {
      const viewport = document.querySelector<HTMLElement>("[data-conversation-history]");
      const latest = document.querySelector<HTMLButtonElement>('[data-slot="message-scroller-button"]');
      if (!viewport || !latest) throw new Error("Scrollable history and latest button must exist.");
      /** Measures remaining history below the current scroll position.
       * @returns Remaining distance to the latest message.
       */
      const distance = () => viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop;
      const startedAt = performance.now();
      const positions = [{ distance: distance(), elapsed: 0 }];
      latest.click();
      positions.push({ distance: distance(), elapsed: performance.now() - startedAt });
      for (let index = 0; index < 40; index += 1) {
        const latestPosition = positions.at(-1);
        if (latestPosition && latestPosition.distance <= 32) break;
        await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve(); }); });
        positions.push({ distance: distance(), elapsed: performance.now() - startedAt });
      }
      return positions;
    });
    const startDistance = samples[0]?.distance ?? 0;
    const end = samples.at(-1);
    await testInfo.attach("latest-scroll-frames", { body: JSON.stringify(samples), contentType: "application/json" });
    expect(startDistance).toBeGreaterThan(32);
    expect(end?.distance).toBeLessThanOrEqual(32);

    if (reducedMotion === "reduce") {
      expect(samples[1]?.distance).toBeLessThanOrEqual(32);
    } else {
      expect(samples.slice(1, -1).some(({ distance }) => distance > 32 && distance < startDistance)).toBe(true);
      expect(end?.elapsed).toBeLessThanOrEqual(600);
    }
  });
}

for (const input of ["wheel", "keyboard"] as const) {
  test(`${input} input interrupts latest scrolling and preserves reading position`, async ({ page }) => {
    await page.setViewportSize({ width: 1_440, height: 900 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await installControlledReply(page);
    await page.goto("/");
    await openConversation(page);
    await submitQuestion(page, "Keep manual scrolling in control");
    await emitReply(page, "Long portfolio detail. ".repeat(300));
    await expect(page.locator("[data-answer]")).toHaveText("Long portfolio detail. ".repeat(300).trim());
    const history = page.locator("[data-conversation-history]");
    await expect.poll(() => distanceFromLatest(history)).toBeLessThanOrEqual(32);
    await scrollToOlderHistory(page, history);
    await page.getByRole("button", { name: /latest/i }).click();
    if (input === "wheel") {
      await history.hover();
      await page.mouse.wheel(0, -600);
    } else {
      await history.focus();
      await page.keyboard.press("PageUp");
    }
    // Observe beyond the whole scroll duration so a stale finish cannot re-enable following.
    await page.waitForTimeout(350);
    expect(await distanceFromLatest(history)).toBeGreaterThan(32);
    const readingPosition = await history.evaluate((element) => element.scrollTop);
    await emitReply(page, " New content after the reader interrupted.".repeat(20));
    await page.waitForTimeout(100);
    expect(await history.evaluate((element) => element.scrollTop)).toBeCloseTo(readingPosition, 0);
    expect(await distanceFromLatest(history)).toBeGreaterThan(32);
  });
}

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`shadcn streaming respects scroll intent, latest focus, keyboard, and popup reopen with ${reducedMotion}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1_440, height: 900 });
    await page.emulateMedia({ reducedMotion });
    await installControlledReply(page);
    await page.goto("/");
    await openConversation(page);
    await submitQuestion(page, "Controlled long history");
    const history = page.locator("[data-conversation-history]");
    await emitReply(page, "Readable portfolio detail. ".repeat(210));
    await expect(page.locator("[data-answer]")).toContainText("Readable portfolio detail.");
    await expect.poll(() => distanceFromLatest(history)).toBeLessThanOrEqual(32);
    const visualViewportHeight = await page.evaluate(() => window.visualViewport?.height ?? window.innerHeight);
    expect((await requiredBox(page.locator("[data-chat-surface]"))).height)
      .toBeLessThanOrEqual(visualViewportHeight * 2 / 3 + 1);
    const surfaceBox = await requiredBox(page.locator("[data-chat-surface]"));
    const composerBox = await requiredBox(page.getByRole("textbox", { name: "Your question" }));
    expect((await requiredBox(history)).height).toBeLessThan(surfaceBox.height - composerBox.height);
    await expect(history).toHaveAttribute("data-lenis-prevent");
    await emitReply(page, "Additional streamed detail. ".repeat(40));
    await expect.poll(() => distanceFromLatest(history)).toBeLessThanOrEqual(32);
    await scrollToOlderHistory(page, history);
    await expect.poll(() => distanceFromLatest(history)).toBeGreaterThan(32);
    const position = await history.evaluate((element) => element.scrollTop);
    await emitReply(page, "A later streamed chunk. ".repeat(40));
    await expect(page.locator("[data-answer]")).toContainText("A later streamed chunk.");
    expect(await history.evaluate((element) => element.scrollTop)).toBeCloseTo(position, 0);
    const latest = page.getByRole("button", { name: /latest/i });
    await expect(latest).toBeVisible();
    const historyBox = await requiredBox(history);
    const latestBox = await requiredBox(latest);
    expect(latestBox.x + latestBox.width / 2).toBeCloseTo(historyBox.x + historyBox.width / 2, 0);
    expect(latestBox.y).toBeGreaterThan(historyBox.y + historyBox.height / 2);
    expect(latestBox.y + latestBox.height).toBeLessThanOrEqual(historyBox.y + historyBox.height);
    await captureConversation(page, testInfo, `history-away-${reducedMotion}`);
    await latest.focus();
    await latest.press("Enter");
    await expect.poll(() => distanceFromLatest(history)).toBeLessThanOrEqual(32);
    await expect(latest).toHaveAttribute("inert");
    await expect(latest).toHaveAttribute("tabindex", "-1");
    await expect(page.getByRole("textbox", { name: "Your question" })).toBeFocused();
    await scrollToOlderHistory(page, history);
    await latest.focus();
    await history.hover();
    await page.mouse.wheel(0, 10_000);
    await expect.poll(() => distanceFromLatest(history)).toBeLessThanOrEqual(32);
    await expect(latest).toHaveAttribute("inert");
    await expect(latest).toHaveAttribute("tabindex", "-1");
    await expect(page.getByRole("textbox", { name: "Your question" })).toBeFocused();
    await history.focus();
    const documentPosition = await page.evaluate(() => window.scrollY);
    await page.keyboard.press("Home");
    await expect.poll(() => history.evaluate((element) => element.scrollTop)).toBeLessThanOrEqual(1);
    await page.keyboard.press("PageDown");
    await expect.poll(() => history.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await page.keyboard.press("PageUp");
    await expect.poll(() => history.evaluate((element) => element.scrollTop)).toBeLessThanOrEqual(1);
    await page.keyboard.press("End");
    await expect.poll(() => distanceFromLatest(history)).toBeLessThanOrEqual(32);
    expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(documentPosition, 0);
    await scrollToOlderHistory(page, history);
    await page.getByRole("button", { name: "Close conversation" }).click();
    await expect(page.getByRole("dialog", { name: "About my work" })).not.toBeVisible();
    await expect(history.locator('[data-slot="marker"][data-variant="separator"]')).toHaveText("Reply stopped.");
    await emitReply(page, "Hidden popup chunk. ");
    await reopenConversation(page);
    await expect(page.locator("[data-answer]")).toBeVisible();
    await expect(history).toBeVisible();
    await expect(history.locator('[data-slot="marker"][data-variant="separator"]')).toHaveText("Reply stopped.");
    await expect(page.locator("[data-answer]")).not.toContainText("Hidden popup chunk.");
    await scrollToOlderHistory(page, history);
    await hoverReaction(page.getByRole("button", { name: "Retry message" }));
    await page.getByRole("button", { name: "Retry message" }).click();
    await emitReply(page, "Immediate replacement. ".repeat(250), true);
    await expect(page.locator("[data-answer]")).toContainText("Immediate replacement.");
    await expect.poll(() => distanceFromLatest(history)).toBeLessThanOrEqual(1);
    const arrivalFrames = await history.evaluate(async (element) => {
      const distances: number[] = [];
      const until = performance.now() + 500;
      while (performance.now() < until) {
        await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve(); }); });
        distances.push(element.scrollHeight - element.clientHeight - element.scrollTop);
      }
      return distances;
    });
    expect(Math.max(...arrivalFrames)).toBeLessThanOrEqual(1);
    await scrollToOlderHistory(page, history);
    const input = page.getByRole("textbox", { name: "Your question" });
    await input.fill("   ");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    expect(await history.evaluate((element) => element.scrollTop)).toBeCloseTo(0, 0);
    await input.fill("A draft, not a submit");
    expect(await history.evaluate((element) => element.scrollTop)).toBeCloseTo(0, 0);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await emitReply(page, "Batched complete answer. ".repeat(200), true);
    await expect(page.locator("[data-turn]")).toHaveCount(2);
    await expect.poll(() => distanceFromLatest(history)).toBeLessThanOrEqual(32);
    await page.getByRole("button", { name: "Close conversation" }).click();
    await reopenConversation(page);
    await expect(page.locator("[data-answer]").last()).toBeVisible();
  });
}

test("shadcn immediately completed responses resume scrolled-away submit and same-id retry", async ({ page }) => {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    let request = 0;
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.endsWith("/api/ask")) return nativeFetch(input, init);
      request += 1;
      const text = `Immediate response ${String(request)}. `.repeat(250);
      const body = 'event: metadata\ndata: {"mode":"live"}\n\n'
        + `event: delta\ndata: ${JSON.stringify({ text })}\n\n`
        + 'event: done\ndata: {"sources":[],"followUps":[]}\n\n';
      return Promise.resolve(new Response(body, { headers: { "Content-Type": "text/event-stream" } }));
    };
  });
  await page.goto("/");
  await openConversation(page);
  await submitQuestion(page, "First immediate answer");
  const history = page.locator("[data-conversation-history]");
  await expect(page.locator("[data-answer]")).toContainText("Immediate response 1.");
  await expect.poll(() => distanceFromLatest(history)).toBeLessThanOrEqual(32);
  const surface = page.locator("[data-chat-surface]");
  await expect(surface).not.toHaveAttribute("data-morph");
  await settleSurfaceMotion(surface);
  const original = await page.locator("[data-turn]").elementHandle();
  await page.getByRole("button", { name: "Retry message" }).focus();
  await scrollToOlderHistory(page, history);
  await expect.poll(() => distanceFromLatest(history)).toBeGreaterThan(32);
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-answer]")).toContainText("Immediate response 2.");
  await expect.poll(() => distanceFromLatest(history)).toBeLessThanOrEqual(32);
  await expect(page.locator("[data-turn]")).toHaveCount(1);
  expect(await page.locator("[data-turn]").evaluate((element, saved) => element === saved, original)).toBe(true);
  await scrollToOlderHistory(page, history);
  await submitQuestion(page, "Second immediate answer");
  await expect(page.locator("[data-answer]").last()).toContainText("Immediate response 3.");
  await expect(page.locator("[data-turn]")).toHaveCount(2);
  await expect.poll(() => distanceFromLatest(history)).toBeLessThanOrEqual(32);
});


test("clickable controls show pointer affordances without treating inputs as buttons", async ({ page }) => {
  await page.goto("/");
  const launcher = await readyLauncher(page);
  await expect(launcher).toHaveCSS("cursor", "pointer");
  await expect(page.locator('a[href]').first()).toHaveCSS("cursor", "pointer");
  const dialog = await openConversation(page);
  await expect(page.getByRole("button", { name: "Send", exact: true })).toHaveCSS("cursor", "pointer");
  await expect(page.getByRole("textbox", { name: "Your question" })).not.toHaveCSS("cursor", "pointer");
  await submitQuestion(page, "Check active control affordances");
  await expect(dialog.getByRole("button", { name: "Close conversation" })).toHaveCSS("cursor", "pointer");
  await expect(dialog.getByRole("textbox", { name: "Your question" })).not.toHaveCSS("cursor", "pointer");
});


test("expanded panel follows the live two-thirds viewport cap", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1_000, height: 900 });
  await installControlledReply(page);
  await page.goto("/");
  const dialog = await openConversation(page);
  await submitQuestion(page, "Keep sizing fluid");
  await emitReply(page, "Viewport-sized portfolio detail. ".repeat(200));
  await expect(dialog).not.toHaveAttribute("data-resizing", "true");
  await expect.poll(async () => (await requiredBox(dialog)).height).toBeCloseTo(600, 0);
  await page.setViewportSize({ width: 1_000, height: 420 });
  await expect.poll(async () => (await requiredBox(dialog)).height).toBeCloseTo(280, 0);
  await page.setViewportSize({ width: 1_000, height: 500 });
  await expect.poll(async () => (await requiredBox(dialog)).height).toBeCloseTo(500 * 2 / 3, 0);
});


test("chat remains usable when browser animation setup fails", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installControlledReply(page);
  await page.goto("/");
  await readyLauncher(page);
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Forwarded below with the original receiver via .call.
    const animate = Element.prototype.animate;
    /** Rejects only conversation surface animations to exercise decorative fail-open behavior.
     * @param keyframes - Browser animation keyframes.
     * @param options - Browser animation timing.
     * @returns The original animation for unrelated elements.
     */
    Element.prototype.animate = function (keyframes, options) {
      if (this.hasAttribute("data-chat-surface") || this.hasAttribute("data-chat-paint")) {
        throw new Error("Test animation setup failure");
      }
      return animate.call(this, keyframes, options);
    };
  });
  const dialog = await openConversation(page);
  const input = page.getByRole("textbox", { name: "Your question" });
  await expect(input).toBeFocused();
  await submitQuestion(page, "Keep the chat usable");
  await expect(dialog).toHaveCSS("opacity", "1");
  const restingHeight = (await requiredBox(dialog)).height;
  await expect(dialog).not.toHaveAttribute("data-resizing", "true");
  await expect(dialog.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await emitReply(page, "Fail-open portfolio detail. ".repeat(40));
  await expect(page.locator("[data-answer]")).toContainText("Fail-open portfolio detail.");
  expect((await requiredBox(dialog)).height).toBeGreaterThan(restingHeight);
  expect(await dialog.evaluate((element) => element.style.height)).toBe("");
  await page.getByRole("button", { name: "Close conversation" }).click();
  await expect(dialog).toBeHidden();
  await reopenConversation(page);
  await expect(dialog).toHaveCSS("opacity", "1");
  await expect(input).toBeFocused();
});


type LineRevealFrame = {
  active: boolean;
  elapsed: number;
  maskImage: string;
  maskPosition: string;
  maskSize: string;
  tokenSpans: number;
};

/** Records one streamed line reveal from its first painted frame through settlement.
 * @param page - Browser page containing the controlled answer stream.
 * @param detail - Chunk delivered at the beginning of the recording.
 * @returns Painted mask samples spanning the full reveal window.
 */
async function recordLineReveal(page: Page, detail: { text: string; done?: boolean }): Promise<LineRevealFrame[]> {
  return page.evaluate(async (next) => {
    const started = performance.now();
    const samples: LineRevealFrame[] = [];
    window.dispatchEvent(new CustomEvent("test-reply-chunk", { detail: next }));
    while (performance.now() - started < 640) {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve(); }); });
      const answer = document.querySelector<HTMLElement>("[data-answer]");
      if (!answer) continue;
      const style = getComputedStyle(answer);
      samples.push({
        active: answer.dataset.lineReveal === "true",
        elapsed: performance.now() - started,
        maskImage: style.maskImage,
        maskPosition: style.maskPosition,
        maskSize: style.maskSize,
        tokenSpans: answer.querySelectorAll("[data-sd-animate]").length,
      });
    }
    return samples;
  }, detail);
}

for (const { colorScheme, viewport } of [
  { colorScheme: "light", viewport: { width: 1_440, height: 900 } },
  { colorScheme: "dark", viewport: { width: 390, height: 844 } },
] as const) {
  test(`wrapped streamed lines reveal left to right without token wrappers in ${colorScheme}`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "no-preference", colorScheme });
    await page.setViewportSize(viewport);
    await installControlledReply(page);
    await page.goto("/");
    await openConversation(page);
    await submitQuestion(page, "Show a smooth visual-line reveal");

    const answer = page.locator("[data-answer]");
    const frames = await recordLineReveal(page, {
      text: "A deliberately long response crosses several visual lines so each painted line can reveal from its left edge toward its right edge with a soft frontier.",
      done: true,
    });
    await testInfo.attach(`streamed-line-frames-${colorScheme}`, { body: JSON.stringify(frames), contentType: "application/json" });

    const active = frames.filter((frame) => frame.active);
    expect(active.length).toBeGreaterThan(8);
    expect(active.at(-1)?.elapsed).toBeGreaterThan(300);
    expect(active.every(({ maskImage }) => maskImage !== "none")).toBe(true);
    expect(active.some(({ maskImage }) => (maskImage.match(/linear-gradient/gu) ?? []).length > 1)).toBe(true);
    expect(new Set(active.map(({ maskImage }) => maskImage)).size).toBeGreaterThan(3);
    expect(active.every(({ maskPosition, maskSize }) => maskPosition !== "0% 0%" && maskSize !== "auto")).toBe(true);
    expect(frames.every(({ tokenSpans }) => tokenSpans === 0)).toBe(true);
    expect(frames.at(-1)?.active).toBe(false);
    expect(frames.at(-1)?.maskImage).toBe("none");
    await expect(answer).toContainText("soft frontier");
    const activePaint = active.find(({ elapsed }) => elapsed >= 70) ?? active[0];
    if (!activePaint) throw new Error("Line reveal must expose an active painted frame.");
    await answer.evaluate((element, paint) => {
      element.dataset.lineReveal = "true";
      element.style.maskImage = paint.maskImage;
      element.style.maskPosition = paint.maskPosition;
      element.style.maskSize = paint.maskSize;
      element.style.maskRepeat = "no-repeat";
    }, activePaint);
    await captureConversation(page, testInfo, `streamed-lines-active-${colorScheme}`);
    await answer.evaluate((element) => {
      element.style.removeProperty("mask-image");
      element.style.removeProperty("mask-position");
      element.style.removeProperty("mask-size");
      element.style.removeProperty("mask-repeat");
      delete element.dataset.lineReveal;
    });
    await expect(answer).not.toHaveAttribute("data-line-reveal");
    await captureConversation(page, testInfo, `streamed-lines-${colorScheme}`);
  });
}

test("appending a visual line does not re-hide already painted text", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "no-preference", colorScheme: "light" });
  await page.setViewportSize({ width: 1_440, height: 900 });
  await installControlledReply(page);
  await page.goto("/");
  await openConversation(page);
  await submitQuestion(page, "Preserve the previous painted line");
  await emitReply(page, "Established text stays visually stable.");
  const answer = page.locator("[data-answer]");
  await expect(answer).not.toHaveAttribute("data-line-reveal", { timeout: 1_000 });

  const coverage = await page.evaluate(async () => {
    window.dispatchEvent(new CustomEvent("test-reply-chunk", {
      detail: { text: "\n\nA newly appended paragraph reveals across its own visual lines without replaying the paragraph above." },
    }));
    const samples: Array<{ active: boolean; gradients: number; opaqueStop: number; right: number }> = [];
    const started = performance.now();
    let frozen: { image: string; position: string; size: string } | undefined;
    while (performance.now() - started < 560) {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve(); }); });
      const element = document.querySelector<HTMLElement>("[data-answer]");
      const paragraph = element?.querySelector("p");
      if (!element || !paragraph) continue;
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      const origin = element.getBoundingClientRect();
      const right = Math.max(...Array.from(range.getClientRects(), (rect) => rect.right - origin.left));
      const style = getComputedStyle(element);
      const mask = style.maskImage;
      const opaqueStop = Number.parseFloat(
        /(?:#000|rgb\(0,\s*0,\s*0\))\s+(-?\d+(?:\.\d+)?)px/u.exec(mask)?.[1] ?? "-1",
      );
      const active = element.dataset.lineReveal === "true";
      samples.push({ active, gradients: (mask.match(/linear-gradient/gu) ?? []).length, opaqueStop, right });
      if (active) frozen = { image: mask, position: style.maskPosition, size: style.maskSize };
    }
    const element = document.querySelector<HTMLElement>("[data-answer]");
    if (element && frozen) {
      element.dataset.lineReveal = "true";
      element.style.maskImage = frozen.image;
      element.style.maskPosition = frozen.position;
      element.style.maskSize = frozen.size;
      element.style.maskRepeat = "no-repeat";
    }
    return samples;
  });
  const activeCoverage = coverage.filter(({ active }) => active);
  expect(activeCoverage.length, JSON.stringify(coverage)).toBeGreaterThan(1);
  expect(activeCoverage.some(({ gradients }) => gradients > 1), JSON.stringify(coverage)).toBe(true);
  expect(activeCoverage.every(({ opaqueStop, right }) => opaqueStop >= right - 1), JSON.stringify(coverage)).toBe(true);
  await captureConversation(page, testInfo, "established-line-active-mask");
  await answer.evaluate((element) => {
    element.style.removeProperty("mask-image");
    element.style.removeProperty("mask-position");
    element.style.removeProperty("mask-size");
    element.style.removeProperty("mask-repeat");
    delete element.dataset.lineReveal;
  });
  await emitReply(page, "", true);
});

test("an established trailing word stays opaque when inline append moves it to a new row", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "no-preference", colorScheme: "light" });
  await page.setViewportSize({ width: 390, height: 844 });
  await installControlledReply(page);
  await page.goto("/");
  await openConversation(page);
  await submitQuestion(page, "Preserve a wrapped trailing prefix");
  await emitReply(page, "Seed paragraph.");
  const answer = page.locator("[data-answer]");
  await expect(answer).not.toHaveAttribute("data-line-reveal", { timeout: 1_000 });

  const initialLine = await answer.evaluate((element) => {
    const probe = document.createElement("span");
    probe.style.cssText = "position:fixed;visibility:hidden;white-space:nowrap";
    element.append(probe);
    let candidate: string | undefined;
    for (let count = 1; count < 80; count += 1) {
      const next = `${"wrap ".repeat(count)}trans`;
      probe.textContent = next;
      const baseWidth = probe.getBoundingClientRect().width;
      probe.textContent = `${next}ferred`;
      const expandedWidth = probe.getBoundingClientRect().width;
      if (baseWidth <= element.clientWidth - 2 && expandedWidth > element.clientWidth) {
        candidate = next;
        break;
      }
    }
    probe.remove();
    if (!candidate) throw new Error("Viewport must expose a prefix that moves when its trailing word expands.");
    window.dispatchEvent(new CustomEvent("test-reply-chunk", { detail: { text: `\n\n${candidate}` } }));
    return candidate;
  });
  expect(initialLine.endsWith("trans")).toBe(true);
  await expect(answer).toContainText(initialLine);
  await expect(answer).not.toHaveAttribute("data-line-reveal", { timeout: 1_000 });
  const beforeTop = await answer.evaluate((element) => {
    const node = element.querySelector("p:last-child")?.firstChild;
    if (!(node instanceof Text)) throw new Error("Trailing prefix must render as text.");
    const range = document.createRange();
    range.setStart(node, node.length - 5);
    range.setEnd(node, node.length);
    return range.getBoundingClientRect().top - element.getBoundingClientRect().top;
  });

  const samples = await page.evaluate(async (previousTop) => {
    window.dispatchEvent(new CustomEvent("test-reply-chunk", { detail: { text: "ferred with newly streamed detail." } }));
    const frames: Array<{ active: boolean; covered: boolean; moved: boolean }> = [];
    const started = performance.now();
    while (performance.now() - started < 520) {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve(); }); });
      const element = document.querySelector<HTMLElement>("[data-answer]");
      const node = element?.querySelector("p:last-child")?.firstChild;
      if (!element || !(node instanceof Text)) continue;
      const wordStart = node.data.lastIndexOf("transferred");
      if (wordStart < 0) continue;
      const range = document.createRange();
      range.setStart(node, wordStart);
      range.setEnd(node, wordStart + 5);
      const rect = range.getBoundingClientRect();
      const origin = element.getBoundingClientRect();
      const rowTop = rect.top - origin.top;
      const stops = Array.from(
        getComputedStyle(element).maskImage.matchAll(/(?:#000|rgb\(0,\s*0,\s*0\))\s+(-?\d+(?:\.\d+)?)px/gu),
        (match) => Number.parseFloat(match[1] ?? "-1"),
      );
      const rows = Array.from(
        getComputedStyle(element).maskPosition.matchAll(/0px\s+(-?\d+(?:\.\d+)?)px/gu),
        (match) => Number.parseFloat(match[1] ?? "-999") + 3,
      );
      const index = rows.findIndex((top) => Math.abs(top - rowTop) < 3);
      frames.push({
        active: element.dataset.lineReveal === "true",
        covered: index >= 0 && (stops[index] ?? -1) >= rect.right - origin.left - 1,
        moved: rowTop > previousTop + 3,
      });
    }
    return frames;
  }, beforeTop);
  const active = samples.filter(({ active }) => active);
  expect(active.length, JSON.stringify(samples)).toBeGreaterThan(1);
  expect(active.some(({ moved }) => moved), JSON.stringify(samples)).toBe(true);
  expect(active.filter(({ moved }) => moved).every(({ covered }) => covered), JSON.stringify(samples)).toBe(true);
  await testInfo.attach("inline-wrap-prefix-frames", { body: JSON.stringify(samples), contentType: "application/json" });
  await emitReply(page, "", true);
});

test("rapid chunks and terminal metadata share one uninterrupted line reveal", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "no-preference", colorScheme: "dark" });
  await page.setViewportSize({ width: 390, height: 844 });
  await installControlledReply(page);
  await page.goto("/");
  await openConversation(page);
  await submitQuestion(page, "Keep fast chunks visually continuous");

  const frames = await page.evaluate(async () => {
    const started = performance.now();
    const samples: LineRevealFrame[] = [];
    /** Dispatches one closely spaced answer update.
     * @param text - Text appended by this update.
     * @param done - Whether this update also completes the answer.
     */
    const release = (text: string, done = false) => {
      window.dispatchEvent(new CustomEvent("test-reply-chunk", { detail: { text, done } }));
    };
    release("First streamed line grows into a second");
    window.setTimeout(() => { release(" without restarting"); }, 20);
    window.setTimeout(() => { release(" the earlier painted line.", true); }, 40);
    while (performance.now() - started < 680) {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve(); }); });
      const answer = document.querySelector<HTMLElement>("[data-answer]");
      if (!answer) continue;
      const style = getComputedStyle(answer);
      samples.push({
        active: answer.dataset.lineReveal === "true",
        elapsed: performance.now() - started,
        maskImage: style.maskImage,
        maskPosition: style.maskPosition,
        maskSize: style.maskSize,
        tokenSpans: answer.querySelectorAll("[data-sd-animate]").length,
      });
    }
    return samples;
  });

  await testInfo.attach("rapid-streamed-line-frames", { body: JSON.stringify(frames), contentType: "application/json" });
  const firstActive = frames.findIndex(({ active }) => active);
  const lastActive = frames.findLastIndex(({ active }) => active);
  expect(firstActive).toBeGreaterThanOrEqual(0);
  expect(lastActive).toBeGreaterThan(firstActive);
  expect(frames.slice(firstActive, lastActive + 1).every(({ active }) => active)).toBe(true);
  expect(frames.slice(firstActive, lastActive + 1).some(({ elapsed }) => elapsed > 300)).toBe(true);
  expect(frames.every(({ tokenSpans }) => tokenSpans === 0)).toBe(true);
  expect(frames.at(-1)?.active).toBe(false);
  await expect(page.locator("[data-answer]")).toHaveText("First streamed line grows into a second without restarting the earlier painted line.");
});

test("settled answers do not replay line motion after reopen or responsive reflow", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1_440, height: 900 });
  await installControlledReply(page);
  await page.goto("/");
  const dialog = await openConversation(page);
  await submitQuestion(page, "Keep completed lines settled");
  await recordLineReveal(page, { text: "Completed answer text remains fully painted across later layout changes.", done: true });
  const answer = page.locator("[data-answer]");
  await expect(answer).not.toHaveAttribute("data-line-reveal");
  await expect(answer).toHaveCSS("mask-image", "none");

  await page.getByRole("button", { name: "Close conversation" }).click();
  await expect(dialog).toBeHidden();
  await reopenConversation(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(answer).toContainText("fully painted");
  await expect(answer).not.toHaveAttribute("data-line-reveal");
  await expect(answer).toHaveCSS("mask-image", "none");
});

test("reduced motion paints wrapped streamed lines immediately", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await installControlledReply(page);
  await page.goto("/");
  await openConversation(page);
  await submitQuestion(page, "Keep streamed lines static");
  const frames = await recordLineReveal(page, {
    text: "This reduced-motion answer wraps across multiple visual lines without hiding any arriving text.",
    done: true,
  });
  expect(frames.every(({ active, maskImage, tokenSpans }) => !active && maskImage === "none" && tokenSpans === 0)).toBe(true);
  await expect(page.locator("[data-answer]")).toContainText("without hiding any arriving text");
});

test("streamed citation markers activate only with their own completed source metadata", async ({ page }, testInfo) => {
  await installControlledReply(page);
  await page.goto("/");
  await openConversation(page);
  for (const [index, source] of [
    { id: "project:alpha", title: "Alpha", href: "/projects/alpha" },
    { id: "article:beta", title: "Beta", href: "/articles/beta" },
  ].entries()) {
    await submitQuestion(page, `Question ${String(index)}`);
    await emitReply(page, "Evidence [1]");
    const answer = page.locator("[data-answer]").last();
    await expect(answer).toHaveText("Evidence [1]");
    await expect(answer.getByRole("link")).toHaveCount(0);
    await page.evaluate((source) => {
      window.dispatchEvent(new CustomEvent("test-reply-chunk", { detail: { done: true, sources: [source] } }));
    }, source);
    await expect(answer.getByRole("link", { name: `Source 1: ${source.title}` })).toHaveAttribute("href", source.href);
  }
  await expect(page.locator("[data-answer]").first().getByRole("link")).toHaveAttribute("href", "/projects/alpha");
  await captureConversation(page, testInfo, "inline-citations");
});
