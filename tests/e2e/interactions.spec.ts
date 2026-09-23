import { expect, test, type Page } from "@playwright/test";
import { compile } from "sass";

import { buildMailtoHref } from "@/app/(home)/_components/contact/build-mailto-href";
import { readShellWidthContract } from "./shell-width";

const homeCodeActivityCss = compile(
  "app/(home)/_components/code-activity/code-activity.module.scss",
).css;

/**
 * Waits until entrance animations stop affecting layout measurements.
 *
 * @param page - Active browser page.
 * @param selector - Motion targets whose running animations must finish.
 */
async function waitForAnimationsToSettle(page: Page, selector: string) {
  await expect.poll(() => page.locator(selector).evaluateAll((targets) => targets.every((target) =>
    target.getAnimations().every((animation) => animation.playState !== "running"),
  ))).toBe(true);
}

/**
 * Asserts that one group's item delays keep the approved 75 ms cadence.
 *
 * @param delays - Animation delays in reveal order.
 */
function expectStaggeredDelays(delays: Array<number | null>) {
  expect(delays.length).toBeGreaterThan(0);
  expect(delays[0]).not.toBeNull();
  const startDelay = Number(delays[0]);
  for (const [index, delay] of delays.entries()) expect(delay).toBeCloseTo(startDelay + index * 75, 0);
}

test("desktop navigation and header match the corrected design contract", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 768 });
  await page.goto("/");
  const { pageGutter } = await readShellWidthContract(page);
  const header = page.getByRole("banner");
  const navigation = page.getByRole("navigation", { name: "Primary navigation" });

  await expect(header).toHaveCSS("height", "76px");
  await expect(header).toHaveCSS("border-bottom-width", "0px");
  await expect(header).toHaveCSS("background-image", /linear-gradient/);
  expect(await page.locator("#about").evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingLeft)))
    .toBeCloseTo(pageGutter, 1);
  expect(await navigation.getByRole("link").evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")),
  )).toEqual(["/#top", "/#about", "/#experience", "/#education", "/#skills", "/#projects", "/#code", "/#writing", "/#contact"]);
  await expect(page.getByRole("button", { name: "Jump to section" })).toHaveCount(0);

  const homeBox = await page.getByRole("link", { name: "Back to top" }).boundingBox();
  const themeBox = await page.locator('[data-slot="theme-toggle"]').boundingBox();
  if (!homeBox || !themeBox) throw new Error("Header controls must be measurable");
  expect(homeBox).toMatchObject({ width: 32, height: 32 });
  expect(homeBox.x).toBeCloseTo(pageGutter, 1);
  expect(themeBox).toMatchObject({ width: 32, height: 32 });
  expect(themeBox.x).toBeCloseTo(1280 - pageGutter - themeBox.width, 1);

  await page.locator("#about").evaluate((section) => {
    section.scrollIntoView();
  });
  await page.getByRole("link", { name: "Back to top" }).click();
  await expect(page).toHaveURL(/\/#top$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(1);
});

test("desktop navigation highlights the section at the sticky-header edge", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 768 });
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Primary navigation" });

  await expect(navigation.locator('a[aria-current="location"]')).toHaveCount(0);
  for (const id of ["about", "experience", "education", "skills", "projects", "code", "writing", "contact"]) {
    const href = `/#${id}`;
    await page.locator(`#${id}`).evaluate((section) => {
      section.scrollIntoView();
    });
    await expect(navigation.locator(`a[href="${href}"]`)).toHaveAttribute("aria-current", "location");
    await expect(navigation.locator('a[aria-current="location"]')).toHaveCount(1);
  }
});

test("desktop navigation highlights Contact when its link reaches the page end", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto("/#writing");
  const navigation = page.getByRole("navigation", { name: "Primary navigation" });

  await expect(navigation.getByRole("link", { name: "Writing" }))
    .toHaveAttribute("aria-current", "location");
  await navigation.getByRole("link", { name: "Contact" }).click();

  await expect(page).toHaveURL(/\/#contact$/);
  await expect(navigation.getByRole("link", { name: "Contact" }))
    .toHaveAttribute("aria-current", "location");
  await expect(navigation.getByRole("link", { name: "Writing" }))
    .not.toHaveAttribute("aria-current", "location");
});

test("the shell stays compact with tablet gutters through 1279px", async ({ page }) => {
  for (const width of [768, 1024, 1279]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const { pageGutter } = await readShellWidthContract(page);

    const header = page.getByRole("banner");
    const navigation = page.getByRole("navigation", { name: "Primary navigation" });
    const homeBox = await page.getByRole("link", { name: "Back to top" }).boundingBox();
    const themeBox = await page.locator('[data-slot="theme-toggle"]').boundingBox();
    if (!homeBox || !themeBox) throw new Error("Tablet header controls must be measurable");

    await expect(header).toHaveCSS("height", "60px");
    expect(await navigation.evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingLeft)))
      .toBeCloseTo(pageGutter, 1);
    expect(await page.locator("#about").evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingLeft)))
      .toBeCloseTo(pageGutter, 1);
    expect(homeBox).toMatchObject({ width: 44, height: 44 });
    expect(homeBox.x).toBeCloseTo(pageGutter, 1);
    expect(themeBox).toMatchObject({ width: 44, height: 44 });
    expect(themeBox.x).toBeCloseTo(width - pageGutter - themeBox.width, 1);
    expect(await navigation.getByRole("link").evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")),
    )).toEqual(["/#top"]);

    await page.locator("#about").evaluate((section) => {
      section.scrollIntoView();
    });
    await expect(page.getByRole("button", { name: "Jump to section" })).toBeVisible();
  }
});

test("Hero reserves the in-flow header height at compact and desktop widths", async ({ page }) => {
  for (const viewport of [
    { width: 1279, height: 844, headerHeight: 60 },
    { width: 1280, height: 844, headerHeight: 76 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const minHeight = await page.locator("main > section").first().evaluate((hero) =>
      Number.parseFloat(getComputedStyle(hero).minHeight));
    expect(minHeight).toBeCloseTo(viewport.height - viewport.headerHeight, 3);
  }
});

test("compact header stays aligned while the intro wraps without overflow", async ({ page }) => {
  for (const width of [344, 360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const { headerGutter } = await readShellWidthContract(page);

    const homeBox = await page.getByRole("link", { name: "Back to top" }).boundingBox();
    const themeBox = await page.locator('[data-slot="theme-toggle"]').boundingBox();
    if (!homeBox || !themeBox) throw new Error("Header controls must be measurable");
    expect(homeBox.x).toBe(headerGutter);
    expect(homeBox.width).toBe(44);
    expect(themeBox.x + themeBox.width).toBe(width - headerGutter);
    expect(themeBox.width).toBe(44);
    await expect(page.getByRole("button", { name: "Jump to section" })).toHaveCount(0);

    expect(await page.locator("#intro-heading > span").evaluateAll((spans) =>
      spans.every((span) => span.scrollWidth <= span.clientWidth && getComputedStyle(span).whiteSpace !== "nowrap"),
    )).toBe(true);
  }
});

test("Home reflows at 200 percent zoom equivalents", async ({ page }) => {
  for (const width of [195, 384, 512, 720]) {
    await page.setViewportSize({ width, height: 450 });
    await page.goto("/");
    await expect(page.locator('[data-slot="opening-splash"]')).toHaveCount(0, { timeout: 5_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const root = page.locator("html");
  await root.evaluate((element) => { element.style.fontSize = "200%"; });
  try {
    expect(await root.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  } finally {
    await root.evaluate((element) => { element.style.removeProperty("font-size"); });
  }
});

test("Résumé remains a native download link", async ({ page }) => {
  await page.goto("/");
  const resume = page.getByRole("link", { name: "Download Résumé" });

  await expect(resume).toHaveAttribute("href", /^https:\/\/.+\.pdf(?:\?.*)?$/);
  await expect(resume).toHaveAttribute("download", "");
  expect(await resume.evaluate((element) => element.tagName)).toBe("A");
});

test("compact selector opens as a content-height header extension", async ({ page }) => {
  const baseUiErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("Base UI")) baseUiErrors.push(message.text());
  });

  for (const viewport of [
    { width: 390, height: 844, theme: "light" },
    { width: 768, height: 844, theme: "dark" },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.evaluate((theme) => {
      localStorage.setItem("theme", theme);
    }, viewport.theme);
    await page.reload();
    await page.locator("#about").evaluate((section) => {
      section.scrollIntoView();
    });

    const trigger = page.getByRole("button", { name: "Jump to section" });
    const themeToggle = page.locator('[data-slot="theme-toggle"]');
    await expect(trigger).toBeVisible();
    const closedBox = await trigger.boundingBox();
    const closedFontSize = await trigger.evaluate((element) => getComputedStyle(element).fontSize);
    const themeBox = await themeToggle.boundingBox();
    if (!closedBox || !themeBox) throw new Error("Compact selector and theme control must be measurable");

    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Jump to section" });
    const close = page.getByRole("button", { name: "Close navigation" });
    await expect(dialog).toBeVisible();
    await waitForAnimationsToSettle(page, '[role="dialog"]');
    await expect(close).toHaveCount(1);
    await expect(close).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("link", { name: "Contact" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    const accessibleTitle = dialog.getByText("Jump to section", { exact: true });
    await expect(accessibleTitle).toHaveCSS("position", "absolute");
    await expect(accessibleTitle).toHaveCSS("overflow", "hidden");
    await expect(themeToggle).toHaveCSS("visibility", "hidden");
    const currentLink = dialog.getByRole("link", { name: "About" });
    await expect(currentLink).toHaveAttribute("aria-current", "location");
    await expect(currentLink.locator('[data-slot="mobile-navigation-current"]')).toBeVisible();

    const openBox = await dialog.boundingBox();
    const closeBox = await close.boundingBox();
    const headerBox = await page.locator("header").boundingBox();
    if (!openBox || !closeBox || !headerBox) {
      throw new Error("Compact navigation sheet, close control, and header must be measurable");
    }
    expect(openBox.x).toBeCloseTo(0, 1);
    expect(openBox.y).toBeCloseTo(headerBox.height, 1);
    expect(openBox.width).toBeCloseTo(viewport.width, 1);
    expect(openBox.height).toBeLessThan(viewport.height / 2);
    expect(closeBox).toEqual(themeBox);
    const header = page.locator("header");
    await expect(header).toHaveCSS("background-image", "none");
    await expect(currentLink).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    const surfaceColors = await dialog.evaluate((element) => ({
      aboveList: getComputedStyle(element, "::before").backgroundColor,
      list: getComputedStyle(element).backgroundColor,
    }));
    expect(surfaceColors.aboveList).toBe(surfaceColors.list);
    expect(await header.evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe(surfaceColors.list);
    const homeControl = page.locator('[data-slot="site-header"] a[href="/#top"]');
    const controlStyles = await Promise.all([homeControl, close].map((control) =>
      control.evaluate((element) => {
        const computed = getComputedStyle(element);
        return {
          borderRadius: computed.borderRadius,
          color: computed.color,
          height: computed.height,
          transitionProperty: computed.transitionProperty,
          width: computed.width,
        };
      })));
    expect(controlStyles[1]).toEqual(controlStyles[0]);
    const experienceLink = dialog.getByRole("link", { name: "Experience" });
    const experienceChevron = experienceLink.locator('[data-slot="mobile-navigation-chevron"]');
    await expect(experienceChevron).toHaveCSS("opacity", "0");
    const restingRowStyles = await experienceLink.evaluate((element) => ({
      backgroundColor: getComputedStyle(element).backgroundColor,
      color: getComputedStyle(element).color,
    }));
    await experienceLink.hover();
    await expect(experienceLink).toHaveCSS("background-color", restingRowStyles.backgroundColor);
    await expect.poll(() => experienceLink.evaluate((element) => getComputedStyle(element).color))
      .not.toBe(restingRowStyles.color);
    await expect(experienceChevron).toHaveCSS("opacity", "0.5");
    await page.mouse.move(0, viewport.height - 1);
    await expect(experienceChevron).toHaveCSS("opacity", "0");
    expect(await currentLink.evaluate((element) => getComputedStyle(element).fontSize)).toBe(closedFontSize);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(themeToggle).toHaveCSS("visibility", "visible");
    expect(await trigger.boundingBox()).toEqual(closedBox);
  }

  expect(baseUiErrors).toEqual([]);
});

test("compact navigation keeps wheel scrolling inside its menu", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  });
  await page.setViewportSize({ width: 390, height: 320 });
  await page.goto("/");
  await expect(page.locator("html")).not.toHaveAttribute("data-page-motion-pending", "true");
  await page.evaluate(() => {
    window.scrollTo(0, 320);
  });
  await page.getByRole("button", { name: "Jump to section" }).click();

  const menu = page.getByRole("navigation", { name: "Mobile navigation" });
  const pageScroll = await page.evaluate(() => window.scrollY);
  await menu.hover();
  await page.mouse.wheel(0, 160);

  await expect.poll(() => menu.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(pageScroll);
});

for (const path of ["/", "/articles"]) {
  test(`the skip link focuses the main content on ${path}`, async ({ page, browserName }) => {
    await page.goto(path);
    await page.keyboard.press(browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab");
    const skipLink = page.getByRole("link", { name: "Skip to content" });
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("main#main")).toBeFocused();
  });
}

test("the home page preserves its functional section structure", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).not.toBeEmpty();
  await expect(page.getByRole("link", { name: "Explore Experience" })).toHaveAttribute("href", "#experience");
  await waitForAnimationsToSettle(page, "[data-page-motion-intro]");
  const resume = page.getByRole("link", { name: "Download Résumé" });
  const secondaryAction = page.getByRole("link", { name: "Explore Experience" });
  const primaryBox = await resume.boundingBox();
  const secondaryBox = await secondaryAction.boundingBox();
  if (!primaryBox || !secondaryBox) throw new Error("Hero actions must be measurable");
  await expect(resume.locator("svg")).toHaveClass(/lucide-arrow-big-down-dash/);
  expect(primaryBox).toMatchObject({ x: 22, width: 346 });
  expect(secondaryBox.y - primaryBox.y - primaryBox.height).toBe(6);
  await secondaryAction.hover();
  await expect(secondaryAction.locator("svg")).toHaveCount(0);
  await expect(page.getByRole("contentinfo").locator("time")).toHaveText(/^\d{2}:\d{2} \(.+\)$/);
  const footerPadding = await page.getByRole("contentinfo").evaluate((footer) => {
    const style = getComputedStyle(footer);
    return [style.paddingTop, style.paddingBottom];
  });
  expect(footerPadding).toEqual(["28px", "28px"]);
  const about = page.locator("#about");
  await expect(about).toHaveCSS("scroll-margin-top", "12px");
  await expect(about.getByRole("heading", { level: 2, name: "About" })).toBeVisible();
  const experience = page.locator("#experience");
  await expect(experience.getByRole("heading", { level: 2, name: "Experience" })).toBeVisible();
  const education = page.locator("#education");
  await expect(education.getByRole("heading", { level: 2, name: "Education" })).toBeVisible();
  const projects = page.locator("#projects");
  await expect(projects.getByRole("heading", { level: 2, name: "Selected work" })).toBeVisible();
  await expect(projects.getByRole("link", { name: "See other work" })).toHaveAttribute("href", "/projects");
  const contact = page.locator("#contact");
  await expect(contact.getByRole("heading", { level: 2, name: "Let's talk" })).toBeVisible();
  await expect(contact.getByRole("textbox", { name: "Name" })).toHaveAttribute("required", "");
  await expect(contact.getByRole("textbox", { name: "Email" })).toHaveAttribute("required", "");
  await expect(contact.getByRole("textbox", { name: "Message" })).toHaveAttribute("required", "");
});

test("Experience is reachable through desktop and compact navigation", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  });
  await page.setViewportSize({ width: 1280, height: 768 });
  await page.goto("/");
  await expect(page.locator("html")).not.toHaveAttribute("data-page-motion-pending", "true");
  const experience = page.locator("#experience");
  await page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Experience" })
    .click();
  await expect(page).toHaveURL(/#experience$/);
  await expect(experience).toHaveAttribute("data-page-motion-revealed", "true");
  await waitForAnimationsToSettle(page, "#experience [data-page-motion-row]");
  await expect(experience).toHaveCSS("transform", "none");
  await expect.poll(async () => {
    const header = await page.locator('[data-slot="site-header"]').boundingBox();
    const heading = await page.locator("#experience > div").first().boundingBox();
    if (!header || !heading) throw new Error("Desktop Experience heading must be measurable");
    return Math.abs(heading.y - header.y - header.height);
  }).toBeLessThanOrEqual(1);

  for (const width of [1024, 1279]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(page.locator("html")).not.toHaveAttribute("data-page-motion-pending", "true");
    await page.evaluate(() => {
      window.scrollTo(0, 320);
    });
    await page.getByRole("button", { name: "Jump to section" }).click();
    await page.getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("link", { name: "Experience" })
      .click();
    await expect(experience).toHaveAttribute("data-page-motion-revealed", "true");
    await waitForAnimationsToSettle(page, "#experience [data-page-motion-row]");
    await expect(experience).toHaveCSS("transform", "none");
    await expect.poll(async () => {
      const header = await page.locator('[data-slot="site-header"]').boundingBox();
      const heading = await page.locator("#experience > div").first().boundingBox();
      if (!header || !heading) throw new Error("Tablet Experience heading must be measurable");
      return Math.abs(heading.y - header.y - header.height);
    }, { message: `Experience anchor offset at ${String(width)}px` }).toBeLessThanOrEqual(1);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("html")).not.toHaveAttribute("data-page-motion-pending", "true");
  await page.evaluate(() => {
    window.scrollTo(0, 320);
  });
  await page.getByRole("button", { name: "Jump to section" }).click();
  await page.getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "Experience" })
    .click();
  await expect(page).toHaveURL(/#experience$/);
  await expect(experience).toHaveAttribute("data-page-motion-revealed", "true");
  await waitForAnimationsToSettle(page, "#experience [data-page-motion-row]");
  await expect(experience).toHaveCSS("transform", "none");
  await expect.poll(async () => {
    const header = await page.locator('[data-slot="site-header"]').boundingBox();
    const heading = await page.locator("#experience > div").first().boundingBox();
    if (!header || !heading) throw new Error("Compact Experience heading must be measurable");
    return Math.abs(heading.y - header.y - header.height);
  }).toBeLessThanOrEqual(1);
});

test("About clears the sticky header through direct, desktop, and modal navigation", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/#about");
  const desktopHeading = page.getByRole("heading", { level: 2, name: "About" });
  await expect(page.locator("#about")).toHaveAttribute("data-page-motion-revealed", "true");
  await waitForAnimationsToSettle(page, "#about [data-page-motion-row]");
  await expect(page.locator("#about")).toHaveCSS("transform", "none");
  await expect(page.locator("#about")).toHaveCSS("scroll-margin-top", "-20px");
  const directBox = await desktopHeading.boundingBox();
  const directHeader = await page.locator('[data-slot="site-header"]').boundingBox();
  if (!directBox || !directHeader) throw new Error("About heading must be measurable");
  expect(Math.abs(directBox.y - directHeader.y - directHeader.height)).toBeLessThanOrEqual(1);
  const aboutColumns = page.locator("#about > div > div");
  await expect(aboutColumns).toHaveCount(2);
  const columnBoxes = await aboutColumns.evaluateAll((columns) =>
    columns.map((column) => {
      const box = column.getBoundingClientRect();
      return { top: box.top, width: box.width };
    }),
  );
  expect(columnBoxes[0]?.top).toBe(columnBoxes[1]?.top);
  expect(columnBoxes[0]?.width).toBe(columnBoxes[1]?.width);
  await expect(aboutColumns.nth(1)).toHaveCSS("border-left-width", "1px");
  await page.setViewportSize({ width: 1280, height: 768 });
  await page.goto("/");
  await expect(page.locator("html")).not.toHaveAttribute("data-page-motion-pending", "true");
  await page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "About" })
    .click();
  await expect(page).toHaveURL(/#about$/);
  await expect(page.locator("#about")).toHaveAttribute("data-page-motion-revealed", "true");
  await waitForAnimationsToSettle(page, "#about [data-page-motion-row]");
  await expect(page.locator("#about")).toHaveCSS("transform", "none");
  await expect.poll(async () => {
    const heading = await desktopHeading.boundingBox();
    const header = await page.locator('[data-slot="site-header"]').boundingBox();
    if (!heading || !header) throw new Error("About heading must be measurable after desktop navigation");
    return Math.abs(heading.y - header.y - header.height);
  }).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("html")).not.toHaveAttribute("data-page-motion-pending", "true");
  await page.evaluate(() => {
    window.scrollTo(0, 320);
  });
  const trigger = page.getByRole("button", { name: "Jump to section" });
  await expect(trigger).toBeVisible();
  await trigger.click();
  await page.getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "About" })
    .click();
  await expect(page).toHaveURL(/#about$/);
  await expect(page.locator("#about")).toHaveAttribute("data-page-motion-revealed", "true");
  await waitForAnimationsToSettle(page, "#about [data-page-motion-row]");
  await expect(page.locator("#about")).toHaveCSS("transform", "none");
  await expect.poll(async () => {
    const heading = await page.getByRole("heading", { level: 2, name: "About" }).boundingBox();
    const header = await page.locator('[data-slot="site-header"]').boundingBox();
    if (!heading || !header) throw new Error("About heading must be measurable after modal navigation");
    return Math.abs(heading.y - header.y - header.height);
  }).toBeLessThanOrEqual(1);
  const mobileColumns = page.locator("#about > div > div");
  const mobileColumnBoxes = await mobileColumns.evaluateAll((columns) =>
    columns.map((column) => {
      const box = column.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom };
    }),
  );
  expect(mobileColumnBoxes[1]?.top).toBeGreaterThan(mobileColumnBoxes[0]?.bottom ?? 0);
  await expect(mobileColumns.nth(1)).toHaveCSS("border-left-width", "0px");
});

test("Education clears the sticky header at each shell layout", async ({ page }) => {
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/#education");
    await expect(page.locator("#education")).toHaveAttribute("data-page-motion-revealed", "true");
    await waitForAnimationsToSettle(page, "#education [data-page-motion-row]");
    await expect(page.locator("#education")).toHaveCSS("transform", "none");
    const heading = await page.getByRole("heading", { level: 2, name: "Education" }).boundingBox();
    const header = await page.locator('[data-slot="site-header"]').boundingBox();
    if (!heading || !header) throw new Error("Education heading must be measurable");
    expect(Math.abs(heading.y - header.y - header.height)).toBeLessThanOrEqual(1);
  }
});

test("Skills clears the header and wraps without horizontal overflow", async ({ page }) => {
  for (const width of [195, 390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/#skills");
    const skills = page.locator("#skills");
    await expect(skills).toHaveAttribute("data-page-motion-revealed", "true");
    await waitForAnimationsToSettle(page, "#skills [data-page-motion-row], #skills [data-page-motion-item]");
    await expect(skills).toHaveCSS("transform", "none");

    expect(await skills.evaluate((section) => section.scrollWidth <= section.clientWidth)).toBe(true);

    if ([390, 768, 1280].includes(width)) {
      const heading = await skills.getByRole("heading", { level: 2, name: "Skills" }).boundingBox();
      const header = await page.locator('[data-slot="site-header"]').boundingBox();
      if (!heading || !header) throw new Error("Skills heading must be measurable");
      expect(Math.abs(heading.y - header.y - header.height)).toBeLessThanOrEqual(1);
    }
  }
});

test("compact pull-request rows preserve geometry and wrapping through production styles", async ({ page }) => {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(`
      <style>
        :root {
          --brand-accent: #007865;
          --background: oklch(0.98 0 0);
          --destructive: oklch(0.577 0.245 27.325);
          --foreground: #111111;
          --content-foreground: #454545;
          --muted-foreground: #727272;
        }
        * { box-sizing: border-box; }
        body { margin: 0; }
        main { padding: 1rem; }
        .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
        ${homeCodeActivityCss}
      </style>
      <main>
        <a class="contribution" data-slot="pull-request-row" href="https://github.com/example/extremely-long-repository-name-for-responsive-verification/pull/1234">
          <svg aria-hidden="true" class="statusIcon" data-slot="pull-request-status" data-status="merged" viewBox="0 0 24 24">
            <circle cx="6" cy="6" r="2"></circle><circle cx="18" cy="18" r="2"></circle><path d="M6 8v10M18 6v8M14 10l4-4 4 4"></path>
          </svg>
          <span class="copy" data-slot="pull-request-copy">
            <span class="repository">example/extremely-long-repository-name-for-responsive-verification #1234</span>
            <span class="title" data-slot="pull-request-title">Implement an intentionally long pull request title that must wrap cleanly without clipping or horizontal overflow</span>
          </span>
          <span class="meta" data-slot="pull-request-meta">
            <time class="period" datetime="2026-09-04T00:00:00Z" data-slot="pull-request-date">Sep 2026</time>
            <span class="diff" data-slot="pull-request-diff">
              <span aria-hidden="true" class="additions">+15,289</span>
              <span aria-hidden="true" class="deletions">−2,756</span>
              <span class="sr-only">15,289 additions and 2,756 deletions</span>
            </span>
          </span>
        </a>
      </main>
    `);

    const row = page.locator('[data-slot="pull-request-row"]');
    const geometry = await row.evaluate((row) => {
      const box = row.getBoundingClientRect();
      const icon = row.querySelector<SVGElement>('[data-slot="pull-request-status"]')?.getBoundingClientRect();
      const copyElement = row.querySelector<HTMLElement>('[data-slot="pull-request-copy"]');
      const copy = copyElement?.getBoundingClientRect();
      const repositoryElement = row.querySelector<HTMLElement>('.repository');
      const repository = repositoryElement?.getBoundingClientRect();
      const titleElement = row.querySelector<HTMLElement>('[data-slot="pull-request-title"]');
      const title = titleElement?.getBoundingClientRect();
      const metaElement = row.querySelector<HTMLElement>('[data-slot="pull-request-meta"]');
      const meta = metaElement?.getBoundingClientRect();
      const dateElement = row.querySelector<HTMLElement>('[data-slot="pull-request-date"]');
      const date = dateElement?.getBoundingClientRect();
      const diffElement = row.querySelector<HTMLElement>('[data-slot="pull-request-diff"]');
      const diff = diffElement?.getBoundingClientRect();
      const additions = row.querySelector<HTMLElement>('.additions');
      const deletions = row.querySelector<HTMLElement>('.deletions');
      if (!icon || !copyElement || !copy || !repository || !repositoryElement || !title || !titleElement || !meta || !metaElement || !date || !dateElement || !diff || !diffElement || !additions || !deletions) {
        throw new Error("Compact pull-request fixture must be measurable");
      }
      const repositoryRange = document.createRange();
      repositoryRange.selectNodeContents(repositoryElement);
      const titleRange = document.createRange();
      titleRange.selectNodeContents(titleElement);
      const dateRange = document.createRange();
      dateRange.selectNodeContents(dateElement);
      const additionsRange = document.createRange();
      additionsRange.selectNodeContents(additions);
      const deletionsRange = document.createRange();
      deletionsRange.selectNodeContents(deletions);
      return {
        row: { right: box.right, height: box.height, center: box.top + box.height / 2 },
        iconCenter: icon.top + icon.height / 2,
        metaCenter: meta.top + meta.height / 2,
        metaLeft: meta.left,
        copyRight: copy.right,
        copyGap: getComputedStyle(copyElement).rowGap,
        repository: {
          left: repository.left,
          bottom: repository.bottom,
          lines: repositoryRange.getClientRects().length,
          clipped: repositoryElement.scrollHeight > repositoryElement.clientHeight
            || repositoryElement.scrollWidth > repositoryElement.clientWidth,
        },
        title: {
          left: title.left,
          top: title.top,
          lines: titleRange.getClientRects().length,
          clipped: titleElement.scrollHeight > titleElement.clientHeight || titleElement.scrollWidth > titleElement.clientWidth,
        },
        date: {
          right: date.right,
          bottom: date.bottom,
          lines: dateRange.getClientRects().length,
          whiteSpace: getComputedStyle(dateElement).whiteSpace,
          fontSize: getComputedStyle(dateElement).fontSize,
        },
        diff: {
          top: diff.top,
          right: diff.right,
          lines: Math.max(additionsRange.getClientRects().length, deletionsRange.getClientRects().length),
          aligned: Math.abs(additions.getBoundingClientRect().top - deletions.getBoundingClientRect().top) <= 1,
          whiteSpace: getComputedStyle(diffElement).whiteSpace,
          fontSize: getComputedStyle(diffElement).fontSize,
          gap: getComputedStyle(diffElement).columnGap,
          fontVariantNumeric: getComputedStyle(diffElement).fontVariantNumeric,
        },
        countColors: [getComputedStyle(additions).color, getComputedStyle(deletions).color],
        rowOverflows: row.scrollWidth > row.clientWidth,
        documentOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });

    expect(geometry.row.height).toBeGreaterThanOrEqual(44);
    expect(Math.abs(geometry.iconCenter - geometry.row.center)).toBeLessThanOrEqual(2);
    expect(Math.abs(geometry.metaCenter - geometry.row.center)).toBeLessThanOrEqual(2);
    expect(geometry.copyGap).toBe("4px");
    expect(Math.abs(geometry.repository.left - geometry.title.left)).toBeLessThanOrEqual(1);
    expect(geometry.repository.bottom).toBeLessThanOrEqual(geometry.title.top);
    expect(geometry.metaLeft).toBeGreaterThanOrEqual(geometry.copyRight);
    expect(geometry.date.right).toBeLessThanOrEqual(geometry.row.right);
    expect(geometry.date.lines).toBe(1);
    expect(geometry.date.whiteSpace).toBe("nowrap");
    expect(geometry.date.bottom).toBeLessThanOrEqual(geometry.diff.top);
    expect(Math.abs(geometry.date.right - geometry.diff.right)).toBeLessThanOrEqual(1);
    expect(geometry.diff.lines).toBe(1);
    expect(geometry.diff.aligned).toBe(true);
    expect(geometry.diff.whiteSpace).toBe("nowrap");
    expect(geometry.date.fontSize).toBe(geometry.diff.fontSize);
    expect(geometry.date.fontSize).toBe("12px");
    expect(geometry.diff.gap).toBe("8px");
    expect(geometry.diff.fontVariantNumeric).toContain("tabular-nums");
    expect(geometry.repository.clipped).toBe(false);
    expect(geometry.title.clipped).toBe(false);
    expect(geometry.rowOverflows).toBe(false);
    expect(geometry.documentOverflows).toBe(false);
    if (width === 390) {
      expect(geometry.repository.lines).toBeGreaterThan(1);
      expect(geometry.title.lines).toBeGreaterThan(1);
    }

    const hierarchy = row.locator(".repository, .title, .period");
    const foreground = await row.evaluate((element) => getComputedStyle(element).color);
    const restingColors = await hierarchy.evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).color));
    const semanticColors = geometry.countColors;
    expect(restingColors[0]).not.toBe(restingColors[1]);
    expect(restingColors[0]).toBe(restingColors[2]);
    expect(restingColors[1]).not.toBe(restingColors[2]);
    await row.hover();
    await expect.poll(async () => {
      const colors = await hierarchy.evaluateAll((elements) =>
        elements.map((element) => getComputedStyle(element).color));
      return colors[0] === restingColors[0]
        && colors[1] === foreground
        && colors[2] === restingColors[2];
    }).toBe(true);
    expect(await row.locator(".additions, .deletions").evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).color))).toEqual(semanticColors);
    await page.mouse.move(0, 0);
    await expect.poll(async () => hierarchy.evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).color))).toEqual(restingColors);
    for (const key of ["Tab", "Alt+Tab"]) {
      await page.keyboard.press(key);
      if (await row.evaluate((element) => element === document.activeElement)) break;
    }
    await expect(row).toBeFocused();
    expect(await row.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
    await expect.poll(async () => {
      const colors = await hierarchy.evaluateAll((elements) =>
        elements.map((element) => getComputedStyle(element).color));
      return colors[0] === restingColors[0]
        && colors[1] === foreground
        && colors[2] === restingColors[2];
    }).toBe(true);
    expect(await row.locator(".additions, .deletions").evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).color))).toEqual(semanticColors);
  }
});

test("shell and footer links promote independently from supporting metadata", async ({ page, browserName }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  });
  await page.goto("/");
  const foreground = await page.locator("body").evaluate((body) => getComputedStyle(body).color);
  const navigationLink = page.locator('[data-slot="site-header"] a[href="/#about"]').first();
  const footer = page.getByRole("contentinfo");
  const footerLink = footer.getByRole("link").first();
  const footerMetadata = footer.locator("p");
  const supporting = await footerMetadata.evaluate((element) => getComputedStyle(element).color);

  await expect(navigationLink).toHaveCSS("color", supporting);
  await navigationLink.hover();
  await expect(navigationLink).toHaveCSS("color", foreground);
  await expect(footerMetadata).toHaveCSS("color", supporting);
  await footerLink.hover();
  await expect(footerLink).toHaveCSS("color", foreground);
  await expect(footerMetadata).toHaveCSS("color", supporting);

  await page.mouse.move(0, 0);
  await page.goto("/");
  const forward = browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
  for (let index = 0; index < 30; index += 1) {
    await page.keyboard.press(forward);
    if (await navigationLink.evaluate((element) => element === document.activeElement)) break;
  }
  await expect(navigationLink).toBeFocused();
  await expect(navigationLink).toHaveCSS("color", foreground);
});

test("Contact exposes its inactive and partially complete requirements", async ({ page }) => {
  await page.goto("/#contact");
  const contact = page.locator("#contact");
  const send = contact.getByRole("button", { name: "Send message" });

  await expect(send).toBeDisabled();
  await expect(contact.getByText("All three fields required", { exact: true })).toHaveCount(0);
  await expect(contact.getByText("No mail client?", { exact: true })).toHaveCount(0);
  await contact.getByRole("textbox", { name: "Name" }).fill("Anna Sokolova");
  await contact.getByRole("textbox", { name: "Email" }).fill("anna@example.com");
  await expect(send).toBeDisabled();
  await expect(contact.getByText("Message still empty", { exact: true })).toBeVisible();
});

test("Contact keeps a visible keyboard focus indicator", async ({ page }) => {
  await page.goto("/#contact");
  const name = page.locator("#contact").getByRole("textbox", { name: "Name" });

  await name.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(name).toBeFocused();
  await expect(name).not.toHaveCSS("box-shadow", "none");
  await expect(name).toHaveCSS("background-image", "none");
});

test("Contact placeholders use the reading level in both themes", async ({ page }) => {
  for (const theme of ["light", "dark"] as const) {
    await page.addInitScript((selectedTheme) => {
      localStorage.setItem("theme", selectedTheme);
      sessionStorage.setItem("portfolio-opening-splash-seen", "true");
    }, theme);
    await page.goto("/#contact");
    const contact = page.locator("#contact");
    const foreground = await contact.getByRole("heading", { level: 2 })
      .evaluate((heading) => getComputedStyle(heading).color);
    const readingColor = await contact.locator("h2 + p")
      .evaluate((paragraph) => getComputedStyle(paragraph).color);
    const supportColor = await contact.locator(":scope > p").first()
      .evaluate((paragraph) => getComputedStyle(paragraph).color);
    const placeholderColor = await contact.getByRole("textbox", { name: "Name" })
      .evaluate((input) => getComputedStyle(input, "::placeholder").color);
    const placeholderContrast = await contact.getByRole("textbox", { name: "Name" }).evaluate((input) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas color resolution must be available");
      context.fillStyle = getComputedStyle(document.body).backgroundColor;
      context.fillRect(0, 0, 1, 1);
      context.fillStyle = getComputedStyle(input).backgroundColor;
      context.fillRect(0, 0, 1, 1);
      const background = [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
      const foreground = getComputedStyle(input, "::placeholder").color.match(/[\d.]+/g)
        ?.slice(0, 3).map(Number);
      if (!foreground || foreground.length !== 3) throw new Error("Placeholder color must resolve to RGB");
      /**
       * Converts resolved sRGB channels to relative luminance.
       *
       * @param channels - Red, green, and blue channels from zero to 255.
       * @returns The relative luminance.
       */
      const luminance = (channels: number[]) => channels
        .map((channel) => channel / 255)
        .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
        .reduce((total, channel, index) => total + channel * ([0.2126, 0.7152, 0.0722][index] ?? 0), 0);
      const lighter = Math.max(luminance(foreground), luminance(background));
      const darker = Math.min(luminance(foreground), luminance(background));
      return (lighter + 0.05) / (darker + 0.05);
    });

    expect(readingColor).not.toBe(foreground);
    expect(supportColor).not.toBe(foreground);
    expect(readingColor).not.toBe(supportColor);
    expect(placeholderColor).toBe(readingColor);
    expect(placeholderContrast).toBeGreaterThanOrEqual(4.5);
  }
});

test("Contact keeps its form content-sized beside the link grid", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#contact");
  const contact = page.locator("#contact");

  await contact.getByRole("textbox", { name: "Name" }).fill("Anna Sokolova");
  await contact.getByRole("textbox", { name: "Email" }).fill("anna@example.com");
  await contact.getByRole("textbox", { name: "Message" }).fill("Hello there");

  const leftColumn = contact.locator(":scope > div > div").first();
  const form = contact.locator("form");
  const message = contact.getByRole("textbox", { name: "Message" });
  const [leftBox, formBox, messageBox] = await Promise.all([
    leftColumn.boundingBox(),
    form.boundingBox(),
    message.boundingBox(),
  ]);
  if (!leftBox || !formBox || !messageBox) throw new Error("Contact columns must be measurable");

  expect(Math.abs(leftBox.y - formBox.y)).toBeLessThanOrEqual(1);
  expect(messageBox.height).toBeGreaterThanOrEqual(128);
  const initialHeight = messageBox.height;
  await leftColumn.evaluate((column) => { column.style.minHeight = "900px"; });
  expect((await message.boundingBox())?.height).toBeCloseTo(initialHeight, 1);
});

test("Contact native validation focuses an invalid email", async ({ page }) => {
  await page.goto("/#contact");
  const contact = page.locator("#contact");
  const email = contact.getByRole("textbox", { name: "Email" });

  await contact.getByRole("textbox", { name: "Name" }).fill("Anna Sokolova");
  await email.fill("not-an-email");
  await contact.getByRole("textbox", { name: "Message" }).fill("Hello there");
  await expect(contact.getByRole("button", { name: "Send message" })).toBeDisabled();
  await contact.locator("form").evaluate((form: HTMLFormElement) => {
    form.requestSubmit();
  });

  await expect(email).toBeFocused();
  expect(await email.evaluate((input: HTMLInputElement) => input.validity.typeMismatch)).toBe(true);
});

test("Contact keeps the ready mail-app handoff out of the form action", async ({ page }) => {
  await page.goto("/#contact");
  const contact = page.locator("#contact");

  await contact.getByRole("textbox", { name: "Name" }).fill("Anna Sokolova");
  await contact.getByRole("textbox", { name: "Email" }).fill("anna@example.com");
  await contact.getByRole("textbox", { name: "Message" }).fill("Hello there");

  await expect(contact.getByRole("button", { name: "Send message" })).toBeEnabled();
  await expect(contact.getByText("Opens your mail app", { exact: true })).toHaveCount(0);
  await expect(contact.getByText("Subject: Portfolio message from Anna Sokolova", { exact: true }))
    .toHaveCount(0);
  expect(await contact.locator("form").getAttribute("action")).toBeNull();
});

test("Contact encodes a recipient, subject, and multiline body", () => {
  const recipient = "recipient@example.test";
  const name = "Sample Person";
  const sender = "sender+portfolio@example.test";
  const message = "Hello & thanks\nSecond line";
  const href = buildMailtoHref(
    recipient,
    name,
    sender,
    message,
  );

  const parsed = new URL(href);
  expect(parsed.pathname).toBe(recipient);
  expect(parsed.searchParams.get("subject")).toBe(`Portfolio message from ${name}`);
  expect(parsed.searchParams.get("body")).toBe(`From: ${name} <${sender}>\n\n${message}`);
});

test("Contact reflows without overflow in both themes", async ({ page }) => {
  for (const { width, theme } of [
    { width: 195, theme: "light" },
    { width: 390, theme: "dark" },
    { width: 414, theme: "light" },
    { width: 1440, theme: "dark" },
  ]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/#contact");
    await page.evaluate((selectedTheme) => {
      localStorage.setItem("theme", selectedTheme);
    }, theme);
    await page.reload();

    await expect(page.locator("html")).toHaveClass(new RegExp(theme));
    const send = page.locator("#contact").getByRole("button", { name: "Send message" });
    await expect(send).toBeVisible();
    expect(await send.evaluate((button) => button.scrollHeight <= button.clientHeight)).toBe(true);
    expect(await page.locator("html").evaluate((root) => root.scrollWidth <= root.clientWidth)).toBe(true);
  }
});

test("Contact clears the desktop sticky header through its direct anchor", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#contact");

  const sectionRule = page.locator("#contact > p");
  const ruleBox = await sectionRule.boundingBox();
  const headingBox = await page.getByRole("heading", { level: 2, name: "Let's talk" }).boundingBox();
  const headerBox = await page.locator('[data-slot="site-header"]').boundingBox();
  if (!ruleBox || !headingBox || !headerBox) throw new Error("Contact heading and rule must be measurable");

  expect(ruleBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
  expect(headingBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
  await expect(sectionRule).toHaveCSS("border-top-width", "1px");
});

test("the project collection link selects its desktop header item after client navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#projects");
  await page.locator('[data-slot="more-projects-link"]').click();
  await expect(page).toHaveURL(/\/projects$/);

  const navigation = page.getByRole("navigation", { name: "Primary navigation" });
  await expect(navigation.getByRole("link", { name: "Projects" }))
    .toHaveAttribute("aria-current", "location");
  await expect(navigation.getByRole("link", { name: "Writing" }))
    .not.toHaveAttribute("aria-current", "location");

});

test("detail routes replace shell controls after client navigation without adding a header", async ({ page }) => {
  for (const route of [
    {
      collection: "/projects",
      row: "project-row",
      navigation: "Project navigation",
      back: "Back to list",
    },
    {
      collection: "/articles",
      row: "article-row",
      navigation: "Article navigation",
      back: "Back to list",
    },
  ]) {
    await page.goto(route.collection);
    const row = page.locator(`[data-slot="${route.row}"]`).first();
    if (!await row.count()) continue;
    await row.click();

    const header = page.getByRole("banner");
    await expect(header).toHaveCount(1);
    const navigation = header.getByRole("navigation", { name: route.navigation });
    await expect(navigation.getByRole("link", { name: route.back })).toHaveAttribute(
      "href",
      route.collection,
    );
    await expect(navigation.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
  }
});

for (const theme of ["light", "dark"] as const) {
  test(`Jade accent is shared across the site with a readable descriptor in ${theme} mode`, async ({ page, browserName }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme === "light" ? "dark" : "light" });
    await page.addInitScript((preferredTheme) => {
      localStorage.setItem("theme", preferredTheme);
      sessionStorage.setItem("portfolio-opening-splash-seen", "true");
    }, theme);
    await page.goto("/");
    const descriptor = page.locator('[data-slot="hero-descriptor"]');
    const rotation = descriptor.locator("..");
    const heading = page.locator("#intro-heading");
    const availabilityDot = page.locator('[data-slot="availability-dot"]');
    const availability = availabilityDot.locator("..");
    const availabilityStatus = availability.locator(':scope > span').nth(1);
    const name = page.locator('#contact-name');
    const email = page.locator('#contact-email');
    const message = page.locator('#contact-message');
    const headingColor = await heading.evaluate((element) => getComputedStyle(element).color);

    await expect(descriptor).toHaveCSS("font-size", "12px");
    await expect(descriptor).toHaveCSS("background-image", /linear-gradient.*58%/);
    await expect(descriptor).toHaveCSS("background-clip", "text");
    await expect(descriptor).toHaveCSS("filter", "none");
    await expect(descriptor).toHaveCSS("text-shadow", "none");
    await expect(rotation).toHaveCSS("filter", "none");
    await expect(page.locator('[data-slot="hero-descriptor-glow"]')).toHaveCount(0);
    await expect(heading).toHaveCSS("background-image", "none");
    await expect(availability).toHaveCSS("background-image", /linear-gradient/);
    await expect(availabilityStatus).toHaveCSS("background-image", "none");
    await expect(availabilityStatus).toHaveCSS("color", headingColor);
    await expect(availabilityDot).toHaveCSS("background-image", /linear-gradient.*58%/);

    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => { window.scrollTo({ top: 0, behavior: "instant" }); });
      await waitForAnimationsToSettle(page, "[data-page-motion-intro]");
      await expect(rotation).toHaveCSS("opacity", "1");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.locator('section[aria-labelledby="intro-heading"]').screenshot({
        path: testInfo.outputPath(`jade-${theme}-${String(width)}.png`),
      });
      await availability.screenshot({ path: testInfo.outputPath(`jade-${theme}-${String(width)}-badge.png`) });

      for (const row of await page.locator("#contact [data-page-motion-row]").all()) {
        await row.evaluate((element) => { element.scrollIntoView({ block: "center", behavior: "instant" }); });
        await expect(row).toHaveCSS("opacity", "1");
      }
      await name.focus();
      await page.locator("#contact form").screenshot({
        path: testInfo.outputPath(`jade-${theme}-${String(width)}-form-focus.png`),
      });

    }

    const selectionBefore = await descriptor.evaluate((element) => getComputedStyle(element, "::selection").backgroundColor);
    for (const section of ["code", "contact"]) {
      for (const row of await page.locator(`#${section} [data-page-motion-row]`).all()) {
        await row.evaluate((element) => { element.scrollIntoView({ block: "center", behavior: "instant" }); });
        await expect(row).toHaveCSS("opacity", "1");
      }
      await page.locator(`#${section}`).screenshot({ path: testInfo.outputPath(`jade-${theme}-${section}.png`) });
    }

    const accent = "rgb(120, 70, 190)";
    const endpoint = "rgb(235, 85, 45)";
    const directGradient = /rgb\(120,\s*70,\s*190\).*rgb\(235,\s*85,\s*45\)/;
    const availabilityBefore = await availability.evaluate((element) => getComputedStyle(element).backgroundImage);
    const descriptorBefore = await descriptor.evaluate((element) => getComputedStyle(element).backgroundImage);
    await page.evaluate(({ accentColor, endpointColor }) => {
      document.documentElement.style.setProperty("--brand-accent", accentColor);
      document.documentElement.style.setProperty("--brand-accent-end", endpointColor);
    }, { accentColor: accent, endpointColor: endpoint });
    const ringColor = await page.evaluate(() => {
      const sample = document.createElement("span");
      sample.style.color = "var(--ring)";
      document.body.append(sample);
      const color = getComputedStyle(sample).color;
      sample.remove();
      return color;
    });
    await expect(descriptor).not.toHaveCSS("background-image", descriptorBefore);
    await expect(availabilityStatus).toHaveCSS("background-image", "none");
    await expect(availabilityStatus).toHaveCSS("color", headingColor);
    await expect(availabilityDot).toHaveCSS("background-image", directGradient);
    expect(await availability.evaluate((element) => getComputedStyle(element).backgroundImage))
      .not.toBe(availabilityBefore);
    expect(await descriptor.evaluate((element) => getComputedStyle(element, "::selection").backgroundColor))
      .not.toBe(selectionBefore);
    await name.focus();
    await expect(name).toHaveCSS("border-color", ringColor);
    await expect(name).not.toHaveCSS("box-shadow", "none");
    await expect(name).toHaveCSS("background-image", "none");
    await expect(name).toHaveCSS("filter", "none");
    await expect(name).toHaveCSS("mask-image", "none");

    await message.focus();
    await expect(message).toHaveCSS("border-color", ringColor);
    await expect(message).not.toHaveCSS("box-shadow", "none");
    await expect(message).toHaveCSS("background-image", "none");
    await expect(message).toHaveCSS("filter", "none");
    await expect(message).toHaveCSS("mask-image", "none");

    await email.fill("not-an-email");
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await email.focus();
    await expect(email).not.toHaveCSS("border-color", ringColor);
    await expect(email).not.toHaveCSS("border-color", "rgba(0, 0, 0, 0)");

    await name.evaluate((element) => { element.toggleAttribute("disabled", true); });
    await expect(name).toBeDisabled();
    await name.evaluate((element) => { element.toggleAttribute("disabled", false); });
    await expect(heading).toHaveCSS("color", headingColor);

    if (browserName === "chromium") {
      await name.focus();
      await page.emulateMedia({ forcedColors: "active" });
      await expect(descriptor).toHaveCSS("background-image", "none");
      await expect(descriptor).not.toHaveCSS("color", "rgba(0, 0, 0, 0)");
      await expect(page.locator('[data-slot="hero-descriptor-glow"]')).toHaveCount(0);
      await expect(name).toBeFocused();
      await expect(name).toHaveCSS("border-style", "solid");
      await expect(name).not.toHaveCSS("border-color", "rgba(0, 0, 0, 0)");
      await page.emulateMedia({ forcedColors: "none" });
    }

  });
}

test("Page motion markers map Home intro groups and stable sections", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  });
  await page.goto("/");

  const heroTargets = page.locator("[data-page-motion-intro]");
  expect(await heroTargets.count()).toBeGreaterThan(0);
  expect(await heroTargets.evaluateAll((elements) => elements.some((element) => element.tagName === "H1"))).toBe(true);

  const expectedSections = ["about", "experience", "education", "skills", "projects", "code", "writing", "contact"];
  const sectionRoots = page.locator("[data-page-motion-section]");
  await expect(sectionRoots).toHaveCount(expectedSections.length);
  expect(await sectionRoots.evaluateAll((sections) => sections.map((section) => ({
    id: section.id,
    nestedHeroTargets: section.querySelectorAll("[data-page-motion-intro]").length,
    nestedSectionTargets: section.querySelectorAll("[data-page-motion-section]").length,
    rowCount: section.querySelectorAll("[data-page-motion-row]").length,
    triggerOwnedByRow: Array.from(section.querySelectorAll("[data-page-motion-trigger]")).every((trigger) =>
      trigger.closest("[data-page-motion-row]")?.closest("[data-page-motion-section]") === section,
    ),
    triggerIds: Array.from(section.querySelectorAll("[data-page-motion-trigger]"), (trigger) => trigger.id),
  })))).toEqual(expectedSections.map((id) => expect.objectContaining({
    id,
    nestedHeroTargets: 0,
    nestedSectionTargets: 0,
    rowCount: expect.any(Number),
    triggerOwnedByRow: true,
    triggerIds: [`${id}-heading`],
  })));
});

for (const route of [
  { introCount: 1, label: "project list", path: "/projects" },
  { introCount: 1, label: "article list", path: "/articles" },
]) {
  test(`Page motion animates the ${route.label} route`, async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem("portfolio-opening-splash-seen", "true");
    });
    await page.goto(route.path);

    const introTargets = page.locator("[data-page-motion-intro]");
    const sectionTargets = page.locator("[data-page-motion-section]");
    await expect(introTargets).toHaveCount(route.introCount);
    if (await sectionTargets.count() > 0) {
      expect(await sectionTargets.evaluateAll((sections) => sections.every((section) =>
        section.matches('[data-page-motion-rows="children"]')
          ? section.children.length > 0
          : section.querySelectorAll("[data-page-motion-row]").length > 0,
      ))).toBe(true);
    }
    await expect.poll(() => introTargets.first().evaluate((target) => target.getAnimations().some((animation) => {
      const effect = animation.effect;
      return effect instanceof KeyframeEffect
        && effect.getKeyframes().some((frame) => frame.opacity !== undefined);
    }))).toBe(true);
    const introDelays = await introTargets.evaluateAll((targets) => targets.map((target) => {
      const animation = target.getAnimations().find((candidate) => candidate.effect instanceof KeyframeEffect);
      return animation?.effect instanceof KeyframeEffect ? Number(animation.effect.getTiming().delay) : null;
    }));
    for (const [index, delay] of introDelays.entries()) expect(delay).toBeCloseTo(40 + index * 75, 0);
    const finalRow = page.locator("[data-page-motion-row]").last();
    if (await finalRow.count()) {
      await finalRow.focus();
      await expect(finalRow).toHaveCSS("opacity", "1");
      await expect(finalRow).toHaveCSS("transform", "none");
    }
  });
}

for (const route of [
  { path: "/projects", slot: "project-row" },
  { path: "/articles", slot: "article-row" },
]) {
  test(`Page motion stages visible ${route.slot} entries and keeps later entries armed`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript(() => {
      sessionStorage.setItem("portfolio-opening-splash-seen", "true");
    });
    await page.goto(route.path);

    const rows = page.locator(`[data-slot="${route.slot}"]`);
    if (await rows.count() < 2) return;
    const firstRow = rows.nth(0), secondRow = rows.nth(1), finalRow = rows.last();
    let entryDelays: Array<number | null> = [];
    await expect.poll(async () => {
      entryDelays = await Promise.all([firstRow, secondRow].map((row) => row.evaluate((target) => {
        const animation = target.getAnimations().find((candidate) => candidate.effect instanceof KeyframeEffect);
        return animation?.effect instanceof KeyframeEffect ? Number(animation.effect.getTiming().delay) : null;
      })));
      return entryDelays.every((delay) => delay !== null);
    }).toBe(true);
    expect(await rows.evaluateAll((targets) => targets.every((target) =>
      target.querySelectorAll("article > *").length > 0
        && Array.from(target.querySelectorAll("article > *")).every((child) => child.getAnimations().length === 0),
    ))).toBe(true);
    const finalWasVisible = await rows.last().evaluate((target) => {
      const bounds = target.getBoundingClientRect();
      return bounds.bottom > 0 && bounds.top < window.innerHeight * 0.9;
    });
    if (finalWasVisible) {
      await expect.poll(() => finalRow.evaluate((target) => target.getAnimations().length)).toBeGreaterThan(0);
    } else {
      await expect(finalRow).toHaveCSS("opacity", "0");
      expect(await finalRow.evaluate((target) => target.getAnimations().length)).toBe(0);
    }

    expectStaggeredDelays(entryDelays);

    if (!finalWasVisible) {
      await rows.last().evaluate((element) => {
        const absoluteTop = element.getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, absoluteTop - window.innerHeight * 0.88);
      });
      await expect.poll(() => finalRow.evaluate((target) => target.getAnimations().length)).toBeGreaterThan(0);
    }
    const finalDelay = await finalRow.evaluate((target) => {
      const animation = target.getAnimations().find((candidate) => candidate.effect instanceof KeyframeEffect);
      return animation?.effect instanceof KeyframeEffect ? Number(animation.effect.getTiming().delay) : null;
    });
    expect(finalDelay).not.toBeNull();
    expect(Number(finalDelay) / 75).toBeCloseTo(Math.round(Number(finalDelay) / 75), 5);
  });
}

test("Page motion overlaps the final splash slide without a visible-to-hidden frame", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.removeItem("portfolio-opening-splash-seen");
    const probeWindow = window as typeof window & {
      __pageMotionFrames?: Array<{ animating: boolean; opacity: number; splashPresent: boolean }>;
    };
    probeWindow.__pageMotionFrames = [];
    /** Samples paint-boundary state until the first intro finishes revealing. */
    function inspectPaint() {
      const target = document.querySelector<HTMLElement>("[data-page-motion-intro]");
      if (target) {
        const opacity = Number.parseFloat(getComputedStyle(target).opacity);
        const animating = target.getAnimations().some((animation) => {
          const effect = animation.effect;
          return animation.playState === "running"
            && effect instanceof KeyframeEffect
            && effect.getKeyframes().some((frame) => frame.opacity !== undefined);
        });
        probeWindow.__pageMotionFrames?.push({
          animating,
          opacity,
          splashPresent: document.querySelector('[data-slot="opening-splash"]') !== null,
        });
        if (probeWindow.__pageMotionFrames && probeWindow.__pageMotionFrames.length >= 420) return;
        if (!document.querySelector('[data-slot="opening-splash"]') && opacity >= 0.99 && !animating) return;
      }
      requestAnimationFrame(inspectPaint);
    }
    requestAnimationFrame(inspectPaint);
  });

  await page.goto("/");
  await expect(page.locator('[data-slot="opening-splash"]')).toHaveAttribute("data-state", "visible");
  await expect(page.locator("html")).toHaveAttribute("data-page-motion-pending", "true");
  await expect.poll(() => page.evaluate(() => {
    const frames = (window as typeof window & {
      __pageMotionFrames?: Array<{ opacity: number; splashPresent: boolean }>;
    }).__pageMotionFrames ?? [];
    return frames.some((frame) => !frame.splashPresent && frame.opacity >= 0.99);
  }), { timeout: 4_500 }).toBe(true);

  const frames = await page.evaluate(() => {
    const frames = (window as typeof window & {
      __pageMotionFrames?: Array<{ animating: boolean; opacity: number; splashPresent: boolean }>;
    }).__pageMotionFrames ?? [];
    return frames;
  });
  expect(frames.some((frame) => frame.splashPresent
    && frame.animating && frame.opacity > 0 && frame.opacity < 0.95)).toBe(true);
  const firstSplashFreeFrame = frames.find((frame) => !frame.splashPresent);
  expect(firstSplashFreeFrame?.animating).toBe(true);
  expect(firstSplashFreeFrame?.opacity).toBeLessThan(1);
  expect(frames.every((frame, index) => index === 0
    || frame.opacity + 0.08 >= (frames[index - 1]?.opacity ?? 0))).toBe(true);
});

test("Page motion stays exposed when splash completion arrives after preflight concealment ends", async ({ page }) => {
  await page.goto("/?debugSplash");
  const root = page.locator("html");
  const introTargets = page.locator("[data-page-motion-intro]");
  await expect(page.locator('[data-slot="opening-splash"]')).toHaveAttribute("data-state", "visible");
  await expect(root).toHaveAttribute("data-page-motion-pending", "true");
  await expect(introTargets.first()).toHaveCSS("opacity", "0");

  await page.evaluate(() => {
    delete document.documentElement.dataset.pageMotionPending;
  });
  await expect(introTargets.first()).toHaveCSS("opacity", "1");
  await page.evaluate(() => {
    document.documentElement.dataset.splashComplete = "true";
    window.dispatchEvent(new Event("opening-splash-complete"));
  });

  await expect(introTargets.first()).toHaveCSS("opacity", "1");
  expect(await introTargets.evaluateAll((targets) => targets.every((target) => {
    const element = target as HTMLElement;
    return element.style.opacity === ""
      && element.style.transform === ""
      && element.getAnimations().every((animation) => animation.playState !== "running");
  }))).toBe(true);
});

test("Page motion preserves preflight across an unstarted effect replacement", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?debugSplash");

  const root = page.locator("html");
  const introTarget = page.locator("[data-page-motion-intro]").first();
  await expect(root).toHaveAttribute("data-page-motion-pending", "true");
  await expect(introTarget).toHaveCSS("transform", "none");

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(introTarget).not.toHaveCSS("transform", "none");
  await page.waitForTimeout(100);
  await expect(root).toHaveAttribute("data-page-motion-pending", "true");

  await page.evaluate(() => {
    document.documentElement.dataset.splashComplete = "true";
    window.dispatchEvent(new Event("opening-splash-complete"));
  });

  await expect(root).not.toHaveAttribute("data-page-motion-pending", "true");
  await expect.poll(() => introTarget.evaluate((target) => target.getAnimations().length)).toBeGreaterThan(0);
});

test("Page motion stays exposed when its first hydration starts after preflight concealment ends", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.removeItem("portfolio-opening-splash-seen");
  });
  await page.route("**/*.js", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 4_700));
    await route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const introTargets = page.locator("[data-page-motion-intro]");
  await expect(page.locator("html")).not.toHaveAttribute("data-page-motion-pending", "true");
  await expect(page.locator('[data-slot="opening-splash"]')).toHaveCount(0);
  await expect(introTargets.first()).toHaveCSS("opacity", "1");
  expect(await introTargets.evaluateAll((targets) => targets.every((target) => {
    const element = target as HTMLElement;
    return element.style.opacity === ""
      && element.style.transform === ""
      && element.getAnimations().every((animation) => animation.playState !== "running");
  }))).toBe(true);
});

test("Page intro uses the approved Quiet rise timing and stagger", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  });
  await page.goto("/");
  const heroTargets = page.locator("[data-page-motion-intro]");
  await expect.poll(() => heroTargets.evaluateAll((targets) => targets.every((target) =>
    target.getAnimations().length > 0,
  ))).toBe(true);

  const contracts = await heroTargets.evaluateAll((targets) => targets.map((target) => {
    const opacityAnimation = target.getAnimations().find((candidate) => {
      const effect = candidate.effect;
      return effect instanceof KeyframeEffect
        && effect.getKeyframes().some((frame) => frame.opacity !== undefined);
    });
    const transformAnimation = target.getAnimations().find((candidate) => {
      const effect = candidate.effect;
      return effect instanceof KeyframeEffect
        && effect.getKeyframes().some((frame) => frame.transform !== undefined);
    });
    if (!opacityAnimation || !(opacityAnimation.effect instanceof KeyframeEffect)
      || !transformAnimation || !(transformAnimation.effect instanceof KeyframeEffect)) return null;
    const opacityFrames = opacityAnimation.effect.getKeyframes();
    const transformFrames = transformAnimation.effect.getKeyframes();
    const opacityTiming = opacityAnimation.effect.getTiming();
    const transformTiming = transformAnimation.effect.getTiming();
    const previousCurrentTime = transformAnimation.currentTime;
    const wasRunning = transformAnimation.playState === "running";
    transformAnimation.pause();
    transformAnimation.currentTime = Number(transformTiming.delay);
    const initialTranslateY = new DOMMatrixReadOnly(getComputedStyle(target).transform).m42;
    transformAnimation.currentTime = previousCurrentTime;
    if (wasRunning) transformAnimation.play();
    return {
      initialTranslateY,
      opacityDelay: Number(opacityTiming.delay),
      opacityDuration: Number(opacityTiming.duration),
      opacityEasing: opacityTiming.easing,
      transformDelay: Number(transformTiming.delay),
      transformDuration: Number(transformTiming.duration),
      transformEasing: transformTiming.easing,
      firstOpacity: opacityFrames.at(0)?.opacity,
      lastOpacity: opacityFrames.at(-1)?.opacity,
      lastTransform: transformFrames.at(-1)?.transform,
    };
  }));

  expect(contracts).toHaveLength(5);
  for (const [index, contract] of contracts.entries()) {
    expect(contract).not.toBeNull();
    expect(contract?.opacityDuration).toBeCloseTo(520, 0);
    expect(contract?.transformDuration).toBeCloseTo(520, 0);
    expect(contract?.opacityDelay).toBeCloseTo(40 + index * 75, 0);
    expect(contract?.transformDelay).toBeCloseTo(40 + index * 75, 0);
    expect(contract?.opacityEasing).toBe("cubic-bezier(0.22, 1, 0.36, 1)");
    expect(contract?.transformEasing).toBe("cubic-bezier(0.22, 1, 0.36, 1)");
    expect(contract?.firstOpacity).toBe("0");
    expect(contract?.initialTranslateY).toBeCloseTo(18, 3);
    expect(contract?.lastOpacity).toBe("1");
    expect(["none", "translateY(0px)"]).toContain(contract?.lastTransform);
  }
});

test("Page reduced motion removes translation and stagger", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
    const probeWindow = window as typeof window & {
      __reducedPageMotionContracts?: Array<{
        delay: number;
        duration: number;
        transforms: unknown[];
      }>;
    };
    /** Captures the brief reduced-motion animation before it completes. */
    const inspect = () => {
      const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-page-motion-intro]"));
      const contracts = targets.map((target) => {
        const animation = target.getAnimations().find((candidate) => candidate.effect instanceof KeyframeEffect);
        if (!animation || !(animation.effect instanceof KeyframeEffect)) return null;
        const timing = animation.effect.getTiming();
        return {
          delay: Number(timing.delay),
          duration: Number(timing.duration),
          transforms: animation.effect.getKeyframes().map((frame) => frame.transform).filter(Boolean),
        };
      });
      if (contracts.length === 5 && contracts.every((contract) => contract !== null)) {
        probeWindow.__reducedPageMotionContracts = contracts;
        return;
      }
      requestAnimationFrame(inspect);
    };
    requestAnimationFrame(inspect);
  });
  await page.goto("/");
  const heroTargets = page.locator("[data-page-motion-intro]");
  await expect.poll(() => page.evaluate(() => Boolean((window as typeof window & {
    __reducedPageMotionContracts?: unknown;
  }).__reducedPageMotionContracts))).toBe(true);
  const contracts = await page.evaluate(() => (window as typeof window & {
    __reducedPageMotionContracts?: Array<{ delay: number; duration: number; transforms: unknown[] }>;
  }).__reducedPageMotionContracts ?? []);
  expect(contracts.every((contract) => contract.delay === 0 && contract.duration === 120)).toBe(true);
  expect(contracts.every((contract) => contract.transforms.length === 0)).toBe(true);
  await expect(heroTargets.first()).toHaveCSS("transform", "none");
});

test("Page reduced motion remains opacity-only on a non-Home route", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
    const probeWindow = window as typeof window & {
      __reducedProjectMotionContract?: { delay: number; duration: number; transforms: unknown[] };
    };
    /** Captures the brief reduced-motion project intro before it completes. */
    function inspectProjectIntro() {
      const target = document.querySelector<HTMLElement>("[data-page-motion-intro]");
      const animation = target?.getAnimations().find((candidate) => candidate.effect instanceof KeyframeEffect);
      if (!animation || !(animation.effect instanceof KeyframeEffect)) {
        requestAnimationFrame(inspectProjectIntro);
        return;
      }
      const timing = animation.effect.getTiming();
      probeWindow.__reducedProjectMotionContract = {
        delay: Number(timing.delay),
        duration: Number(timing.duration),
        transforms: animation.effect.getKeyframes().map((frame) => frame.transform).filter(Boolean),
      };
    }
    requestAnimationFrame(inspectProjectIntro);
  });
  await page.goto("/projects");

  await expect.poll(() => page.evaluate(() => Boolean((window as typeof window & {
    __reducedProjectMotionContract?: unknown;
  }).__reducedProjectMotionContract))).toBe(true);
  expect(await page.evaluate(() => (window as typeof window & {
    __reducedProjectMotionContract?: unknown;
  }).__reducedProjectMotionContract)).toEqual({ delay: 0, duration: 120, transforms: [] });
  await expect(page.locator("[data-page-motion-intro]").first()).toHaveCSS("transform", "none");
});

test("same-page section links reveal the target row on Home and across routes", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  });
  await page.goto("/");

  const contact = page.locator("#contact");
  const contactRows = contact.locator("[data-page-motion-row]");
  await expect(contactRows.first()).toHaveCSS("opacity", "0");
  await page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Contact" })
    .click();
  await expect(contact).toHaveAttribute("data-page-motion-revealed", "true");
  const contactReveal = await contactRows.first().evaluate((element) => ({
    animating: element.getAnimations().some((animation) => animation.playState === "running"),
    opacity: Number.parseFloat(getComputedStyle(element).opacity),
  }));
  expect(contactReveal.animating).toBe(true);
  expect(contactReveal.opacity).toBeLessThan(1);

  await page.goto("/#projects");
  await page.locator('[data-slot="more-projects-link"]').click();
  await expect(page).toHaveURL(/\/projects$/);
  await page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Contact" })
    .click();
  await expect(page).toHaveURL(/\/#contact$/);
  await expect(contact).toHaveAttribute("data-page-motion-revealed", "true");
  await expect.poll(() => contactRows.first().evaluate((element) => element.getAnimations().length)).toBeGreaterThan(0);
  const routeContactReveal = await contactRows.first().evaluate((element) => ({
    animating: element.getAnimations().some((animation) => animation.playState === "running"),
    opacity: Number.parseFloat(getComputedStyle(element).opacity),
  }));
  expect(routeContactReveal.animating).toBe(true);
  expect(routeContactReveal.opacity).toBeLessThan(1);
});

test("Lenis smooths wheel input and settles at its requested distance", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/\blenis\b/);
  await expect(page.locator("html")).toHaveClass(/\blenis-autoToggle\b/);

  await page.mouse.wheel(0, 600);
  const earlyFrames = await page.evaluate(async () => {
    const positions: number[] = [];
    for (let frame = 0; frame < 4; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => {
        resolve();
      }));
      positions.push(window.scrollY);
    }
    return positions;
  });
  expect(earlyFrames.some((position) => position > 0 && position < 600)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(600, 0);
});

test("reduced motion makes same-page anchor travel immediate", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/\blenis\b/);
  await expect(page.locator("html")).not.toHaveAttribute("data-page-motion-pending", "true");

  const synchronousPosition = await page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Experience" })
    .evaluate((link) => {
      (link as HTMLAnchorElement).click();
      return window.scrollY;
    });
  expect(synchronousPosition).toBeGreaterThan(0);
  await expect(page.locator("#experience")).toHaveAttribute("data-page-motion-revealed", "true");
  await expect.poll(async () => {
    const header = await page.locator('[data-slot="site-header"]').boundingBox();
    const heading = await page.locator("#experience > div").first().boundingBox();
    if (!header || !heading) throw new Error("Reduced-motion anchor target must be measurable");
    return Math.abs(heading.y - header.y - header.height);
  }).toBeLessThanOrEqual(1);
});

test("Page motion fails open when hydration never starts", async ({ page }) => {
  await page.route("**/_next/static/**/*.js", (route) => route.abort());
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const root = page.locator("html");
  const targets = page.locator('[data-page-motion-intro], [data-page-motion-row], [data-page-motion-item], [data-page-motion-rows="children"] > *');
  await expect(root).toHaveAttribute("data-page-motion-pending", "true");
  expect(await targets.evaluateAll((elements) => elements.every((element) => {
    const target = element as HTMLElement;
    return target.style.opacity === "" && target.style.transform === "" && target.style.willChange === "";
  }))).toBe(true);
  await expect(root).not.toHaveAttribute("data-page-motion-pending", "true", { timeout: 5_200 });
  expect(await targets.evaluateAll((elements) => elements.every((element) => {
    const style = getComputedStyle(element);
    return style.opacity === "1" && style.transform === "none";
  }))).toBe(true);
});

test("same-document Page remount leaves one fresh animation owner", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  });
  await page.goto("/");
  const heroTargets = page.locator("[data-page-motion-intro]");
  await expect.poll(() => heroTargets.first().evaluate((target) => target.getAnimations().length)).toBeGreaterThan(0);

  await page.locator('[data-slot="more-projects-link"]').click();
  await expect(page).toHaveURL(/\/projects$/u);
  await page.locator('[data-slot="site-header"] a').filter({
    has: page.locator('[data-slot="brand-mark"]'),
  }).click();
  await expect(page).toHaveURL(/\/#top$/u);
  await expect.poll(() => heroTargets.evaluateAll((targets) => targets.every((target) =>
    target.getAnimations().filter((animation) => animation.playState === "running").length === 2,
  ))).toBe(true);
  await page.waitForTimeout(1_000);
  expect(await heroTargets.evaluateAll((targets) => targets.every((target) => {
    const element = target as HTMLElement;
    return element.style.opacity === "" && element.style.transform === "" && element.style.willChange === "";
  }))).toBe(true);
});

test("splash fails open when a readiness dependency fails", async ({ page }) => {
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-deprecated, @typescript-eslint/unbound-method -- The test intentionally patches this DOM prototype method.
    const querySelector = Document.prototype.querySelector;
    // eslint-disable-next-line @typescript-eslint/no-deprecated, @typescript-eslint/no-unnecessary-type-parameters -- Preserve the DOM method's generic return contract while patching it.
    Document.prototype.querySelector = function <ElementType extends Element = Element>(selector: string) {
      if (selector === "main#main") return null;
      return querySelector.call(this, selector) as ElementType | null;
    };
  });

  await page.goto("/");
  const splash = page.locator('[data-slot="opening-splash"]');
  await expect(splash).toHaveAttribute("data-state", "visible");
  const visibleAt = await page.evaluate(() => performance.now());
  await expect(splash).toHaveCount(0, { timeout: 4_500 });
  expect(await page.evaluate((startedAt) => performance.now() - startedAt, visibleAt)).toBeLessThanOrEqual(4_500);
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).not.toBeEmpty();
});

test("splash slides down and supports an indefinite debug flag", async ({ page }) => {
  await page.addInitScript(() => {
    const timingWindow = window as typeof window & { __splashVisibleAt?: number };
    const observer = new MutationObserver(() => {
      const splash = document.querySelector<HTMLElement>('[data-slot="opening-splash"]');
      if (splash?.dataset.state !== "visible") return;
      timingWindow.__splashVisibleAt = performance.now();
      observer.disconnect();
    });
    observer.observe(document, { attributes: true, childList: true, subtree: true });
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready: Promise.resolve(), status: "loading" },
    });
    // eslint-disable-next-line @typescript-eslint/no-deprecated, @typescript-eslint/unbound-method -- The test intentionally patches this DOM prototype method.
    const querySelector = Document.prototype.querySelector;
    // eslint-disable-next-line @typescript-eslint/no-deprecated, @typescript-eslint/no-unnecessary-type-parameters -- Preserve the DOM method's generic return contract while patching it.
    Document.prototype.querySelector = function <ElementType extends Element = Element>(selector: string) {
      if (["[data-theme-root]", "header", "#intro-heading"].includes(selector)) {
        return document.documentElement as unknown as ElementType;
      }
      return querySelector.call(this, selector) as ElementType | null;
    };
  });
  await page.goto("/");
  const splash = page.locator('[data-slot="opening-splash"]');
  await expect(splash).toHaveAttribute("data-state", "visible");
  const mark = splash.locator('[data-slot="brand-mark"]');
  const role = splash.locator("p");
  await expect(mark).toBeVisible();
  await expect(role).toBeVisible();
  await expect(role).not.toBeEmpty();
  await expect(splash).toHaveCSS("transition-duration", "0s");
  await expect(mark).toHaveAttribute("aria-hidden", "true");
  expect(Number.parseFloat(await mark.evaluate((element) => getComputedStyle(element).width)))
    .toBeGreaterThan(Number.parseFloat(await role.evaluate((element) => getComputedStyle(element).fontSize)) * 3);
  await expect(splash.locator("span")).toHaveCount(0);
  const visibleAt = await page.evaluate(() =>
    (window as typeof window & { __splashVisibleAt?: number }).__splashVisibleAt ?? performance.now());
  await expect(splash).toHaveAttribute("data-state", "exiting", { timeout: 2_000 });
  await expect(splash).toHaveCSS("opacity", "1");
  expect(await splash.evaluate((element) => element.getAnimations().some((animation) =>
    Number(animation.effect?.getTiming().duration) === 700
      && animation.effect instanceof KeyframeEffect
      && animation.effect.getKeyframes().some((frame) => frame.transform !== undefined),
  ))).toBe(true);
  await expect.poll(async () => (await splash.boundingBox())?.y ?? 0).toBeGreaterThan(0);
  const exitElapsed = await page.evaluate((startedAt) => performance.now() - startedAt, visibleAt);
  expect(exitElapsed).toBeGreaterThanOrEqual(1_700);
  expect(exitElapsed).toBeLessThanOrEqual(2_000);
  await expect(splash).toHaveCount(0, { timeout: 800 });
  expect(await page.evaluate((startedAt) => performance.now() - startedAt, visibleAt)).toBeLessThanOrEqual(2_800);

  await page.reload();
  await expect(splash).toHaveCount(0, { timeout: 500 });
  await page.goto("/projects");
  await expect(splash).toHaveCount(0, { timeout: 500 });
  await page.goto("/");
  await expect(page).toHaveURL("/");
  await expect(splash).toHaveCount(0, { timeout: 500 });

  await page.goto("/?debugSplash");
  await expect(splash).toBeVisible();
  await page.waitForTimeout(3_350);
  await expect(splash).toBeVisible();

  await page.goto("/?debugSplash=0");
  await page.waitForTimeout(3_350);
  await expect(splash).toBeVisible();

  await page.goto("/?foo=debugSplash");
  await expect(splash).toHaveCount(0, { timeout: 1_000 });
});

test("splash covers the first painted frames before hydration", async ({ page }) => {
  await page.addInitScript(() => {
    const probeWindow = window as typeof window & {
      __openingSplashFrames?: Array<{ opacity: string; visibility: string }>;
    };
    probeWindow.__openingSplashFrames = [];

    /** Captures the first rendered splash frames before hydration settles. */
    const inspect = () => {
      const splash = document.querySelector<HTMLElement>('[data-slot="opening-splash"]');
      const frames = probeWindow.__openingSplashFrames;
      if (splash && frames && frames.length < 4) {
        const style = getComputedStyle(splash);
        frames.push({ opacity: style.opacity, visibility: style.visibility });
      }
      if (!frames || frames.length < 4) requestAnimationFrame(inspect);
    };
    requestAnimationFrame(inspect);
  });

  await page.goto("/");
  const splash = page.locator('[data-slot="opening-splash"]');
  await expect(splash).toHaveAttribute("data-state", "visible");
  expect(await page.evaluate(() => sessionStorage.getItem("portfolio-opening-splash-seen"))).toBe("true");
  await expect.poll(() => page.evaluate(() =>
    (window as typeof window & { __openingSplashFrames?: unknown[] }).__openingSplashFrames?.length ?? 0,
  )).toBe(4);
  const frames = await page.evaluate(() =>
    (window as typeof window & {
      __openingSplashFrames?: Array<{ opacity: string; visibility: string }>;
    }).__openingSplashFrames ?? []);
  expect(frames).toHaveLength(4);
  expect(frames.every(({ opacity, visibility }) => opacity === "1" && visibility === "visible")).toBe(true);
});

test("splash waits for delayed readiness and fails open on stalled fonts", async ({ page }) => {
  type SplashRemovalTiming = { exitAt?: number; removedAt?: number };
  type SplashTimingWindow = typeof window & {
    markerReadinessStartedAt?: number;
    splashRemovalTiming?: SplashRemovalTiming;
  };

  await page.addInitScript(() => {
    let markerReady = false;
    let markerTimerStarted = false;
    const timingWindow = window as SplashTimingWindow;
    const splashRemovalTiming: SplashRemovalTiming = {};
    timingWindow.splashRemovalTiming = splashRemovalTiming;
    let observedSplash: Element | null = null;
    const observer = new MutationObserver(() => {
      const splash = document.querySelector('[data-slot="opening-splash"]');
      if (splash) observedSplash = splash;
      if (splash?.getAttribute("data-state") === "exiting" && splashRemovalTiming.exitAt === undefined) {
        splashRemovalTiming.exitAt = performance.now();
      }
      if (observedSplash && !observedSplash.isConnected && splashRemovalTiming.removedAt === undefined) {
        splashRemovalTiming.removedAt = performance.now();
        observer.disconnect();
      }
    });
    observer.observe(document, {
      attributes: true,
      attributeFilter: ["data-state"],
      childList: true,
      subtree: true,
    });
    // eslint-disable-next-line @typescript-eslint/no-deprecated, @typescript-eslint/unbound-method -- The test intentionally patches this DOM prototype method.
    const querySelector = Document.prototype.querySelector;
    // eslint-disable-next-line @typescript-eslint/no-deprecated, @typescript-eslint/no-unnecessary-type-parameters -- Preserve the DOM method's generic return contract while patching it.
    Document.prototype.querySelector = function <ElementType extends Element = Element>(selector: string) {
      if (selector === "main#main" && !markerReady) {
        if (!markerTimerStarted) {
          markerTimerStarted = true;
          timingWindow.markerReadinessStartedAt = performance.now();
          window.setTimeout(() => {
            markerReady = true;
            document.documentElement.appendChild(document.createComment("readiness-marker"));
          }, 2_100);
        }
        return null;
      }
      return querySelector.call(this, selector) as ElementType | null;
    };
  });
  await page.goto("/");
  const splash = page.locator('[data-slot="opening-splash"]');
  await expect(splash).toHaveAttribute("data-state", "visible");
  const delayedVisibleAt = await page.evaluate(() =>
    (window as SplashTimingWindow).markerReadinessStartedAt ?? performance.now());
  await page.waitForTimeout(1_800);
  await expect(splash).toHaveAttribute("data-state", "visible");
  await expect(splash).toHaveAttribute("data-state", "exiting", { timeout: 500 });
  const delayedExitElapsed = await page.evaluate((startedAt) => performance.now() - startedAt, delayedVisibleAt);
  expect(delayedExitElapsed).toBeGreaterThanOrEqual(2_000);
  expect(delayedExitElapsed).toBeLessThanOrEqual(2_300);
  await expect(splash).toHaveCount(0, { timeout: 1_500 });
  const splashRemovalTiming = await page.evaluate(() =>
    (window as SplashTimingWindow).splashRemovalTiming);
  const exitAt = splashRemovalTiming?.exitAt;
  const removedAt = splashRemovalTiming?.removedAt;
  expect(exitAt).toBeDefined();
  expect(removedAt).toBeDefined();
  if (exitAt === undefined || removedAt === undefined) {
    throw new Error("Splash observer did not record both exit and removal timestamps");
  }
  expect(removedAt - exitAt).toBeLessThanOrEqual(800);

  await page.evaluate(() => {
    sessionStorage.removeItem("portfolio-opening-splash-seen");
  });
  await page.addInitScript(() => {
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready: new Promise(() => {}), status: "loading" },
    });
  });
  await page.goto("/");
  await expect(splash).toHaveAttribute("data-state", "visible");
  const stalledVisibleAt = await page.evaluate(() => performance.now());
  await expect(splash).toHaveCount(0, { timeout: 4_500 });
  expect(await page.evaluate((startedAt) => performance.now() - startedAt, stalledVisibleAt)).toBeLessThanOrEqual(4_500);
});

test("reduced motion disables the splash and availability translation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready: new Promise(() => {}), status: "loading" },
    });
  });

  await page.goto("/");
  const splash = page.locator('[data-slot="opening-splash"]');
  await expect(splash).toBeVisible();
  await expect(splash).toHaveCSS("transform", "none");
  await expect(splash.locator("p")).not.toBeEmpty();
  await expect(page.locator('[data-slot="availability-dot"]')).toHaveCSS("animation-name", "none");
  const primaryAction = page.getByRole("link", { name: "Download Résumé" });
  await primaryAction.hover();
  await expect(primaryAction.locator("svg")).toHaveCSS("translate", "none");
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("hydration-dependent controls stay disabled without JavaScript", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('[data-slot="theme-toggle"]')).toBeDisabled();
    await expect(page.locator("#contact").getByRole("button", { name: "Send message" })).toBeDisabled();
  });

  test("Page motion targets remain visible without JavaScript", async ({ page }) => {
    await page.goto("/");
    const targets = page.locator('[data-page-motion-intro], [data-page-motion-row], [data-page-motion-item], [data-page-motion-rows="children"] > *');
    expect(await targets.count()).toBeGreaterThan(0);
    expect(await targets.evaluateAll((elements) => elements.every((element) => {
      const style = getComputedStyle(element);
      return style.opacity === "1" && style.transform === "none";
    }))).toBe(true);
  });

  for (const route of [
    { label: "project list", path: "/projects" },
    { label: "article list", path: "/articles" },
  ]) {
    test(`the ${route.label} motion targets remain visible without JavaScript`, async ({ page }) => {
      await page.goto(route.path);
      const targets = page.locator('[data-page-motion-intro], [data-page-motion-row], [data-page-motion-item], [data-page-motion-rows="children"] > *');
      expect(await targets.count()).toBeGreaterThanOrEqual(1);
      expect(await targets.evaluateAll((elements) => elements.every((element) => {
        const style = getComputedStyle(element);
        return style.opacity === "1" && style.transform === "none";
      }))).toBe(true);
    });
  }

  for (const width of [390, 768, 1024, 1279, 1280]) {
    test(`the header exposes its navigation contract at ${String(width)}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/");
      await expect(page.getByRole("navigation", {
        name: "Compact navigation",
        includeHidden: true,
      })).toHaveCount(1);
      expect(await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link").evaluateAll((links) =>
        links.map((link) => link.getAttribute("href")),
      )).toEqual(width >= 1280 ? ["/#top", "/#about", "/#experience", "/#education", "/#skills", "/#projects", "/#code", "/#writing", "/#contact"] : ["/#top"]);
      await expect(page.locator('[data-slot="opening-splash"]')).toHaveCSS("visibility", "hidden");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("contentinfo")).toBeVisible();
      await expect(page.locator("#experience")).toHaveCount(1);
      await expect(page.locator("#education")).toHaveCount(1);
      await expect(page.locator("#skills")).toHaveCount(1);
      await expect(page.locator("#projects")).toHaveCount(1);
    });
  }

  test("the server-rendered splash never paints at 1440px", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator('[data-slot="opening-splash"]')).toHaveCSS("visibility", "hidden");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
  });

  test.describe("with a dark system preference", () => {
    test.use({ colorScheme: "dark" });

    test("the no-JavaScript page uses dark tokens without painting the splash", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/");
      await expect(page.locator('[data-slot="opening-splash"]')).toHaveCSS("visibility", "hidden");
      const systemBackground = await page.locator("html").evaluate((element) =>
        getComputedStyle(element).getPropertyValue("--background").trim()
      );
      const explicitBackground = await page.locator("html").evaluate((element) => {
        element.classList.add("dark");
        return getComputedStyle(element).getPropertyValue("--background").trim();
      });
      expect(systemBackground).toBe(explicitBackground);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("contentinfo")).toBeVisible();
    });
  });

  test("the compact disclosure navigates to About without JavaScript", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const compactNavigation = page.getByRole("navigation", {
      name: "Compact navigation",
      includeHidden: true,
    });
    const disclosure = page.locator("details").filter({ has: compactNavigation });
    await disclosure.locator("summary").click();
    await expect(compactNavigation.getByRole("link")).toHaveText(["About", "Experience", "Education", "Skills", "Projects", "Code", "Writing", "Contact"]);
    await compactNavigation.getByRole("link", { name: "About" }).click();
    await expect(page).toHaveURL(/#about$/);
    const headingBox = await page.getByRole("heading", { level: 2, name: "About" }).boundingBox();
    const headerBox = await page.locator('[data-slot="site-header"]').boundingBox();
    if (!headingBox || !headerBox) throw new Error("About heading must be measurable without JavaScript");
    expect(Math.abs(headingBox.y - headerBox.y - headerBox.height)).toBeLessThanOrEqual(1);
  });
});
