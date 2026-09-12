import { expect, test, type Page } from "@playwright/test";

type SplashProbe = {
  visibleAt: number | null;
  exitAt: number | null;
  removedAt: number | null;
  publications: Array<{ at: number; present: boolean }>;
  durations: number[];
  playback: Array<{ easing: string; transforms: Array<string | null>; opacities: Array<string | null> }>;
  interruptedFrames: Array<{ hidden: boolean; transform: string }>;
};

type DescriptorProbe = {
  maxCount: number;
  minY: number;
  maxY: number;
  exitAt: number | null;
  replacementAt: number | null;
  travel: number;
  blankDuringExit: boolean;
};

/**
 * Records splash lifecycle events and optionally disrupts only its native playback.
 *
 * @param page - Browser page receiving instrumentation before hydration.
 * @param fault - Optional splash-only playback failure.
 */
async function observeSplash(page: Page, fault: "throw" | "hang" | "none" = "none") {
  await page.addInitScript((playbackFault) => {
    const probe: SplashProbe = { visibleAt: null, exitAt: null, removedAt: null, publications: [], durations: [], playback: [], interruptedFrames: [] };
    (window as typeof window & { splashProbe: SplashProbe }).splashProbe = probe;
    sessionStorage.removeItem("portfolio-opening-splash-seen");
    window.addEventListener("opening-splash-complete", () => {
      probe.publications.push({ at: performance.now(), present: document.querySelector('[data-slot="opening-splash"]') !== null });
    });
    const observer = new MutationObserver(() => {
      const splash = document.querySelector('[data-slot="opening-splash"]');
      if (splash?.getAttribute("data-state") === "visible") probe.visibleAt ??= performance.now();
      if (splash?.getAttribute("data-state") === "exiting") probe.exitAt ??= performance.now();
      if (!splash && probe.exitAt !== null) {
        probe.removedAt ??= performance.now();
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-state"] });

    /** Samples the first frame after setup failure or native cancellation. */
    function sampleInterruptedFrame() {
      requestAnimationFrame(() => {
        const root = document.querySelector('[data-slot="opening-splash"]');
        const style = root ? getComputedStyle(root) : null;
        probe.interruptedFrames.push({ hidden: !style || style.visibility === "hidden" || style.opacity === "0", transform: style?.transform ?? "none" });
      });
    }

    // eslint-disable-next-line @typescript-eslint/unbound-method -- Preserve the native method for a scoped playback probe.
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      if (!this.matches('[data-slot="opening-splash"]')) return animate.call(this, keyframes, options);
      probe.exitAt ??= performance.now();
      if (playbackFault === "throw") {
        sampleInterruptedFrame();
        throw new Error("Test splash playback failure");
      }
      const animation = animate.call(this, keyframes, options);
      probe.durations.push(Number(animation.effect?.getTiming().duration));
      if (animation.effect instanceof KeyframeEffect) {
        const frames = animation.effect.getKeyframes();
        probe.playback.push({
          easing: animation.effect.getTiming().easing ?? "",
          transforms: frames.map((frame) => frame.transform === undefined ? null : String(frame.transform)),
          opacities: frames.map((frame) => frame.opacity === undefined ? null : String(frame.opacity)),
        });
      }
      if (playbackFault === "hang") {
        animation.pause();
        const cancel = animation.cancel.bind(animation);
        animation.cancel = () => {
          cancel();
          sampleInterruptedFrame();
        };
      }
      return animation;
    };
  }, fault);
}

/**
 * Reads the browser's recorded splash lifecycle after playback has finished.
 *
 * @param page - Instrumented browser page.
 * @returns Recorded event ordering and native playback durations.
 */
async function readSplashProbe(page: Page) {
  return page.evaluate(() => (window as typeof window & { splashProbe: SplashProbe }).splashProbe);
}

test("splash preserves the handoff before normal removal", async ({ page }) => {
  await observeSplash(page);
  await page.goto("/");
  await expect(page.locator('[data-slot="opening-splash"]')).toHaveCount(0, { timeout: 4_500 });
  const probe = await readSplashProbe(page);
  expect(probe.playback).toEqual([{ easing: "cubic-bezier(0.87, 0, 0.13, 1)", transforms: ["none", "translateY(100%)"], opacities: [null, null] }]);
  expect(probe.publications).toHaveLength(1);
  expect(probe.publications[0]?.present).toBe(true);
  expect(probe.exitAt).not.toBeNull();
  expect(probe.removedAt).not.toBeNull();
  const eventDelay = (probe.publications[0]?.at ?? 0) - (probe.exitAt ?? 0);
  expect(eventDelay).toBeGreaterThanOrEqual(150);
  expect(eventDelay).toBeLessThanOrEqual(300);
  const lifetime = (probe.removedAt ?? 0) - (probe.exitAt ?? 0);
  expect(lifetime).toBeGreaterThanOrEqual(650);
  expect(lifetime).toBeLessThan(1_000);
});

test("reduced splash removes at its fade completion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await observeSplash(page);
  await page.goto("/");
  await expect(page.locator('[data-slot="opening-splash"]')).toHaveCount(0, { timeout: 4_500 });
  const probe = await readSplashProbe(page);
  expect(probe.durations).toEqual([320]);
  expect(probe.playback).toEqual([{ easing: expect.stringMatching(/^(?:ease|cubic-bezier\(0\.25, 0\.1, 0\.25, 1\))$/), transforms: [null, null], opacities: ["1", "0"] }]);
  expect(probe.publications).toHaveLength(1);
  expect(probe.publications[0]?.present).toBe(true);
  const lifetime = (probe.removedAt ?? 0) - (probe.exitAt ?? 0);
  expect(lifetime).toBeGreaterThanOrEqual(280);
  expect(lifetime).toBeLessThan(500);
});

for (const fault of ["throw", "hang"] as const) {
  test(`splash fails open when Motion playback ${fault === "throw" ? "throws" : "never finishes"}`, async ({ page }) => {
    await page.route("**/_vercel/{insights,speed-insights}/script.js", (route) => route.fulfill({ contentType: "application/javascript", body: "" }));
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await observeSplash(page, fault);
    await page.goto("/");
    await expect(page.locator('[data-slot="opening-splash"]')).toHaveCount(0, { timeout: 4_500 });
    await expect.poll(async () => (await readSplashProbe(page)).interruptedFrames.length).toBeGreaterThan(0);
    const probe = await readSplashProbe(page);
    expect(probe.interruptedFrames.every((frame) => frame.hidden && frame.transform === "none")).toBe(true);
    expect(probe.exitAt).not.toBeNull();
    expect(probe.publications).toHaveLength(1);
    expect((probe.removedAt ?? 0) - (probe.exitAt ?? 0)).toBeLessThan(1_250);
    if (fault === "hang") {
      expect(probe.durations).toEqual([700]);
      expect((probe.removedAt ?? 0) - (probe.exitAt ?? 0)).toBeGreaterThanOrEqual(950);
    }
    await expect(page.locator("[data-page-motion-intro]").first()).toHaveCSS("opacity", "1");
    expect(errors).toEqual([]);
  });
}

test("a live reduced-motion change cancels an exiting splash without restoring its cover", async ({ page }) => {
  await observeSplash(page, "hang");
  await page.goto("/");
  const splash = page.locator('[data-slot="opening-splash"]');
  await expect(splash).toHaveAttribute("data-state", "exiting");
  await expect.poll(() => splash.evaluate((element) => element.getAnimations().some((animation) =>
    animation.playState === "paused" && Number(animation.effect?.getTiming().duration) === 700,
  ))).toBe(true);
  await splash.evaluate((element) => {
    for (const animation of element.getAnimations()) animation.currentTime = 300;
  });
  await page.evaluate(() => {
    (window as typeof window & { interruptionFrame: Promise<{ hidden: boolean; transform: string }> }).interruptionFrame = new Promise((resolve) => {
      matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", () => {
        requestAnimationFrame(() => {
          const root = document.querySelector('[data-slot="opening-splash"]');
          const style = root ? getComputedStyle(root) : null;
          resolve({ hidden: !style || style.visibility === "hidden" || style.opacity === "0", transform: style?.transform ?? "none" });
        });
      }, { once: true });
    });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const frame = await page.evaluate(() => (window as typeof window & { interruptionFrame: Promise<{ hidden: boolean; transform: string }> }).interruptionFrame);
  expect(frame).toEqual({ hidden: true, transform: "none" });
  await expect(splash).toHaveCount(0);
  expect((await readSplashProbe(page)).publications).toHaveLength(1);
  expect((await readSplashProbe(page)).durations).toEqual([700]);
});

test("descriptor keeps its sequence and cadence across a complete rotation", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
    const probe: DescriptorProbe = { maxCount: 0, minY: 0, maxY: 0, exitAt: null, replacementAt: null, travel: 0, blankDuringExit: false };
    (window as typeof window & { descriptorProbe: DescriptorProbe }).descriptorProbe = probe;
    /** Observes every rendered transition frame without controlling playback. */
    function sampleDescriptor() {
      const slots = document.querySelectorAll('[data-slot="hero-descriptor"]');
      probe.maxCount = Math.max(probe.maxCount, slots.length);
      if (probe.exitAt !== null && probe.replacementAt === null && slots.length === 0) probe.blankDuringExit = true;
      const slot = slots[0];
      const parent = slot?.parentElement;
      if (slot && parent) {
        const y = new DOMMatrixReadOnly(getComputedStyle(parent).transform).m42;
        probe.travel = parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.875;
        probe.minY = Math.min(probe.minY, y);
        probe.maxY = Math.max(probe.maxY, y);
        if (slot.textContent === "AI Engineer" && y < -0.1) probe.exitAt ??= performance.now();
        if (slot.textContent === "Software Developer") probe.replacementAt ??= performance.now();
      }
      requestAnimationFrame(sampleDescriptor);
    }
    requestAnimationFrame(sampleDescriptor);
  });
  await page.goto("/");
  const descriptor = page.locator('[data-slot="hero-descriptor"]');
  const changes: number[] = [];
  for (const text of ["AI Engineer", "Software Developer", "UI Design Enthusiast", "Open Source Contributor", "AI Engineer"]) {
    await expect(descriptor).toHaveText(text, { timeout: 4_500 });
    await expect(descriptor).toHaveCount(1);
    changes.push(await page.evaluate(() => performance.now()));
  }
  for (let index = 2; index < changes.length; index += 1) {
    expect((changes[index] ?? 0) - (changes[index - 1] ?? 0)).toBeGreaterThan(2_800);
    expect((changes[index] ?? 0) - (changes[index - 1] ?? 0)).toBeLessThan(3_600);
  }
  const probe = await page.evaluate(() => (window as typeof window & { descriptorProbe: DescriptorProbe }).descriptorProbe);
  expect(probe.maxCount).toBe(1);
  expect(probe.blankDuringExit).toBe(false);
  expect(probe.exitAt).not.toBeNull();
  expect(probe.replacementAt).not.toBeNull();
  expect((probe.replacementAt ?? 0) - (probe.exitAt ?? 0)).toBeGreaterThan(500);
  expect(probe.minY).toBeLessThan(-probe.travel + 0.5);
  expect(probe.minY).toBeGreaterThanOrEqual(-probe.travel);
  expect(probe.maxY).toBeGreaterThan(probe.travel - 0.5);
  expect(probe.maxY).toBeLessThanOrEqual(probe.travel);
});

test("descriptor removes active translation when reduced motion changes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => { sessionStorage.setItem("portfolio-opening-splash-seen", "true"); });
  await page.goto("/");
  await page.waitForFunction(() => {
    const parent = document.querySelector('[data-slot="hero-descriptor"]')?.parentElement;
    return parent?.getAnimations().some((animation) => animation.playState === "running");
  }, undefined, { polling: 50 });
  await page.locator('[data-slot="hero-descriptor"]').locator("..").evaluate((element) => {
    for (const animation of element.getAnimations()) animation.currentTime = 200;
  });
  await expect(page.locator('[data-slot="hero-descriptor"]').locator("..")).not.toHaveCSS("transform", "none");
  await page.evaluate(() => {
    (window as typeof window & { descriptorFrame: Promise<{ count: number; transform: string }> }).descriptorFrame = new Promise((resolve) => {
      matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", () => {
        requestAnimationFrame(() => {
          const descriptors = document.querySelectorAll('[data-slot="hero-descriptor"]');
          const parent = descriptors[0]?.parentElement;
          resolve({ count: descriptors.length, transform: parent ? getComputedStyle(parent).transform : "missing" });
        });
      }, { once: true });
    });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => (window as typeof window & { descriptorFrame: Promise<{ count: number; transform: string }> }).descriptorFrame))
    .toEqual({ count: 1, transform: "none" });
  const descriptor = page.locator('[data-slot="hero-descriptor"]');
  await expect(descriptor).toHaveCount(1);
  await expect(descriptor.locator("..")).toHaveCSS("transform", "none");
  await expect(descriptor).toHaveText("Software Developer");
  await expect(descriptor).toHaveText("UI Design Enthusiast", { timeout: 4_500 });
  await expect(descriptor.locator("..")).toHaveCSS("transform", "none");
});


test("a preference change during splash readiness preserves its visibility floor", async ({ page }) => {
  await observeSplash(page);
  await page.goto("/");
  const splash = page.locator('[data-slot="opening-splash"]');
  await expect(splash).toHaveAttribute("data-state", "visible");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(splash).toHaveCount(0, { timeout: 4_500 });
  const probe = await readSplashProbe(page);
  expect(probe.durations).toEqual([320]);
  expect(probe.visibleAt).not.toBeNull();
  expect((probe.exitAt ?? 0) - (probe.visibleAt ?? 0)).toBeGreaterThanOrEqual(1_700);
  expect((probe.exitAt ?? 0) - (probe.visibleAt ?? 0)).toBeLessThan(2_100);
  expect(probe.publications).toHaveLength(1);
});

test("descriptor remount restarts one sequence without replaying the splash", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await observeSplash(page);
  await page.goto("/");
  const descriptor = page.locator('[data-slot="hero-descriptor"]');
  await expect(descriptor).toHaveText("Software Developer", { timeout: 5_000 });
  await page.getByRole("link", { name: "Read case study" }).first().click();
  await expect(page).toHaveURL(/\/projects\//);
  await page.getByRole("navigation", { name: "Project navigation" }).getByRole("link", { name: "Home" }).click();
  await expect(page).toHaveURL("/");
  await expect(descriptor).toHaveCount(1);
  await expect(descriptor).toHaveText("AI Engineer");
  await expect(page.locator('[data-slot="opening-splash"]')).toHaveCount(0);
  await expect(descriptor).toHaveText("Software Developer", { timeout: 4_500 });
  await expect(descriptor).toHaveCount(1);
  expect((await readSplashProbe(page)).publications).toHaveLength(1);
  expect(errors).toEqual([]);
});
