import { expect, test } from "@playwright/test";

const futureSectionIds = ["education", "skills", "projects", "code", "writing", "contact"];

test("desktop navigation and header match the corrected design contract", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  const header = page.getByRole("banner");
  const navigation = page.getByRole("navigation", { name: "Primary navigation" });

  await expect(header).toHaveCSS("height", "76px");
  await expect(header).toHaveCSS("border-bottom-width", "0px");
  await expect(header).toHaveCSS("background-image", /linear-gradient/);
  expect(await navigation.getByRole("link").evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")),
  )).toEqual(["#top", "#about", "#experience"]);
  await expect(page.getByRole("button", { name: "Jump to section" })).toHaveCount(0);

  const homeBox = await page.getByRole("link", { name: "Back to top" }).boundingBox();
  const themeBox = await page.locator('[data-slot="theme-toggle"]').boundingBox();
  if (!homeBox || !themeBox) throw new Error("Header controls must be measurable");
  expect(homeBox).toMatchObject({ x: 200, width: 32, height: 32 });
  expect(themeBox).toMatchObject({ x: 792, width: 32, height: 32 });
});

test("compact header and intro remain aligned without wrapping on narrow phones", async ({ page }) => {
  for (const width of [344, 360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");

    const homeBox = await page.getByRole("link", { name: "Back to top" }).boundingBox();
    const themeBox = await page.locator('[data-slot="theme-toggle"]').boundingBox();
    if (!homeBox || !themeBox) throw new Error("Header controls must be measurable");
    expect(homeBox.x).toBe(18);
    expect(homeBox.width).toBe(44);
    expect(themeBox.x + themeBox.width).toBe(width - 18);
    expect(themeBox.width).toBe(44);
    await expect(page.getByRole("button", { name: "Jump to section" })).toHaveCount(0);

    expect(await page.locator("#intro-heading > span").evaluateAll((spans) =>
      spans.every((span) => span.scrollWidth <= span.clientWidth && getComputedStyle(span).whiteSpace === "nowrap"),
    )).toBe(true);
  }
});

test("compact selector opens as a content-height blurred header extension", async ({ page }) => {
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
    await page.evaluate(() => {
      window.scrollTo(0, 320);
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
    await expect(close).toBeFocused();
    const accessibleTitle = dialog.getByText("Jump to section", { exact: true });
    await expect(accessibleTitle).toHaveCSS("position", "absolute");
    await expect(accessibleTitle).toHaveCSS("overflow", "hidden");
    await expect(themeToggle).toHaveCSS("visibility", "hidden");
    const currentLink = dialog.getByRole("link", { name: "About" });
    await expect(currentLink).toHaveAttribute("aria-current", "location");

    const openBox = await dialog.boundingBox();
    const closeBox = await close.boundingBox();
    const headerBox = await page.locator("header").boundingBox();
    if (!openBox || !closeBox || !headerBox) {
      throw new Error("Compact navigation sheet, close control, and header must be measurable");
    }
    expect(openBox.x).toBeCloseTo(0, 1);
    expect(openBox.y).toBeCloseTo(headerBox.height, 1);
    expect(openBox.width).toBeCloseTo(viewport.width, 1);
    expect(openBox.height).toBeLessThan(200);
    expect(closeBox).toEqual(themeBox);
    await expect(dialog).toHaveCSS("box-shadow", "none");
    const surfaceBackground = await dialog.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(surfaceBackground).toBe(
      await page.locator("header").evaluate((element) => getComputedStyle(element).backgroundColor),
    );
    expect(surfaceBackground).toBe(
      await page.locator("body").evaluate((element) => getComputedStyle(element).backgroundColor),
    );
    await expect(page.locator("header")).toHaveCSS("background-image", "none");
    await expect(page.locator('[data-slot="mobile-navigation-backdrop"]')).toHaveCSS(
      "backdrop-filter",
      "blur(8px)",
    );
    await expect(currentLink).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    expect(await currentLink.evaluate((element) => getComputedStyle(element).fontSize)).toBe(closedFontSize);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(themeToggle).toHaveCSS("visibility", "visible");
    expect(await trigger.boundingBox()).toEqual(closedBox);
  }

  expect(baseUiErrors).toEqual([]);
});

for (const path of ["/", "/articles/building-an-llm-evaluation-harness"]) {
  test(`the skip link focuses the main content on ${path}`, async ({ page, browserName }) => {
    await page.goto(path);
    await page.keyboard.press(browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab");
    const skipLink = page.getByRole("link", { name: "Skip to content" });
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("main#main")).toBeFocused();
  });
}

test("the home page contains the approved hero, About, and Phase 3 Experience sections", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByText("Open to work", { exact: false })).toBeVisible();
  await expect(page.getByText("remote or relocation", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hi, I’m Nikita Reshetnik.Shipping Agents at scale.");
  await expect(page.getByRole("link", { name: "Download Résumé" })).toHaveAttribute(
    "href",
    "https://github.com/grafanaKibana/LatexCV/releases/latest/download/resume.pdf",
  );
  await expect(page.getByRole("link", { name: "Explore Experience" })).toHaveAttribute("href", "#experience");
  const primaryAction = page.getByRole("link", { name: "Download Résumé" });
  const secondaryAction = page.getByRole("link", { name: "Explore Experience" });
  const primaryBox = await primaryAction.boundingBox();
  const secondaryBox = await secondaryAction.boundingBox();
  if (!primaryBox || !secondaryBox) throw new Error("Hero actions must be measurable");
  expect(primaryBox).toMatchObject({ x: 22, width: 346, height: 46 });
  expect(secondaryBox.y - primaryBox.y - primaryBox.height).toBe(6);
  expect(["lab(0 0 0)", "oklch(0 0 0)"]).toContain(
    await primaryAction.evaluate((element) => getComputedStyle(element).backgroundColor),
  );
  await primaryAction.hover();
  await expect(primaryAction).toHaveCSS("transition-duration", "0s");
  await expect(primaryAction.locator("svg")).toHaveCSS("transform", "none");
  await expect(primaryAction.locator("svg")).toHaveCSS("transition-duration", "0s");
  await secondaryAction.hover();
  await expect(secondaryAction.locator("svg")).not.toHaveCSS("translate", "none");
  const socialBoxes = [];
  for (const label of ["LinkedIn", "Telegram", "GitHub", "LeetCode"]) {
    const link = page.getByRole("link", { name: label, exact: true });
    await expect(link).toBeVisible();
    await expect(link.locator("svg")).toHaveCount(1);
    socialBoxes.push(await link.boundingBox());
  }
  if (socialBoxes.some((box) => box === null)) throw new Error("Social links must be measurable");
  expect(socialBoxes[0]?.y).toBe(socialBoxes[1]?.y);
  expect(socialBoxes[2]?.y).toBe(socialBoxes[3]?.y);
  expect(socialBoxes[2]?.y).toBeGreaterThan(socialBoxes[0]?.y ?? 0);
  await expect(page.getByRole("contentinfo")).toContainText(
    `© ${String(new Date().getFullYear())} Nikita Reshetnik. All rights reserved. · Local Time:`,
  );
  await expect(page.getByRole("contentinfo").locator("time")).toHaveText(/^\d{2}:\d{2} \(.+\)$/);
  const footerPadding = await page.getByRole("contentinfo").evaluate((footer) => {
    const style = getComputedStyle(footer);
    return [style.paddingTop, style.paddingBottom];
  });
  expect(footerPadding).toEqual(["28px", "28px"]);
  const about = page.locator("#about");
  await expect(about).toHaveCSS("scroll-margin-top", "4px");
  await expect(about.getByRole("heading", { level: 2, name: "About" })).toHaveCount(1);
  await expect(about.getByRole("heading", { level: 3 })).toHaveText([
    "AI Engineering",
    "Software Engineering",
  ]);
  await expect(about.locator("p")).toHaveCount(7);
  await expect(about.getByText("2024—Present · 2 roles", { exact: true })).toBeVisible();
  await expect(about.getByText("2021—2024 · 5 roles", { exact: true })).toBeVisible();
  await expect(about.locator("dt")).toHaveText(["Current role", "Education", "Languages", "Based in"]);
  await expect(about.locator("dd")).toHaveText([
    "Senior AI Engineer",
    "Bachelor of Software Engineering",
    "English, Ukrainian, Russian",
    "Europe",
  ]);
  const experience = page.locator("#experience");
  await expect(experience.getByRole("heading", { level: 2, name: "Experience" })).toHaveCount(1);
  await expect(experience.getByText("7 roles · 2021—Present", { exact: true })).toBeVisible();
  await expect(experience.getByRole("heading", { level: 3 })).toHaveText([
    "Senior AI Engineer",
    "AI Engineer",
    "Software Engineer",
    "Junior Software Engineer",
    "Trainee Software Engineer",
    "Software Engineer Intern",
    "Software Engineer Intern",
  ]);
  await expect(experience.locator("article")).toHaveCount(7);
  await expect(experience.locator('[data-slot="company-logo"] img')).toHaveCount(7);
  for (const id of futureSectionIds) {
    await expect(page.locator(`#${id}`)).toHaveCount(0);
  }
});

test("Experience keeps the date rail, compact reading order, and native disclosure", async ({ page }) => {
  const experience = page.locator("#experience");

  for (const width of [344, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/#experience");
    await expect(experience).toHaveCSS("scroll-margin-top", "4px");
    expect(await experience.evaluate((section) => section.scrollWidth <= section.clientWidth)).toBe(true);
    const compactPeriod = await experience.locator("li").first().locator("p").first().boundingBox();
    const compactDot = await experience.locator('[data-slot="timeline-dot"]').first().boundingBox();
    const compactRole = await experience.getByRole("heading", { level: 3 }).first().boundingBox();
    const compactLogo = await experience.locator('[data-slot="company-logo"]').first().boundingBox();
    const compactRoleHeading = await experience.locator('[data-slot="role-heading"]').first().boundingBox();
    const compactEleksLogo = experience.locator('[data-slot="company-logo"]').nth(1);
    const compactEleksImage = await compactEleksLogo.locator("img").boundingBox();
    if (!compactPeriod || !compactDot || !compactRole || !compactLogo || !compactRoleHeading || !compactEleksImage) {
      throw new Error("Compact experience content must be measurable");
    }
    expect(compactPeriod.y).toBeLessThan(compactRole.y);
    expect(Math.abs(compactPeriod.y + compactPeriod.height / 2 - compactDot.y - compactDot.height / 2)).toBeLessThanOrEqual(1);
    const compactRailCenter = await experience.locator("ol").evaluate((timeline) => {
      const rail = getComputedStyle(timeline, "::before");
      return timeline.getBoundingClientRect().x + Number.parseFloat(rail.left) + Number.parseFloat(rail.width) / 2;
    });
    expect(Math.abs(compactDot.x + compactDot.width / 2 - compactRailCenter)).toBeLessThanOrEqual(0.01);
    expect(compactLogo.height).toBe(32);
    expect(Math.abs(compactLogo.y + compactLogo.height / 2 - compactRoleHeading.y - compactRoleHeading.height / 2)).toBeLessThanOrEqual(1);
    expect(compactEleksImage.width).toBe(30);
    expect(compactEleksImage.height).toBe(30);
    await expect(compactEleksLogo).toHaveCSS("overflow", "hidden");
    const compactPeriodLayouts = await experience.locator('[data-slot="experience-period"]').evaluateAll((periods) =>
      periods.map((period) => {
        const separator = period.querySelector<HTMLElement>('[data-slot="period-separator"]');
        if (!separator) throw new Error("Experience period separator must exist");
        return {
          rowCount: new Set(
            Array.from(period.querySelectorAll<HTMLElement>('[data-slot="period-part"]')).map((part) =>
              Math.round(part.getBoundingClientRect().top),
            ),
          ).size,
          separatorDisplay: getComputedStyle(separator).display,
        };
      }),
    );
    expect(compactPeriodLayouts.every(({ rowCount, separatorDisplay }) =>
      rowCount === 1 && separatorDisplay !== "none"
    )).toBe(true);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#experience");
  const themedLogo = experience.locator('[data-slot="company-logo"]').first();
  const initialLogoBackground = await themedLogo.evaluate((logo) => getComputedStyle(logo).backgroundColor);
  expect(initialLogoBackground).toBe("rgb(255, 255, 255)");
  await page.getByRole("button", { name: /Switch to (?:dark|light) theme/ }).click();
  const toggledLogoBackground = await themedLogo.evaluate((logo) => getComputedStyle(logo).backgroundColor);
  expect(toggledLogoBackground).toBe(initialLogoBackground);
  const details = experience.locator("details");
  await expect(details).toHaveCount(1);
  const summary = details.locator("summary");
  await summary.focus();
  await expect(summary).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(details).toHaveAttribute("open", "");
  await expect(details.locator("li")).toHaveCount(3);
  await page.keyboard.press("Enter");
  await expect(details).not.toHaveAttribute("open", "");

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#experience");
  await expect(experience).toHaveCSS("scroll-margin-top", "-28px");
  const desktopItem = experience.locator("li").first();
  const desktopPeriod = await desktopItem.locator("p").first().boundingBox();
  const desktopDot = await desktopItem.locator('[data-slot="timeline-dot"]').boundingBox();
  const desktopBody = await desktopItem.locator("article").boundingBox();
  const desktopSummary = await desktopItem.locator("article > p").boundingBox();
  const desktopLogo = await desktopItem.locator('[data-slot="company-logo"]').boundingBox();
  const desktopRoleHeading = await desktopItem.locator('[data-slot="role-heading"]').boundingBox();
  if (!desktopPeriod || !desktopDot || !desktopBody || !desktopSummary || !desktopLogo || !desktopRoleHeading) {
    throw new Error("Desktop experience rail and role header must be measurable");
  }
  expect(desktopPeriod.x + desktopPeriod.width).toBeLessThanOrEqual(desktopBody.x);
  expect(Math.abs(desktopPeriod.y + desktopPeriod.height / 2 - desktopDot.y - desktopDot.height / 2)).toBeLessThanOrEqual(1);
  expect(Math.abs(desktopRoleHeading.y + desktopRoleHeading.height / 2 - desktopDot.y - desktopDot.height / 2)).toBeLessThanOrEqual(1);
  const desktopRailCenter = await experience.locator("ol").evaluate((timeline) => {
    const rail = getComputedStyle(timeline, "::before");
    return timeline.getBoundingClientRect().x + Number.parseFloat(rail.left) + Number.parseFloat(rail.width) / 2;
  });
  expect(Math.abs(desktopDot.x + desktopDot.width / 2 - desktopRailCenter)).toBeLessThanOrEqual(0.01);
  await expect(desktopItem.locator('[data-slot="experience-period"]')).toHaveCSS("padding-right", "32px");
  await expect(desktopItem.locator("article")).toHaveCSS("padding-left", "32px");
  const periodLayouts = await experience.locator('[data-slot="experience-period"]').evaluateAll((periods) =>
    periods.map((period) => {
      const lineHeight = Number.parseFloat(getComputedStyle(period).lineHeight);
      const parts = Array.from(period.querySelectorAll<HTMLElement>('[data-slot="period-part"]'));
      const boxes = parts.map((part) => part.getBoundingClientRect());

      return {
        partsStayOnOneLine: boxes.every((box) => box.height <= lineHeight + 1),
        rowCount: new Set(boxes.map((box) => Math.round(box.top))).size,
      };
    }),
  );
  expect(periodLayouts.every(({ partsStayOnOneLine, rowCount }) => partsStayOnOneLine && rowCount === 2)).toBe(true);
  expect(await experience.locator('[data-slot="period-separator"]').evaluateAll((separators) =>
    separators.every((separator) => getComputedStyle(separator).display === "none")
  )).toBe(true);
  const railStartDelta = await experience.locator("ol").evaluate((timeline) => {
    const railTop = timeline.getBoundingClientRect().top + Number.parseFloat(getComputedStyle(timeline, "::before").top);
    const firstDot = timeline.querySelector<HTMLElement>('[data-slot="timeline-dot"]')?.getBoundingClientRect();
    if (!firstDot) throw new Error("First timeline dot must be measurable");
    return Math.abs(railTop - firstDot.y - firstDot.height / 2);
  });
  expect(railStartDelta).toBeLessThanOrEqual(1);
  expect(desktopSummary.width).toBeGreaterThan(desktopBody.width * 0.9);
  expect(desktopLogo.height).toBe(32);
  expect(Math.abs(desktopLogo.y + desktopLogo.height / 2 - desktopRoleHeading.y - desktopRoleHeading.height / 2)).toBeLessThanOrEqual(1);
  const desktopDetails = experience.locator("details");
  await desktopDetails.locator("summary").click();
  const desktopHighlights = await desktopDetails.locator("ul").boundingBox();
  const desktopDetailsBody = await desktopDetails.locator("..").boundingBox();
  if (!desktopHighlights || !desktopDetailsBody) throw new Error("Desktop highlights must be measurable");
  expect(desktopHighlights.width).toBeGreaterThan(desktopDetailsBody.width * 0.9);
  expect(await experience.evaluate((section) => section.scrollWidth <= section.clientWidth)).toBe(true);
});

test("Experience is reachable through desktop and compact navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Experience" })
    .click();
  await expect(page).toHaveURL(/#experience$/);
  const desktopHeader = await page.locator('[data-slot="site-header"]').boundingBox();
  const desktopHeading = await page.locator("#experience > div").first().boundingBox();
  if (!desktopHeader || !desktopHeading) throw new Error("Desktop Experience heading must be measurable");
  expect(Math.abs(desktopHeading.y - desktopHeader.y - desktopHeader.height)).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => {
    window.scrollTo(0, 320);
  });
  await page.getByRole("button", { name: "Jump to section" }).click();
  await page.getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "Experience" })
    .click();
  await expect(page).toHaveURL(/#experience$/);
  const compactHeader = await page.locator('[data-slot="site-header"]').boundingBox();
  const compactHeading = await page.locator("#experience > div").first().boundingBox();
  if (!compactHeader || !compactHeading) throw new Error("Compact Experience heading must be measurable");
  expect(Math.abs(compactHeading.y - compactHeader.y - compactHeader.height)).toBeLessThanOrEqual(1);
});

test("About clears the sticky header through direct, desktop, and modal navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/#about");
  const desktopHeading = page.getByRole("heading", { level: 2, name: "About" });
  await expect(page.locator("#about")).toHaveCSS("scroll-margin-top", "-28px");
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
  const facts = page.locator("#about dl");
  const factBoxes = await facts.locator(":scope > div").evaluateAll((items) =>
    items.map((item) => {
      const box = item.getBoundingClientRect();
      return { top: box.top, width: box.width };
    }),
  );
  expect(new Set(factBoxes.map(({ top }) => top)).size).toBe(1);
  expect(factBoxes[3]?.width).toBeLessThan(factBoxes[1]?.width ?? 0);
  await expect(facts).toHaveCSS("justify-content", "space-around");
  expect(await facts.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "About" })
    .click();
  await expect(page).toHaveURL(/#about$/);
  const desktopClickBox = await desktopHeading.boundingBox();
  const desktopClickHeader = await page.locator('[data-slot="site-header"]').boundingBox();
  if (!desktopClickBox || !desktopClickHeader) throw new Error("About heading must be measurable after desktop navigation");
  expect(Math.abs(desktopClickBox.y - desktopClickHeader.y - desktopClickHeader.height)).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
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
  const mobileBox = await page.getByRole("heading", { level: 2, name: "About" }).boundingBox();
  const mobileHeader = await page.locator('[data-slot="site-header"]').boundingBox();
  if (!mobileBox || !mobileHeader) throw new Error("About heading must be measurable after modal navigation");
  expect(Math.abs(mobileBox.y - mobileHeader.y - mobileHeader.height)).toBeLessThanOrEqual(1);
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

test("descriptor follows the reference timing and reduced-motion animation", async ({ page }) => {
  await page.goto("/");
  const descriptor = page.locator('[data-slot="hero-descriptor"]');
  await expect(descriptor).toHaveText("AI Engineer");
  await expect(descriptor).toHaveAttribute("data-state", "entering");
  await expect(descriptor).toHaveCSS("animation-duration", "0.58s");
  await expect(descriptor).toHaveCSS("animation-timing-function", "cubic-bezier(0.22, 0.61, 0.36, 1)");
  await page.waitForFunction(() =>
    document.querySelector<HTMLElement>('[data-slot="hero-descriptor"]')?.dataset.state === "exiting",
  );
  const outgoingDescriptor = await descriptor.textContent();
  await expect(descriptor).toHaveCSS("animation-name", /descriptor-out/);
  await expect(descriptor).toHaveCount(1);
  await page.waitForFunction((outgoing) => {
    const current = document.querySelector<HTMLElement>('[data-slot="hero-descriptor"]');
    return current?.dataset.state === "entering" && current.textContent !== outgoing;
  }, outgoingDescriptor);
  await expect(descriptor).toHaveAttribute("data-state", "entering");
  await page.waitForFunction(() => {
    const outgoing = document.querySelector<HTMLElement>('[data-slot="hero-descriptor"][data-state="exiting"]');
    return outgoing?.getAnimations().some((animation) => animation.playState === "running");
  });
  await expect(descriptor).toHaveCount(1);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(descriptor).toHaveCSS("animation-duration", "0.5s");
  await expect(descriptor).toHaveCSS("animation-name", /descriptor-fade/);
});

test("splash fails open when a readiness dependency fails", async ({ page }) => {
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-deprecated, @typescript-eslint/unbound-method -- The test intentionally patches this DOM prototype method.
    const querySelector = Document.prototype.querySelector;
    // eslint-disable-next-line @typescript-eslint/no-deprecated, @typescript-eslint/no-unnecessary-type-parameters -- Preserve the DOM method's generic return contract while patching it.
    Document.prototype.querySelector = function <ElementType extends Element = Element>(selector: string) {
      if (selector === "#intro-heading") return null;
      return querySelector.call(this, selector) as ElementType | null;
    };
  });

  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hi, I’m Nikita Reshetnik.");
});

test("splash remains noticeable and supports an indefinite debug flag", async ({ page }) => {
  await page.goto("/");
  const splash = page.locator('[data-slot="opening-splash"]');
  await expect(splash).toBeVisible();
  await page.waitForTimeout(500);
  await expect(splash).toBeVisible();
  await expect(splash).toBeHidden({ timeout: 2_000 });

  await page.goto("/?debugSplash");
  await expect(splash).toBeVisible();
  await page.waitForTimeout(1_250);
  await expect(splash).toBeVisible();
});

test("reduced motion disables the splash and availability translation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready: new Promise(() => {}) },
    });
  });

  await page.goto("/");
  const splash = page.locator("[aria-hidden=true]").filter({ hasText: "Nikita Reshetnik" });
  await expect(splash).toBeVisible();
  await expect(splash.locator("span")).toHaveCSS("animation-name", "none");
  await expect(page.locator('[data-slot="availability-dot"]')).toHaveCSS("animation-name", "none");
  const primaryAction = page.getByRole("link", { name: "Download Résumé" });
  await primaryAction.hover();
  await expect(primaryAction.locator("svg")).toHaveCSS("translate", "none");
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  for (const width of [390, 768, 1024]) {
    test(`the Phase 3 header exposes only approved navigation at ${String(width)}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/");
      await expect(page.getByRole("navigation", {
        name: "Compact navigation",
        includeHidden: true,
      })).toHaveCount(1);
      expect(await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link").evaluateAll((links) =>
        links.map((link) => link.getAttribute("href")),
      )).toEqual(width >= 1024 ? ["#top", "#about", "#experience"] : ["#top"]);
      await expect(page.locator("#experience")).toHaveCount(1);
    });
  }

  test("the compact disclosure navigates to About without JavaScript", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const compactNavigation = page.getByRole("navigation", {
      name: "Compact navigation",
      includeHidden: true,
    });
    const disclosure = page.locator("details").filter({ has: compactNavigation });
    await disclosure.locator("summary").click();
    await expect(compactNavigation.getByRole("link")).toHaveText(["About", "Experience"]);
    await compactNavigation.getByRole("link", { name: "About" }).click();
    await expect(page).toHaveURL(/#about$/);
    const headingBox = await page.getByRole("heading", { level: 2, name: "About" }).boundingBox();
    const headerBox = await page.locator('[data-slot="site-header"]').boundingBox();
    if (!headingBox || !headerBox) throw new Error("About heading must be measurable without JavaScript");
    expect(Math.abs(headingBox.y - headerBox.y - headerBox.height)).toBeLessThanOrEqual(1);
  });
});
