import { expect, test } from "@playwright/test";

test("brand glow shares its dark-theme mix and fixed shadow with other consumers", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("theme", "dark");
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  });
  await page.goto("/");

  const descriptor = page.locator('[data-slot="hero-descriptor"]');
  const glow = page.locator('[data-slot="hero-descriptor-glow"]');
  const wrapper = descriptor.locator("..");
  await expect(wrapper).toHaveClass(/\bbrand-glow\b/);
  await expect(descriptor).toHaveClass(/\btext-brand-gradient\b/);
  await expect(glow).toHaveClass(/\bbrand-glow-layer\b/);

  const initial = await wrapper.evaluate((element) => {
    const front = element.querySelector<HTMLElement>('[data-slot="hero-descriptor"]');
    const layer = element.querySelector<HTMLElement>('[data-slot="hero-descriptor-glow"]');
    if (!front || !layer) throw new Error("Descriptor glow layers must exist");

    const expected = document.createElement("span");
    expected.style.backgroundImage = `linear-gradient(90deg in oklab,
      color-mix(in oklab, var(--brand-accent-start) 80%, var(--foreground)),
      color-mix(in oklab, var(--brand-accent) 80%, var(--foreground)) 58%,
      color-mix(in oklab, var(--brand-accent-end) 80%, var(--foreground)))`;
    expected.style.textShadow = `
      0 0 1px color-mix(in oklab, white 20%, transparent),
      0 0 6px color-mix(in oklab, var(--brand-accent-start) 55%, transparent),
      0 0 18px color-mix(in oklab, var(--brand-accent-end) 25%, transparent)`;
    element.append(expected);

    const result = {
      expectedGradient: getComputedStyle(expected).backgroundImage,
      expectedShadow: getComputedStyle(expected).textShadow,
      gradient: getComputedStyle(front).backgroundImage,
      mix: getComputedStyle(element).getPropertyValue("--brand-glow-mix").trim(),
      opacity: getComputedStyle(layer).opacity,
      shadow: getComputedStyle(layer).textShadow,
    };
    expected.remove();
    return result;
  });
  expect(initial.gradient).toBe(initial.expectedGradient);
  expect(initial.shadow.match(/-?\d*\.?\d+(?:e[+-]?\d+)?/gi)?.map((value) => Number(Number(value).toFixed(3))))
    .toEqual(initial.expectedShadow.match(/-?\d*\.?\d+(?:e[+-]?\d+)?/gi)?.map((value) => Number(Number(value).toFixed(3))));
  expect(initial.mix).toBe("80%");
  expect(initial.opacity).toBe("0.65");
  await expect(glow).toBeVisible();

  const changed = await wrapper.evaluate((element) => {
    const front = element.querySelector<HTMLElement>('[data-slot="hero-descriptor"]');
    const layer = element.querySelector<HTMLElement>('[data-slot="hero-descriptor-glow"]');
    if (!front || !layer) throw new Error("Descriptor glow layers must exist");
    const shadow = getComputedStyle(layer).textShadow;
    document.documentElement.style.setProperty("--foreground", "#ff00ff");
    return {
      gradient: getComputedStyle(front).backgroundImage,
      shadow: getComputedStyle(layer).textShadow,
      shadowBefore: shadow,
    };
  });
  expect(changed.gradient).not.toBe(initial.gradient);
  expect(changed.shadow).toBe(changed.shadowBefore);

  const clone = page.locator("#brand-glow-test-consumer");
  await wrapper.evaluate((element) => {
    const copy = element.cloneNode(true) as HTMLElement;
    copy.id = "brand-glow-test-consumer";
    document.body.append(copy);
  });
  await expect(clone.locator('[data-slot="hero-descriptor-glow"]')).toBeVisible();
  await expect(clone.locator('[data-slot="hero-descriptor"]')).toHaveCSS(
    "background-image",
    changed.gradient,
  );
  await expect(clone.locator('[data-slot="hero-descriptor-glow"]')).toHaveCSS(
    "text-shadow",
    initial.shadow,
  );

  await clone.evaluate((element) => { element.classList.remove("brand-glow"); });
  await expect(clone.locator('[data-slot="hero-descriptor-glow"]')).toBeHidden();
  const standaloneGradient = await clone.evaluate((element) => {
    const front = element.querySelector<HTMLElement>('[data-slot="hero-descriptor"]');
    const expected = document.createElement("span");
    expected.className = "text-brand-gradient";
    document.body.append(expected);
    const result = {
      actual: front ? getComputedStyle(front).backgroundImage : "",
      expected: getComputedStyle(expected).backgroundImage,
    };
    expected.remove();
    return result;
  });
  expect(standaloneGradient.actual).toBe(standaloneGradient.expected);
});

test("brand glow activates only for dark rendering contexts", async ({ page, browser, browserName }) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("theme", "light");
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  });
  await page.goto("/");

  const descriptor = page.locator('[data-slot="hero-descriptor"]');
  const glow = page.locator('[data-slot="hero-descriptor-glow"]');
  const wrapper = descriptor.locator("..");
  await expect(glow).toBeHidden();
  await expect(wrapper).toHaveCSS("--brand-glow-mix", "100%");

  const lightGradient = await wrapper.evaluate((element) => {
    const front = element.querySelector<HTMLElement>('[data-slot="hero-descriptor"]');
    const expected = document.createElement("span");
    expected.style.backgroundImage = `linear-gradient(90deg in oklab,
      color-mix(in oklab, var(--brand-accent-start) 100%, var(--foreground)),
      color-mix(in oklab, var(--brand-accent) 100%, var(--foreground)) 58%,
      color-mix(in oklab, var(--brand-accent-end) 100%, var(--foreground)))`;
    element.append(expected);
    const result = {
      actual: front ? getComputedStyle(front).backgroundImage : "",
      expected: getComputedStyle(expected).backgroundImage,
    };
    expected.remove();
    return result;
  });
  expect(lightGradient.actual).toBe(lightGradient.expected);

  const toggle = page.locator('[data-slot="theme-toggle"]');
  await toggle.click();
  await expect(glow).toBeVisible();
  await expect(wrapper).toHaveCSS("--brand-glow-mix", "80%");
  await toggle.click();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(glow).toBeHidden();
  await expect(wrapper).toHaveCSS("--brand-glow-mix", "100%");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(glow).toBeVisible();
  await expect(wrapper).toHaveCSS("--brand-glow-mix", "80%");

  if (browserName === "chromium") {
    await page.emulateMedia({ forcedColors: "active" });
    await expect(glow).toBeHidden();
    await expect(wrapper).toHaveCSS("--brand-glow-mix", "100%");
    await page.emulateMedia({ forcedColors: "none" });
  }

  const noScriptContext = await browser.newContext({
    colorScheme: "dark",
    javaScriptEnabled: false,
  });
  try {
    const noScriptPage = await noScriptContext.newPage();
    await noScriptPage.goto(new URL("/", page.url()).href);
    await expect(noScriptPage.locator('[data-slot="hero-descriptor"]')).toHaveClass(
      /\btext-brand-gradient\b/,
    );
    await expect(noScriptPage.locator('[data-slot="hero-descriptor-glow"]')).toBeVisible();
  } finally {
    await noScriptContext.close();
  }
});
