import { expect, test } from "@playwright/test";

type ThemeTransitionRecord = {
  callbackClass: string | null;
  calls: number;
  timings: Array<{ duration: string; easing: string }> | null;
};

type SystemTransitionRecord = {
  calls: number;
  finished: Promise<void>;
};

for (const colorScheme of ["light", "dark"] as const) {
  test(`theme follows the system by default from ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.addInitScript(() => {
      const originalStartViewTransition = document.startViewTransition.bind(document);
      const record: SystemTransitionRecord = { calls: 0, finished: Promise.resolve() };
      (window as typeof window & { __systemTransition: SystemTransitionRecord }).__systemTransition = record;
      document.startViewTransition = ((update: ViewTransitionUpdateCallback) => {
        record.calls += 1;
        const transition = originalStartViewTransition(update);
        record.finished = transition.finished;
        return transition;
      }) as typeof document.startViewTransition;
    });
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${colorScheme}\\b`));
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBeNull();

    const opposite = colorScheme === "dark" ? "light" : "dark";
    await page.emulateMedia({ colorScheme: opposite });
    await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${opposite}\\b`));
    expect(await page.evaluate(() => (
      window as typeof window & { __systemTransition: SystemTransitionRecord }
    ).__systemTransition.calls)).toBe(0);

    await expect(page.locator('[data-slot="theme-toggle"] svg.lucide-sun-moon')).toBeVisible();
    await page.getByRole("button", { name: "Switch to light theme" }).click();
    await expect(page.locator('[data-slot="theme-toggle"] svg.lucide-sun')).toBeVisible();
    await page.evaluate(() => (
      window as typeof window & { __systemTransition: SystemTransitionRecord }
    ).__systemTransition.finished);
    if (colorScheme === "dark") {
      await page.getByRole("button", { name: "Switch to dark theme" }).click();
      await page.evaluate(() => (
        window as typeof window & { __systemTransition: SystemTransitionRecord }
      ).__systemTransition.finished);
    }
    await page.emulateMedia({ colorScheme });
    await page.emulateMedia({ colorScheme: opposite });
    await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${colorScheme}\\b`));
    await page.reload();
    await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${colorScheme}\\b`));

    if (colorScheme === "light") {
      await page.getByRole("button", { name: "Switch to dark theme" }).click();
      await page.evaluate(() => (
        window as typeof window & { __systemTransition: SystemTransitionRecord }
      ).__systemTransition.finished);
    }
    await expect(page.locator('[data-slot="theme-toggle"] svg.lucide-moon')).toBeVisible();
    await page.getByRole("button", { name: "Switch to system theme" }).focus();
    await page.keyboard.press("Enter");
    await page.evaluate(() => (
      window as typeof window & { __systemTransition: SystemTransitionRecord }
    ).__systemTransition.finished);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("theme"))).toBe("system");
    await page.reload();
    await expect(page.locator('[data-slot="theme-toggle"] svg.lucide-sun-moon')).toBeVisible();
    await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${opposite}\\b`));
    await page.emulateMedia({ colorScheme });
    await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${colorScheme}\\b`));
  });
}

test("theme selection persists after reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Switch to (?:dark|light) theme/ }).click();

  await expect.poll(() => page.evaluate(() => localStorage.getItem("theme"))).toMatch(/^(?:dark|light)$/);
  const selectedTheme = await page.evaluate(() => localStorage.getItem("theme"));
  if (!selectedTheme) throw new Error("Theme selection must be persisted");
  await expect(page.locator("html")).toHaveClass(new RegExp(selectedTheme));

  await page.reload();
  await expect(page.locator("html")).toHaveClass(new RegExp(selectedTheme));
});

test("stored theme hydrates without a mismatch", async ({ page }) => {
  const hydrationErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /hydration|did not match|server rendered html/i.test(message.text())) {
      hydrationErrors.push(message.text());
    }
  });
  await page.addInitScript(() => {
    localStorage.setItem("theme", "dark");
  });

  await page.goto("/");

  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("button", { name: "Switch to system theme" })).toBeEnabled();
  expect(hydrationErrors).toEqual([]);
});

test("theme toggle uses the 175 ms root cross-fade when supported", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    localStorage.setItem("theme", "system");
    const originalStartViewTransition = document.startViewTransition.bind(document);
    const record: ThemeTransitionRecord = { callbackClass: null, calls: 0, timings: null };
    (window as typeof window & { __themeTransition: ThemeTransitionRecord }).__themeTransition = record;

    document.startViewTransition = ((update: ViewTransitionUpdateCallback) => {
      record.calls += 1;
      const transition = originalStartViewTransition(async () => {
        await update();
        record.callbackClass = document.documentElement.className;
      });
      void transition.ready.then(() => {
        record.timings = [
          "::view-transition-group(root)",
          "::view-transition-old(root)",
          "::view-transition-new(root)",
        ].map((pseudoElement) => {
          const style = getComputedStyle(document.documentElement, pseudoElement);
          return { duration: style.animationDuration, easing: style.animationTimingFunction };
        });
      });
      return transition;
    }) as typeof document.startViewTransition;
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Switch to light theme" }).click();

  await expect.poll(() => page.evaluate(() => localStorage.getItem("theme"))).toBe("light");
  await expect(page.locator("html")).toHaveClass(/\blight\b/);
  await expect(page.getByRole("button", { name: "Switch to dark theme" })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __themeTransition: ThemeTransitionRecord }
  ).__themeTransition)).toEqual({
    callbackClass: expect.stringMatching(/\blight\b/),
    calls: 1,
    timings: [
      { duration: "0.175s", easing: "ease-out" },
      { duration: "0.175s", easing: "ease-out" },
      { duration: "0.175s", easing: "ease-out" },
    ],
  });
});

test("theme toggle changes immediately for reduced motion", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("theme", "system");
    (window as typeof window & { __themeTransitionCalls: number }).__themeTransitionCalls = 0;
    document.startViewTransition = (() => {
      (window as typeof window & { __themeTransitionCalls: number }).__themeTransitionCalls += 1;
      throw new Error("Reduced motion must bypass View Transitions");
    }) as typeof document.startViewTransition;
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Switch to light theme" }).click();

  await expect.poll(() => page.evaluate(() => localStorage.getItem("theme"))).toBe("light");
  await expect(page.locator("html")).toHaveClass(/\blight\b/);
  await expect(page.getByRole("button", { name: "Switch to dark theme" })).toBeEnabled();
  expect(await page.evaluate(() => (
    window as typeof window & { __themeTransitionCalls: number }
  ).__themeTransitionCalls)).toBe(0);
});

test("theme toggle falls back when View Transitions are unavailable", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    localStorage.setItem("theme", "system");
    Object.defineProperty(document, "startViewTransition", { configurable: true, value: undefined });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Switch to light theme" }).click();

  await expect.poll(() => page.evaluate(() => localStorage.getItem("theme"))).toBe("light");
  await expect(page.locator("html")).toHaveClass(/\blight\b/);
  await expect(page.getByRole("button", { name: "Switch to dark theme" })).toBeEnabled();
  expect(pageErrors).toEqual([]);
});

test("theme toggle ignores activations until the transition settles", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    localStorage.setItem("theme", "system");
    const state = {
      calls: 0,
      reject: null as null | (() => void),
    };
    (window as typeof window & { __themeTransitionState: typeof state }).__themeTransitionState = state;
    document.startViewTransition = ((update: ViewTransitionUpdateCallback) => {
      state.calls += 1;
      void update();
      /** Rejects the controlled transition so the guard cleanup path can be verified. */
      let rejectFinished = () => {};
      const finished = new Promise<void>((_resolve, reject) => {
        rejectFinished = () => {
          reject(new Error("Test transition rejected"));
        };
      });
      state.reject = rejectFinished;
      return {
        finished,
        ready: Promise.resolve(),
        /** Provides the inert skip contract required by the View Transition stub. */
        skipTransition: () => {},
        types: new Set<string>(),
        updateCallbackDone: Promise.resolve(),
      };
    }) as typeof document.startViewTransition;
  });

  await page.goto("/");
  const toggle = page.locator('[data-slot="theme-toggle"]');
  await toggle.click();
  await toggle.click();

  await expect.poll(() => page.evaluate(() => localStorage.getItem("theme"))).toBe("light");
  expect(await page.evaluate(() => (
    window as typeof window & { __themeTransitionState: { calls: number } }
  ).__themeTransitionState.calls)).toBe(1);

  await page.evaluate(() => (
    window as typeof window & { __themeTransitionState: { reject: null | (() => void) } }
  ).__themeTransitionState.reject?.());
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __themeTransitionState: { calls: number } }
  ).__themeTransitionState.calls)).toBe(1);
  await toggle.click();

  await expect.poll(() => page.evaluate(() => localStorage.getItem("theme"))).toBe("dark");
  expect(await page.evaluate(() => (
    window as typeof window & { __themeTransitionState: { calls: number } }
  ).__themeTransitionState.calls)).toBe(2);
});
