import { expect, test, type Page } from "@playwright/test";

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
  const header = page.getByRole("banner");
  const navigation = page.getByRole("navigation", { name: "Primary navigation" });

  await expect(header).toHaveCSS("height", "76px");
  await expect(header).toHaveCSS("border-bottom-width", "0px");
  await expect(header).toHaveCSS("background-image", /linear-gradient/);
  await expect(page.locator("#about")).toHaveCSS("padding-left", "200px");
  expect(await navigation.getByRole("link").evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")),
  )).toEqual(["/#top", "/#about", "/#experience", "/#education", "/#skills", "/#projects", "/#code", "/#writing", "/#contact"]);
  await expect(page.getByRole("button", { name: "Jump to section" })).toHaveCount(0);

  const homeBox = await page.getByRole("link", { name: "Back to top" }).boundingBox();
  const themeBox = await page.locator('[data-slot="theme-toggle"]').boundingBox();
  if (!homeBox || !themeBox) throw new Error("Header controls must be measurable");
  expect(homeBox).toMatchObject({ x: 200, width: 32, height: 32 });
  expect(themeBox).toMatchObject({ x: 1048, width: 32, height: 32 });

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

    const header = page.getByRole("banner");
    const navigation = page.getByRole("navigation", { name: "Primary navigation" });
    const homeBox = await page.getByRole("link", { name: "Back to top" }).boundingBox();
    const themeBox = await page.locator('[data-slot="theme-toggle"]').boundingBox();
    if (!homeBox || !themeBox) throw new Error("Tablet header controls must be measurable");

    await expect(header).toHaveCSS("height", "60px");
    await expect(navigation).toHaveCSS("padding-left", "96px");
    await expect(page.locator("#about")).toHaveCSS("padding-left", "96px");
    expect(homeBox).toMatchObject({ x: 96, width: 44, height: 44 });
    expect(themeBox).toMatchObject({ x: width - 140, width: 44, height: 44 });
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

test("Home reflows at 200 percent zoom equivalents", async ({ page }) => {
  for (const width of [195, 384, 512, 720]) {
    await page.setViewportSize({ width, height: 450 });
    await page.goto("/");
    await expect(page.locator('[data-slot="opening-splash"]')).toHaveCount(0, { timeout: 5_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (width === 195) {
      expect(await page.locator('[data-slot="experience-period"]').evaluateAll((periods) => periods.every((period) => {
        const parts = Array.from(period.querySelectorAll<HTMLElement>('[data-slot="period-part"]'));
        const separator = period.querySelector<HTMLElement>('[data-slot="period-separator"]');
        return new Set(parts.map((part) => Math.round(part.getBoundingClientRect().top))).size === 2
          && separator !== null
          && getComputedStyle(separator).display === "none";
      }))).toBe(true);
    }
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
    expect(openBox.height).toBeLessThan(viewport.height / 2);
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

test("the home page contains approved content through Phase 9 Contact", async ({ page }) => {
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
  await waitForAnimationsToSettle(page, "[data-page-motion-intro]");
  const primaryAction = page.getByRole("link", { name: "Download Résumé" });
  const secondaryAction = page.getByRole("link", { name: "Explore Experience" });
  const primaryBox = await primaryAction.boundingBox();
  const secondaryBox = await secondaryAction.boundingBox();
  if (!primaryBox || !secondaryBox) throw new Error("Hero actions must be measurable");
  expect(primaryBox).toMatchObject({ x: 22, width: 346, height: 48 });
  expect(secondaryBox.height).toBe(48);
  expect(secondaryBox.y - primaryBox.y - primaryBox.height).toBe(6);
  expect(["lab(0 0 0)", "oklch(0 0 0)"]).toContain(
    await primaryAction.evaluate((element) => getComputedStyle(element).backgroundColor),
  );
  await primaryAction.hover();
  await expect(primaryAction).toHaveCSS("transition-duration", "0.15s");
  await expect(primaryAction).toHaveCSS("transition-property", "opacity");
  await expect(primaryAction.locator("svg")).toHaveCSS("transform", "none");
  await expect(primaryAction.locator("svg")).toHaveCSS("transition-duration", "0s");
  await secondaryAction.hover();
  await expect(secondaryAction.locator("svg")).not.toHaveCSS("translate", "none");
  const hero = page.locator('section[aria-labelledby="intro-heading"]');
  const socialBoxes = [];
  for (const label of ["LinkedIn", "Telegram", "GitHub", "LeetCode"]) {
    const link = hero.getByRole("link", { name: label, exact: true });
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
  await expect(about.getByRole("heading", { level: 2, name: "About" })).toHaveText("About");
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
  const recommendations = experience.locator('[data-slot="experience-recommendations"]');
  await expect(recommendations.getByRole("heading", { level: 3, name: "Recommendations" })).toBeVisible();
  await expect(recommendations.locator("blockquote")).toHaveCount(3);
  await expect(recommendations.locator('[data-slot="recommendation-author"]')).toHaveText([
    "Khrystyna Velychko",
    "Yaroslav Zubets",
    "Antony Melnyk",
  ]);
  await expect(recommendations.locator('[data-slot="recommendation-position"]')).toHaveText([
    "Senior Project Manager | PMI Rising Leader ’24",
    "Software Engineer @ Meta",
    "Software Developer, Assistant Lecturer",
  ]);
  const recommendationTrack = recommendations.locator('[data-slot="recommendation-track"]');
  await expect(recommendationTrack).toHaveCSS("overflow-x", "auto");
  await expect(recommendationTrack).toHaveCSS("scrollbar-width", "none");
  expect(await recommendationTrack.evaluate((track) => track.scrollWidth > track.clientWidth)).toBe(true);
  const captionBottoms = await recommendations.locator("figcaption").evaluateAll((captions) =>
    captions.map((caption) => caption.getBoundingClientRect().bottom));
  expect(Math.max(...captionBottoms) - Math.min(...captionBottoms)).toBeLessThanOrEqual(1);
  expect(await recommendations.evaluate((section) => section.scrollWidth <= section.clientWidth)).toBe(true);
  await expect(experience.getByRole("heading", { level: 2, name: "Experience" })).toHaveText("Experience");
  await expect(experience.getByText("7 roles · 2021—Present", { exact: true })).toHaveCount(0);
  await expect(experience.locator("article").getByRole("heading", { level: 3 })).toHaveText([
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
  const education = page.locator("#education");
  await expect(education.getByRole("heading", { level: 2, name: "Education" })).toHaveText("Education");
  await expect(education.getByRole("heading", { level: 3 })).toHaveText([
    "University degree",
    "Industry certifications",
  ]);
  await expect(education.getByText("September 2019 — June 2023", { exact: true })).toHaveCount(0);
  await expect(education.getByText("Bachelor of Software Engineering", { exact: true })).toBeVisible();
  await expect(education.getByText("State University of Information and Communication Technologies", { exact: true })).toBeVisible();
  await expect(education.getByText("Kyiv, Ukraine", { exact: true })).toBeVisible();
  await expect(education.locator('[data-slot="certification"]')).toHaveText([
    "Azure AI FundamentalsAugust 2025",
    "GitHub CopilotJune 2025",
  ]);
  await expect(education.locator('[data-slot="certification-icon"] img')).toHaveCount(2);
  await expect(education.getByRole("heading", { level: 3, name: "Learning & training" })).toHaveCount(0);
  const azureCredential = education.getByRole("link", { name: "Azure AI Fundamentals" });
  await expect(azureCredential).toHaveAttribute(
    "href",
    "https://learn.microsoft.com/api/credentials/share/en-us/nikitareshetnik/F3083C3D360731B0?sharingId=8BF347D38A5CD134",
  );
  const azureIcon = azureCredential.locator('[data-slot="certification-icon"]');
  await expect(azureIcon).toHaveCount(1);
  const restingIconColors = await azureIcon.evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.backgroundColor, style.borderColor];
  });
  await azureCredential.hover();
  await expect(azureCredential.locator("img")).toHaveCSS("transform", "none");
  await expect(azureCredential.locator("img")).toHaveCSS("opacity", "1");
  await expect.poll(() => azureIcon.evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.backgroundColor, style.borderColor];
  })).not.toEqual(restingIconColors);
  await expect(education.getByRole("link", { name: "GitHub Copilot" })).toHaveAttribute(
    "href",
    "https://www.credly.com/badges/ba1ea295-7465-4edc-8ca1-faa90eee9ec1/public_url",
  );
  await page.evaluate(() => {
    localStorage.setItem("theme", "dark");
  });
  await page.reload();
  const darkAzureCredential = page.locator("#education").getByRole("link", { name: "Azure AI Fundamentals" });
  const darkAzureIcon = darkAzureCredential.locator('[data-slot="certification-icon"]');
  const darkRestingBorder = await darkAzureIcon.evaluate((element) => getComputedStyle(element).borderColor);
  await darkAzureCredential.hover();
  await expect(darkAzureIcon.locator("img")).toHaveCSS("opacity", "0.88");
  await expect(darkAzureIcon).toHaveCSS("border-color", darkRestingBorder);
  const projects = page.locator("#projects");
  await expect(projects.getByRole("heading", { level: 2, name: "Selected work" })).toBeVisible();
  await expect(projects.locator('[data-slot="home-project"]')).toHaveCount(3);
  await expect(projects.getByRole("heading", { level: 3 })).toHaveText([
    "DevBook",
    "Tabsdown",
    "web-portfolio-v1",
  ]);
  expect(await projects.getByRole("link", { name: "Read case study" }).evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")),
  )).toEqual([
    "/projects/devbook",
    "/projects/obsidian-tabsdown",
    "/projects/web-portfolio-v1",
  ]);
  await expect(projects.getByRole("link", { name: "See other work" })).toHaveAttribute("href", "/projects");
  await expect(projects.getByRole("link", { name: "Live" })).toHaveAttribute("href", "https://devbook.zip");
  await expect(projects.getByRole("link", { name: "Live demo" })).toHaveCount(0);
  await expect(projects.getByRole("heading", { level: 3, name: "Tabsdown" })
    .locator("xpath=ancestor::li").getByRole("link", { name: "Store page" })
    .locator('[data-slot="obsidian-icon"]')).toHaveCount(1);
  await expect(projects.getByRole("link", { name: "Source" }).first()).toHaveAttribute(
    "href",
    "https://github.com/grafanaKibana/devbook.zip",
  );
  await expect(projects.getByRole("list", { name: "DevBook technologies" }).getByRole("listitem")).toHaveText([
    "Obsidian",
    "Quartz",
    ".NET",
    "RAG",
    "Embeddings",
    "Vector search",
    "Retrieval evaluation",
  ]);
  const contact = page.locator("#contact");
  await expect(contact.getByText("Contact", { exact: true })).toBeVisible();
  await expect(contact.getByRole("heading", { level: 2, name: "Let's talk" })).toBeVisible();
  await expect(contact.getByRole("textbox", { name: "Name" })).toHaveAttribute("required", "");
  await expect(contact.getByRole("textbox", { name: "Email" })).toHaveAttribute("required", "");
  await expect(contact.getByRole("textbox", { name: "Message" })).toHaveAttribute("required", "");
  const linkedIn = contact.getByRole("link", { name: "LinkedIn", exact: true });
  expect(await linkedIn.locator("svg").first().locator("path").evaluate((path) => getComputedStyle(path).fill))
    .toBe(await linkedIn.evaluate((link) => getComputedStyle(link).color));
});

test("Experience keeps the date rail, compact reading order, and native disclosure", async ({ page }) => {
  const experience = page.locator("#experience");

  for (const width of [344, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/#experience");
    await expect(experience).toHaveAttribute("data-page-motion-revealed", "true");
    await waitForAnimationsToSettle(page, "#experience [data-page-motion-row]");
    await expect(experience).toHaveCSS("transform", "none");
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
    if (width < 768) {
      expect(compactPeriod.y).toBeLessThan(compactRole.y);
    } else {
      expect(Math.abs(compactRoleHeading.y + compactRoleHeading.height / 2 - compactDot.y - compactDot.height / 2)).toBeLessThanOrEqual(1);
    }
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
      width < 768
        ? rowCount === 1 && separatorDisplay !== "none"
        : rowCount === 2 && separatorDisplay === "none"
    )).toBe(true);
  }

  for (const width of [1024, 1279, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/#experience");
    await expect(experience).toHaveAttribute("data-page-motion-revealed", "true");
    await waitForAnimationsToSettle(page, "#experience [data-page-motion-row]");
    await expect(experience).toHaveCSS("transform", "none");
    expect(await experience.evaluate((section) => section.scrollWidth <= section.clientWidth)).toBe(true);
    const geometry = await experience.locator("ol").evaluate((timeline) => {
      const timelineBox = timeline.getBoundingClientRect();
      const rail = getComputedStyle(timeline, "::before");
      const railCenter = timelineBox.x + Number.parseFloat(rail.left) + Number.parseFloat(rail.width) / 2;
      const entries = Array.from(timeline.children).map((item) => {
        const dot = item.querySelector<HTMLElement>('[data-slot="timeline-dot"]')?.getBoundingClientRect();
        const period = item.querySelector<HTMLElement>('[data-slot="experience-period"]')?.getBoundingClientRect();
        const heading = item.querySelector<HTMLElement>('[data-slot="role-heading"]')?.getBoundingClientRect();
        const separator = item.querySelector<HTMLElement>('[data-slot="period-separator"]');
        const periodRows = new Set(
          Array.from(item.querySelectorAll<HTMLElement>('[data-slot="period-part"]')).map((part) =>
            Math.round(part.getBoundingClientRect().top),
          ),
        ).size;
        if (!dot || !period || !heading || !separator) throw new Error("Experience rail entries must be measurable");
        return {
          dotCenterX: dot.x + dot.width / 2,
          dotCenterY: dot.y + dot.height / 2,
          headingCenterY: heading.y + heading.height / 2,
          periodCenterY: period.y + period.height / 2,
          periodRows,
          separatorDisplay: getComputedStyle(separator).display,
        };
      });
      return {
        entries,
        railCenter,
        railLeft: Number.parseFloat(rail.left),
        railStart: timelineBox.y + Number.parseFloat(rail.top),
      };
    });
    expect(geometry.railLeft).toBe(width < 1280 ? 140 : 200);
    const firstEntry = geometry.entries[0];
    if (!firstEntry) throw new Error("Experience timeline must contain at least one entry");
    expect(Math.abs(geometry.railStart - firstEntry.dotCenterY)).toBeLessThanOrEqual(0.01);
    expect(geometry.entries.every((entry) =>
      Math.abs(entry.dotCenterX - geometry.railCenter) <= 0.01
      && Math.abs(entry.periodCenterY - entry.dotCenterY) <= 0.5
      && Math.abs(entry.headingCenterY - entry.dotCenterY) <= 0.5
      && entry.periodRows === 2
      && entry.separatorDisplay === "none"
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
  await expect(experience).toHaveAttribute("data-page-motion-revealed", "true");
  await waitForAnimationsToSettle(page, "#experience [data-page-motion-row]");
  await expect(experience).toHaveCSS("transform", "none");
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

test("Experience present marker grows subtly from a matching gradient rail", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#experience");
  const timeline = page.locator("#experience ol");
  const currentDot = timeline.locator('[data-slot="timeline-dot"]').first();
  const dotBackground = await currentDot.evaluate((dot) => getComputedStyle(dot).backgroundColor);
  const railBackground = await timeline.evaluate((element) => getComputedStyle(element, "::before").backgroundImage);

  expect(railBackground).toContain("linear-gradient");
  expect(railBackground).toContain(dotBackground);
  await expect(currentDot).toHaveCSS("animation-name", /timeline-current-dot/);
  await expect(currentDot).toHaveCSS("animation-duration", "2.4s");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(timeline.locator('[data-slot="timeline-dot"]').first()).toHaveCSS("animation-name", "none");
});

test("Experience disclosure uses native keyboard behavior and in-flow motion", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/#experience");
  const details = page.locator("#experience details");
  const summary = details.locator("summary");
  const content = details.locator('[data-slot="details-content"]');
  const icon = summary.locator("svg");

  expect(await details.evaluate((element) => getComputedStyle(element, "::details-content").transitionDuration))
    .toContain("0.2s");
  const closedNextTop = await details.evaluate((element) =>
    element.closest("li")?.nextElementSibling?.getBoundingClientRect().top,
  );
  await summary.focus();
  await page.keyboard.press("Space");
  await expect(details).toHaveAttribute("open", "");
  await page.waitForTimeout(100);
  const openingNextTop = await details.evaluate((element) =>
    element.closest("li")?.nextElementSibling?.getBoundingClientRect().top,
  );
  await page.waitForTimeout(140);
  const openNextTop = await details.evaluate((element) =>
    element.closest("li")?.nextElementSibling?.getBoundingClientRect().top,
  );
  if (closedNextTop === undefined || openingNextTop === undefined || openNextTop === undefined) {
    throw new Error("Following Experience entry must be measurable");
  }
  expect(openingNextTop).toBeGreaterThan(closedNextTop);
  expect(openingNextTop).toBeLessThanOrEqual(openNextTop);
  await expect(content).toHaveCSS("visibility", "visible");
  await expect(icon).not.toHaveCSS("transform", "none");

  await page.keyboard.press("Space");
  await page.waitForTimeout(40);
  await page.keyboard.press("Space");
  await page.waitForTimeout(40);
  await page.keyboard.press("Space");
  await page.waitForTimeout(40);
  await page.keyboard.press("Space");
  await expect(details).toHaveAttribute("open", "");
  await page.waitForTimeout(240);
  await expect(content).toHaveCSS("visibility", "visible");
  await expect(icon).not.toHaveCSS("transform", "none");
  expect(await details.evaluate((element) =>
    element.closest("li")?.nextElementSibling?.getBoundingClientRect().top,
  )).toBeCloseTo(openNextTop, 0);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(details).not.toHaveAttribute("open", "");
  expect(await details.evaluate((element) => getComputedStyle(element, "::details-content").transitionDuration))
    .toBe("0s");
  await summary.focus();
  await page.keyboard.press("Space");
  await expect(details).toHaveAttribute("open", "");
  await expect(content).toHaveCSS("visibility", "visible");
  await expect(icon).toHaveCSS("transition-duration", "0s");
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
  await expect(page.locator("#about")).toHaveCSS("scroll-margin-top", "-44px");
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
  await expect(facts).toHaveCSS("justify-content", "space-between");
  expect(await facts.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

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
  const desktopClickBox = await desktopHeading.boundingBox();
  const desktopClickHeader = await page.locator('[data-slot="site-header"]').boundingBox();
  if (!desktopClickBox || !desktopClickHeader) throw new Error("About heading must be measurable after desktop navigation");
  expect(Math.abs(desktopClickBox.y - desktopClickHeader.y - desktopClickHeader.height)).toBeLessThanOrEqual(1);

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

test("Education adapts its reference rows without overflow", async ({ page }) => {
  for (const width of [195, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/#education");
    const education = page.locator("#education");
    expect(await education.evaluate((section) => section.scrollWidth <= section.clientWidth)).toBe(true);

    if (width === 390 || width === 1440) {
      const rows = education.locator('[data-slot="education-row"]');
      await expect(rows).toHaveCount(2);
      for (const row of await rows.all()) {
        const label = await row.locator('[data-slot="education-row-label"]').boundingBox();
        const content = await row.locator('[data-slot="education-row-content"]').boundingBox();
        if (!label || !content) throw new Error("Education rows must be measurable");
        if (width === 390) expect(content.y).toBeGreaterThan(label.y + label.height);
        else expect(content.x).toBeGreaterThanOrEqual(label.x + label.width);
      }
    }
  }
});

test("Skills renders every validated item with one consistent icon slot", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#skills");
  const skills = page.locator("#skills");

  await expect(skills.getByRole("heading", { level: 2, name: "Skills" })).toHaveText("Skills");
  await expect(skills.getByRole("heading", { level: 3 })).toHaveText([
    "AI / Machine Learning",
    "Programming Languages",
    "Backend",
    "Data",
    "Cloud & DevOps",
    "Observability & CI/CD",
    "AI Development Tools",
  ]);
  expect(await skills.getByRole("heading", { level: 3 }).evaluateAll((headings) => headings.every((heading) => {
    const before = getComputedStyle(heading, "::before");
    const after = getComputedStyle(heading, "::after");
    return before.borderTopWidth === "1px"
      && after.borderTopWidth === "1px"
      && before.flexGrow === "1"
      && after.flexGrow === "1";
  }))).toBe(true);
  await expect(skills.locator('[data-slot="skill-label"]')).toHaveText([
    "Microsoft Agent Framework",
    "Semantic Kernel",
    "Microsoft.Extensions.AI",
    "Large Language Models",
    "LLM Evaluation",
    "Retrieval-Augmented Generation",
    "Azure AI Foundry",
    "Langfuse",
    "C#",
    "Python",
    "TypeScript",
    "SQL",
    ".NET",
    "ASP.NET Web API",
    "Entity Framework",
    "REST API",
    "Microsoft SQL Server",
    "PostgreSQL",
    "MongoDB",
    "Elasticsearch",
    "Kafka",
    "Microsoft Azure",
    "Amazon Web Services",
    "Vercel",
    "Docker",
    "Kubernetes",
    "Argo CD",
    "Jenkins",
    "Grafana",
    "Prometheus",
    "Kibana",
    "Azure DevOps",
    "GitHub Actions",
    "GitLab CI/CD",
    "Claude Code",
    "Claude Design",
    "Codex",
    "Pi",
    "OpenCode",
    "Cursor",
    "CodeRabbit",
    "GitHub Copilot",
  ]);
  await expect(skills.locator('[data-slot="skill-icon"]')).toHaveCount(42);
  await expect(skills.locator('[data-icon-kind="semantic-gradient"]')).toHaveCount(5);
  await expect(skills.locator('[data-icon-kind="dotnet"]')).toHaveCount(4);
  await expect(skills.locator('[data-icon-kind="gcp-api"]')).toHaveCount(1);
  await expect(skills.locator('[data-icon-kind="microsoft-agent-framework"]')).toHaveCount(1);
  await expect(skills.locator('[data-icon-kind="claude-code"]')).toHaveCount(1);
  await expect(skills.locator('[data-icon-kind="claude-design"]')).toHaveCount(1);
  await expect(skills.locator('[data-icon-kind="codex"]')).toHaveCount(1);
  await expect(skills.getByText("Semantic Kernel", { exact: true }).locator("..").locator(".lucide-sparkles")).toHaveCount(2);
  await expect(skills.getByText("Large Language Models", { exact: true })
    .locator("..").locator(".lucide-brain-circuit")).toHaveCount(2);
  await expect(skills.getByText("Retrieval-Augmented Generation", { exact: true })
    .locator("..").locator(".lucide-text-search")).toHaveCount(2);
  expect(await skills.locator('[data-icon-kind="semantic-gradient"]').evaluateAll((icons) =>
    icons.every((icon) => {
      const layers = icon.querySelectorAll("svg");
      return layers.length === 2 && getComputedStyle(layers.item(1)).maskImage !== "none";
    }),
  )).toBe(true);
  expect(await skills.locator('[data-icon-kind="dotnet"]').evaluateAll((icons) =>
    new Set(icons.map((icon) => getComputedStyle(icon).backgroundImage)).size,
  )).toBe(1);
  await expect(skills.getByText("Jenkins", { exact: true }).locator("..").locator("svg")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  expect(await skills.locator('[data-slot="skill-icon"]').evaluateAll((icons) =>
    icons.every((icon) =>
      icon.getBoundingClientRect().width === 20
      && icon.getBoundingClientRect().height === 20
      && icon.querySelector('svg, img, [data-icon-kind="dotnet"]') !== null),
  )).toBe(true);
});

test("Skills icons adapt their semantic or brand treatment to the selected theme", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#skills");

  /**
   * Reads the rendered color treatment for every Skills icon.
   *
   * @returns Computed color and filter pairs in content order.
   */
  const iconStyles = () => page.locator('#skills [data-slot="skill-icon"]').evaluateAll((icons) => icons.map((icon) => {
    const mark = icon.querySelector('svg, img, [data-icon-kind="dotnet"]');
    if (!mark) throw new Error("Every skill must render a visual mark");
    const style = getComputedStyle(mark);
    return `${style.color}|${style.filter}|${style.backgroundImage}`;
  }));

  await page.evaluate(() => {
    localStorage.setItem("theme", "light");
  });
  await page.reload();
  const lightStyles = await iconStyles();
  await page.evaluate(() => {
    localStorage.setItem("theme", "dark");
  });
  await page.reload();
  const darkStyles = await iconStyles();

  expect(darkStyles).toHaveLength(42);
  expect(darkStyles.every((style, index) => style !== lightStyles[index])).toBe(true);
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
    await expect(skills.locator('[data-slot="skill-group"]')).toHaveCount(7);
    await expect(skills.locator("ul").first()).toHaveCSS("flex-wrap", "wrap");

    if ([390, 768, 1280].includes(width)) {
      const heading = await skills.getByRole("heading", { level: 2, name: "Skills" }).boundingBox();
      const header = await page.locator('[data-slot="site-header"]').boundingBox();
      if (!heading || !header) throw new Error("Skills heading must be measurable");
      expect(Math.abs(heading.y - header.y - header.height)).toBeLessThanOrEqual(1);
    }
  }
});

test("Selected work reflows without overflow and clears the sticky header", async ({ page }) => {
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/#projects");
    const projects = page.locator("#projects");
    await expect(projects).toHaveAttribute("data-page-motion-revealed", "true");
    await waitForAnimationsToSettle(page, "#projects [data-page-motion-row]");
    await expect(projects).toHaveCSS("transform", "none");
    const project = projects.locator('[data-slot="home-project"]').first();

    expect(await projects.evaluate((section) => section.scrollWidth <= section.clientWidth)).toBe(true);
    await expect(project.locator("article")).toHaveCSS("display", width >= 1024 ? "grid" : "block");
    expect(await projects.getByRole("list", { name: "DevBook technologies" }).getByRole("listitem").first().evaluate((tag) =>
      getComputedStyle(tag, "::after").content,
    )).toBe(width >= 1024 ? "none" : '"·"');

    const heading = await projects.getByRole("heading", { level: 2, name: "Selected work" }).boundingBox();
    const header = await page.locator('[data-slot="site-header"]').boundingBox();
    if (!heading || !header) throw new Error("Selected work heading must be measurable");
    expect(Math.abs(heading.y - header.y - header.height)).toBeLessThanOrEqual(1);
  }

  const homeProjectActions = page.locator("#projects").locator('[data-slot="project-actions"]').first().locator("a");
  expect(new Set(await homeProjectActions.evaluateAll((actions) =>
    actions.map((action) => getComputedStyle(action).color))).size).toBe(1);
  const projectAction = page.locator("#projects").getByRole("link", { name: "Read case study" }).first();
  const restingActionColor = await projectAction.evaluate((element) => getComputedStyle(element).color);
  expect(restingActionColor).not.toBe(await page.locator("#projects").getByRole("heading", { level: 3 }).first().evaluate((element) =>
    getComputedStyle(element).color,
  ));
  await projectAction.hover();
  await expect.poll(() => projectAction.evaluate((element) => getComputedStyle(element).color))
    .toBe(await page.locator("#projects").getByRole("heading", { level: 3 }).first().evaluate((element) =>
      getComputedStyle(element).color,
    ));
  expect(await projectAction.evaluate((element) => getComputedStyle(element).color)).not.toBe(restingActionColor);
  await expect(projectAction.locator("svg")).toHaveCSS("transform", "none");
  await expect(projectAction.locator("svg")).toHaveCSS("translate", "none");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("#projects").getByRole("link", { name: "Read case study" }).first().locator("svg"))
    .toHaveCSS("transition-duration", "0s");
});

test("project rows keep the approved static and color-only hover treatments", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto("/projects");
  const indexRow = page.locator('[data-slot="project-row"]').first();
  const indexTitle = indexRow.getByRole("heading", { level: 2 });
  const indexDescription = indexRow.locator("p").first();
  const indexTitleStart = await indexTitle.boundingBox();
  await indexRow.hover();
  const indexTitleHover = await indexTitle.boundingBox();
  if (!indexTitleStart || !indexTitleHover) throw new Error("Project title must be measurable");
  expect(indexTitleHover.x).toBe(indexTitleStart.x);
  await expect.poll(async () => indexDescription.evaluate((element) => getComputedStyle(element).color))
    .toBe(await indexTitle.evaluate((element) => getComputedStyle(element).color));

  const indexRowBox = await indexRow.boundingBox();
  if (!indexRowBox) throw new Error("Project row must be measurable");
  await indexRow.click({ position: { x: indexRowBox.width - 8, y: indexRowBox.height - 8 } });
  await expect(page).toHaveURL(/\/projects\/devbook$/);

  await page.goto("/#projects");
  const homeRow = page.locator('[data-slot="home-project"]').first();
  const homeTitle = homeRow.getByRole("heading", { level: 3 });
  const homeDescription = homeRow.locator("p").first();
  const homeTitleStart = await homeTitle.boundingBox();
  const homeDescriptionStart = await homeDescription.evaluate((element) => getComputedStyle(element).color);
  await homeRow.hover();
  if (!homeTitleStart) throw new Error("Home project title must be measurable");
  expect((await homeTitle.boundingBox())?.x).toBe(homeTitleStart.x);
  expect(await homeDescription.evaluate((element) => getComputedStyle(element).color)).toBe(homeDescriptionStart);

  await page.goto("/projects/devbook");
  const projectActions = page.locator('[data-slot="project-actions"] a');
  const restingActionColors = await projectActions.evaluateAll((actions) =>
    actions.map((action) => getComputedStyle(action).color));
  expect(new Set(restingActionColors).size).toBe(1);
  await projectActions.first().hover();
  await expect.poll(() => projectActions.first().evaluate((element) => getComputedStyle(element).color))
    .not.toBe(restingActionColors[0]);
  await expect(projectActions.first().locator("svg")).toHaveCSS("transform", "none");
});

test("Code activity renders live GitHub data and fails open without empty UI", async ({ page }) => {
  for (const width of [390, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/#code");
    const code = page.locator("#code");

    await expect(code.getByRole("heading", { level: 2, name: "Code activity" })).toBeVisible();
    await expect(code.getByRole("link", { name: "github.com/grafanaKibana" })).toHaveAttribute(
      "href",
      "https://github.com/grafanaKibana",
    );

    const summary = code.locator('[data-slot="activity-summary"]');
    if (await summary.count()) {
      const merged = code.getByRole("list", { name: "Merged contributions" }).getByRole("link");
      const underReview = code.getByRole("list", { name: "Under review contributions" }).getByRole("link");
      await expect(summary).toHaveText(`${String(await merged.count())} merged · ${String(await underReview.count())} under review`);
      for (const href of await code.locator('[data-slot="pull-request-group"] a').evaluateAll((links) =>
        links.map((link) => link.getAttribute("href")),
      )) expect(href).toMatch(/^https:\/\/github\.com\/.+\/pull\/\d+$/);
    } else {
      await expect(code.locator('[data-slot="pull-request-group"]')).toHaveCount(0);
    }

    const graph = code.locator('[data-slot="activity-visualization"]');
    if (await graph.count()) {
      const dayCount = await graph.locator('[data-slot="contribution-day"]').count();
      expect(dayCount).toBeGreaterThanOrEqual(350);
      expect(dayCount).toBeLessThanOrEqual(371);
    }
    expect(await code.evaluate((section) => section.scrollWidth <= section.clientWidth)).toBe(true);
  }

  const firstPullRequest = page.locator('[data-slot="pull-request-row"]').first();
  const firstPullRequestSummary = firstPullRequest.locator('[data-slot="pull-request-summary"]');
  if (await firstPullRequestSummary.count()) {
    const title = firstPullRequest.locator('[data-slot="pull-request-title"]');
    const titleStart = await title.boundingBox();
    await firstPullRequest.hover();
    if (!titleStart) throw new Error("Pull-request title must be measurable");
    expect((await title.boundingBox())?.x).toBe(titleStart.x);
    await expect.poll(() => firstPullRequestSummary.evaluate((element) => getComputedStyle(element).color))
      .toBe(await title.evaluate((element) => getComputedStyle(element).color));
  }

  const contributionDay = page.locator('[data-slot="contribution-day"]').first();
  if (await contributionDay.count()) {
    await expect(contributionDay).toHaveAttribute(
      "title",
      /^(?:No contributions|\d+ contributions?) on \w+ \d{1,2}, \d{4}$/,
    );
    await contributionDay.hover();
    await expect(contributionDay).toHaveCSS("scale", "none");
    await expect(contributionDay).toHaveCSS("box-shadow", "none");
  }
});

test("Writing renders validated article metadata across responsive themes", async ({ page }) => {
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/#writing");
    const writing = page.locator("#writing");
    const article = writing.getByRole("link", {
      name: /Building an LLM Evaluation Harness with Microsoft\.Extensions\.AI/,
    });

    expect(await writing.locator('a[href^="/articles/"]').evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")),
    )).toEqual([
      "/articles/building-an-llm-evaluation-harness",
      "/articles/fixing-bugs-with-mcps",
      "/articles/microsoft-agent-framework-setup",
    ]);
    await expect(article).toHaveAttribute("href", "/articles/building-an-llm-evaluation-harness");
    await expect(article.getByText("March 16, 2026", { exact: true })).toBeVisible();
    await expect(article).toContainText("March 16, 2026 · 8 min read");
    await expect(article).toContainText("A dataset-driven NUnit evaluation harness");
    await expect(writing.locator('[data-slot="more-articles-link"]')).toHaveAttribute("href", "/articles");
    expect(await writing.evaluate((section) => section.scrollWidth <= section.clientWidth)).toBe(true);
  }

  await page.evaluate(() => {
    localStorage.setItem("theme", "dark");
  });
  await page.reload();
  await expect(page.locator("#writing")).toBeVisible();
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
  const restingBorder = await name.evaluate((input) => getComputedStyle(input).borderColor);

  await name.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(name).toBeFocused();
  await expect(name).toHaveCSS("box-shadow", "none");
  await expect(name).toHaveCSS("outline-style", "none");
  await expect(name).toHaveCSS("transition-duration", "0.15s");
  await expect.poll(() => name.evaluate((input) => {
    const style = getComputedStyle(input);
    return style.borderColor === style.color;
  })).toBe(true);
  expect(await name.evaluate((input) => getComputedStyle(input).borderColor)).not.toBe(restingBorder);
});

test("Contact links use the shared muted hover treatment", async ({ page }) => {
  await page.goto("/#contact");
  const contact = page.locator("#contact");
  const foreground = await page.locator("body").evaluate((body) => getComputedStyle(body).color);

  for (const label of [
    "reshetnik.nikita@gmail.com",
    "LinkedIn",
    "Telegram",
    "GitHub",
    "LeetCode",
  ]) {
    const link = contact.getByRole("link", { name: label, exact: true });
    expect(await link.evaluate((element) => getComputedStyle(element).color)).not.toBe(foreground);
    await link.hover();
    await expect(link).toHaveCSS("color", foreground);
  }

  await expect(contact.getByText("Book a call", { exact: true })).toHaveCSS("opacity", "0.35");
});

test("Contact reuses the primary action and balances its desktop columns", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#contact");
  const contact = page.locator("#contact");

  await contact.getByRole("textbox", { name: "Name" }).fill("Anna Sokolova");
  await contact.getByRole("textbox", { name: "Email" }).fill("anna@example.com");
  await contact.getByRole("textbox", { name: "Message" }).fill("Hello there");

  const download = page.getByRole("link", { name: "Download Résumé" });
  const explore = page.getByRole("link", { name: "Explore Experience" });
  const send = contact.getByRole("button", { name: "Send message" });
  /**
   * Reads the computed styles that define the shared primary action treatment.
   *
   * @param selector - Action locator to inspect.
   * @returns The comparable primary action styles.
   */
  const actionStyles = async (selector: typeof download) => selector.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderRadius: style.borderRadius,
      color: style.color,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      height: style.height,
      paddingLeft: style.paddingLeft,
      paddingRight: style.paddingRight,
    };
  });
  expect(await actionStyles(send)).toEqual(await actionStyles(download));
  await expect(download).toHaveCSS("height", "48px");
  await expect(explore).toHaveCSS("height", "48px");

  const leftColumn = contact.locator(":scope > div > div").first();
  const form = contact.locator("form");
  const message = contact.getByRole("textbox", { name: "Message" });
  const [leftBox, formBox, messageBox] = await Promise.all([
    leftColumn.boundingBox(),
    form.boundingBox(),
    message.boundingBox(),
  ]);
  if (!leftBox || !formBox || !messageBox) throw new Error("Contact columns must be measurable");

  expect(Math.abs(leftBox.y + leftBox.height - formBox.y - formBox.height)).toBeLessThanOrEqual(1);
  expect(messageBox.height).toBeGreaterThan(112);
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

test("collection links select the matching desktop header item after client navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#projects");
  await page.locator('[data-slot="more-projects-link"]').click();
  await expect(page).toHaveURL(/\/projects$/);

  const navigation = page.getByRole("navigation", { name: "Primary navigation" });
  await expect(navigation.getByRole("link", { name: "Projects" }))
    .toHaveAttribute("aria-current", "location");
  await expect(navigation.getByRole("link", { name: "Writing" }))
    .not.toHaveAttribute("aria-current", "location");

  await page.goto("/#writing");
  await page.locator('[data-slot="more-articles-link"]').click();
  await expect(page).toHaveURL(/\/articles$/);
  await expect(navigation.getByRole("link", { name: "Writing" }))
    .toHaveAttribute("aria-current", "location");
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
    await page.locator(`[data-slot="${route.row}"]`).first().click();

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

test("Page motion markers map five Home intro groups and staged rows across eight stable sections", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  });
  await page.goto("/");

  const heroTargets = page.locator("[data-page-motion-intro]");
  await expect(heroTargets).toHaveCount(5);
  expect(await heroTargets.evaluateAll((elements) => elements.map((element) => element.tagName))).toEqual([
    "DIV",
    "H1",
    "DIV",
    "DIV",
    "UL",
  ]);

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
  expect(await sectionRoots.evaluateAll((sections) => sections.every((section) =>
    section.querySelectorAll("[data-page-motion-row]").length >= 2,
  ))).toBe(true);
  expect(await page.locator('#skills [data-slot="skill-group"]').evaluateAll((groups) => groups.every((group) =>
    group.getAttribute("data-page-motion-order") === "center-out"
      && group.querySelectorAll("[data-page-motion-lead]").length === 1
      && group.querySelectorAll("[data-page-motion-item]").length > 1,
  ))).toBe(true);
});

for (const route of [
  { introCount: 1, label: "project list", path: "/projects" },
  { introCount: 3, label: "project detail", path: "/projects/devbook" },
  { introCount: 1, label: "article list", path: "/articles" },
  { introCount: 4, label: "article detail", path: "/articles/building-an-llm-evaluation-harness" },
]) {
  test(`Page motion animates the ${route.label} route`, async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem("portfolio-opening-splash-seen", "true");
    });
    await page.goto(route.path);

    const introTargets = page.locator("[data-page-motion-intro]");
    const sectionTargets = page.locator("[data-page-motion-section]");
    await expect(introTargets).toHaveCount(route.introCount);
    expect(await sectionTargets.count()).toBeGreaterThan(0);
    expect(await sectionTargets.evaluateAll((sections) => sections.every((section) =>
      section.matches('[data-page-motion-rows="children"]')
        ? section.children.length > 0
        : section.querySelectorAll("[data-page-motion-row]").length > 0,
    ))).toBe(true);
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
    if (route.path === "/projects" || route.path === "/articles") {
      const finalRow = page.locator("[data-page-motion-row]").last();
      await finalRow.focus();
      await expect(finalRow).toHaveCSS("opacity", "1");
      await expect(finalRow).toHaveCSS("transform", "none");
    }
  });
}

for (const route of [
  { headingIndex: 2, label: "project section", path: "/projects/devbook" },
  { headingIndex: 2, label: "article subsection", path: "/articles/fixing-bugs-with-mcps" },
]) {
  test(`Page motion waits to stage each ${route.label} heading group until it reaches the viewport`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript(() => {
      sessionStorage.setItem("portfolio-opening-splash-seen", "true");
    });
    await page.goto(route.path);

    const body = page.locator('[data-page-motion-rows="children"]').first();
    const headings = body.locator(":scope > :is(h2, h3, h4, h5, h6)");
    const heading = headings.nth(route.headingIndex), nextHeading = headings.nth(route.headingIndex + 1);
    await expect(heading).toHaveCSS("opacity", "0");
    await expect(nextHeading).toHaveCSS("opacity", "0");
    expect(await heading.evaluate((target) => target.getAnimations().length)).toBe(0);

    await heading.evaluate((element) => {
      const absoluteTop = element.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, absoluteTop - window.innerHeight * 0.88);
    });
    await expect.poll(() => heading.evaluate((target) => target.getAnimations().length)).toBeGreaterThan(0);
    await expect(nextHeading).toHaveCSS("opacity", "0");
    expect(await nextHeading.evaluate((target) => target.getAnimations().length)).toBe(0);

    const delays = await body.evaluate((root, headingIndex) => {
      const rows = Array.from(root.children);
      const starts = rows.map((row, index) => /^H[2-6]$/.test(row.tagName) ? index : -1).filter((index) => index >= 0);
      const groupStart = starts[headingIndex];
      const nextStart = starts[headingIndex + 1] ?? rows.length;
      return rows.slice(groupStart, nextStart).map((row) => {
        const animation = row.getAnimations().find((candidate) => candidate.effect instanceof KeyframeEffect);
        return animation?.effect instanceof KeyframeEffect ? Number(animation.effect.getTiming().delay) : null;
      });
    }, route.headingIndex);
    expect(delays.length).toBeGreaterThanOrEqual(2);
    expect(delays.every((delay) => delay === delays[0])).toBe(true);

    await nextHeading.evaluate((element) => {
      const absoluteTop = element.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, absoluteTop - window.innerHeight * 0.88);
    });
    await expect.poll(() => nextHeading.evaluate((target) => target.getAnimations().length)).toBeGreaterThan(0);
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
    const firstRow = rows.nth(0), secondRow = rows.nth(1), finalRow = rows.last();
    await expect.poll(() => firstRow.evaluate((target) => target.getAnimations().length)).toBeGreaterThan(0);
    await expect.poll(() => secondRow.evaluate((target) => target.getAnimations().length)).toBeGreaterThan(0);
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

    const entryDelays = await Promise.all([firstRow, secondRow].map((row) => row.evaluate((target) => {
      const animation = target.getAnimations().find((candidate) => candidate.effect instanceof KeyframeEffect);
      return animation?.effect instanceof KeyframeEffect ? Number(animation.effect.getTiming().delay) : null;
    })));
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
  expect(firstSplashFreeFrame?.opacity).toBeLessThan(0.95);
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
    return {
      opacityDelay: Number(opacityTiming.delay),
      opacityDuration: Number(opacityTiming.duration),
      opacityEasing: opacityTiming.easing,
      transformDelay: Number(transformTiming.delay),
      transformDuration: Number(transformTiming.duration),
      transformEasing: transformTiming.easing,
      firstOpacity: opacityFrames.at(0)?.opacity,
      firstTransform: transformFrames.at(0)?.transform,
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
    expect(contract?.firstTransform).toBe("translateY(18px)");
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

test("Page section rows wait for their own viewport trigger and reveal once", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => {
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  });
  await page.goto("/");
  const entries = page.locator("#experience ol > [data-page-motion-row]");
  const first = entries.nth(0), second = entries.nth(1);
  await expect(first).toHaveCSS("opacity", "0");
  await expect(second).toHaveCSS("opacity", "0");

  await first.evaluate((element) => {
    const absoluteTop = element.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, absoluteTop - window.innerHeight * 0.88);
  });
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  }));
  await expect.poll(() => first.evaluate((target) => target.getAnimations().length)).toBeGreaterThan(0);
  const revealStart = await first.evaluate((element) => {
    const animation = element.getAnimations().find((candidate) => candidate.effect instanceof KeyframeEffect);
    const timing = animation?.effect instanceof KeyframeEffect ? animation.effect.getTiming() : undefined;
    return {
      animating: element.getAnimations().some((animation) => animation.playState === "running"),
      delay: Number(timing?.delay),
      duration: Number(timing?.duration),
      easing: timing?.easing,
      topRatio: element.getBoundingClientRect().top / window.innerHeight,
    };
  });
  expect(revealStart.topRatio).toBeGreaterThanOrEqual(0.86);
  expect(revealStart.topRatio).toBeLessThanOrEqual(0.90);
  expect(revealStart.animating).toBe(true);
  expect(revealStart.delay).toBeGreaterThanOrEqual(0);
  expect(revealStart.delay / 75).toBeCloseTo(Math.round(revealStart.delay / 75), 5);
  expect(revealStart.duration).toBeCloseTo(520, 0);
  expect(revealStart.easing).toBe("cubic-bezier(0.22, 1, 0.36, 1)");
  await expect(second).toHaveCSS("opacity", "0");
  expect(await second.evaluate((target) => target.getAnimations().length)).toBe(0);

  await expect.poll(() => first.evaluate((target) => {
    const style = getComputedStyle(target);
    return style.opacity === "1" && style.transform === "none" && (target as HTMLElement).style.willChange === "";
  })).toBe(true);
  await second.evaluate((element) => {
    const absoluteTop = element.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, absoluteTop - window.innerHeight * 0.88);
  });
  await expect.poll(() => second.evaluate((target) => target.getAnimations().length)).toBeGreaterThan(0);

  await page.locator("#about-heading").scrollIntoViewIfNeeded();
  await first.evaluate((element) => {
    element.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(100);
  expect(await first.evaluate((target) => target.getAnimations().filter((animation) =>
    animation.playState === "running",
  ).length)).toBe(0);
});

test("Recommendations stagger in when the horizontal strip enters the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => {
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  });
  await page.goto("/");
  const track = page.locator('[data-slot="recommendation-track"]');
  const recommendations = track.locator("li");
  await expect(recommendations.first()).toHaveCSS("opacity", "0");
  await expect(recommendations.last()).toHaveCSS("opacity", "0");

  await track.evaluate((element) => {
    element.scrollIntoView({ block: "center" });
  });
  await expect.poll(() => recommendations.evaluateAll((elements) => elements.every((element) =>
    element.getAnimations().length > 0,
  ))).toBe(true);
  await expect.poll(() => recommendations.evaluateAll((elements) => elements.every((element) => {
    const style = getComputedStyle(element);
    return style.opacity === "1" && style.transform === "none";
  }))).toBe(true);
});

test("Skills reveal each group with a center-out item stagger", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => {
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  });
  await page.goto("/");
  const group = page.locator('#skills [data-slot="skill-group"]').last();
  const lead = group.locator("[data-page-motion-lead]");
  const items = group.locator("[data-page-motion-item]");
  await expect(items.first()).toHaveCSS("opacity", "0");
  await group.evaluate((element) => {
    const absoluteTop = element.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, absoluteTop - window.innerHeight * 0.88);
  });
  await expect.poll(() => items.evaluateAll((targets) => targets.every((target) =>
    target.getAnimations().length > 0,
  ))).toBe(true);

  const leadDelay = await lead.evaluate((target) => {
    const animation = target.getAnimations().find((candidate) => candidate.effect instanceof KeyframeEffect);
    return animation?.effect instanceof KeyframeEffect ? Number(animation.effect.getTiming().delay) : null;
  });
  expect(leadDelay).not.toBeNull();
  const delays = await items.evaluateAll((targets) => targets.map((target) => {
    const animation = target.getAnimations().find((candidate) => candidate.effect instanceof KeyframeEffect);
    return animation?.effect instanceof KeyframeEffect ? Number(animation.effect.getTiming().delay) : null;
  }));
  const expectedOrder: number[] = [];
  let left = Math.floor((delays.length - 1) / 2), right = left + 1;
  while (left >= 0 || right < delays.length) {
    if (left >= 0) expectedOrder.push(left--);
    if (right < delays.length) expectedOrder.push(right++);
  }
  expect(delays.map((delay, index) => ({ delay, index })).toSorted((a, b) => Number(a.delay) - Number(b.delay))
    .map(({ index }) => index)).toEqual(expectedOrder);
  for (const [staggerIndex, itemIndex] of expectedOrder.entries()) {
    expect(delays[itemIndex]).toBeCloseTo(Number(leadDelay) + (staggerIndex + 1) * 75, 0);
  }
});

test("Home section navigation stages visible rows and keeps later rows armed", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => {
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  });
  await page.goto("/");
  const rows = page.locator("#projects [data-page-motion-row]");
  await expect(rows.first()).toHaveCSS("opacity", "0");

  await page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Projects" })
    .click();
  await expect(page).toHaveURL(/#projects$/);
  await expect.poll(() => rows.evaluateAll((targets) => targets.filter((target) =>
    target.getAnimations().length > 0,
  ).length)).toBeGreaterThanOrEqual(3);

  const snapshot = await rows.evaluateAll((targets) => targets.map((target) => {
    const animation = target.getAnimations().find((candidate) => candidate.effect instanceof KeyframeEffect);
    return {
      delay: animation?.effect instanceof KeyframeEffect ? Number(animation.effect.getTiming().delay) : null,
      opacity: getComputedStyle(target).opacity,
      top: target.getBoundingClientRect().top,
    };
  }));
  const visibleDelays = snapshot.filter(({ delay }) => delay !== null).map(({ delay }) => delay);
  expect(visibleDelays.length).toBeGreaterThanOrEqual(3);
  for (const [index, delay] of visibleDelays.entries()) expect(delay).toBeCloseTo(index * 75, 0);
  const armedRows = snapshot.filter(({ top }) => top >= 720 * 0.9);
  expect(armedRows.length).toBeGreaterThan(0);
  expect(armedRows.every(({ delay, opacity }) => delay === null && opacity === "0")).toBe(true);
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
  expect(contactReveal.opacity).toBeLessThan(0.95);

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
  expect(routeContactReveal.opacity).toBeLessThan(0.95);
});

test("real Tab focus finishes an active section reveal synchronously", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => {
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  });
  await page.goto("/");
  const section = page.locator("#experience");
  const summary = section.getByText("Details", { exact: true }).first();
  const focusedRow = summary.locator("xpath=ancestor::*[@data-page-motion-row][1]");
  const finalHeroLink = page.locator("[data-page-motion-intro]").last().getByRole("link").last();
  await finalHeroLink.focus();
  await page.locator("#experience-heading").scrollIntoViewIfNeeded();
  await expect(section).toHaveAttribute("data-page-motion-revealed", "true");
  await expect.poll(() => focusedRow.evaluate((element) => getComputedStyle(element).transform)).not.toBe("none");

  await page.keyboard.press("Tab");
  await expect(summary).toBeFocused();
  expect(await focusedRow.evaluate((target) => {
    const style = getComputedStyle(target);
    return style.opacity === "1" && style.transform === "none" && (target as HTMLElement).style.willChange === "";
  })).toBe(true);
  await page.waitForTimeout(650);
  await expect(focusedRow).toHaveCSS("transform", "none");
});

test("real Tab focus exposes representative Projects, Writing, and Contact controls", async ({ page, browserName }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => {
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  });
  await page.goto("/");

  for (const path of [
    {
      before: page.locator("#education a").last(),
      target: page.locator("#projects a").first(),
    },
    {
      before: page.locator("#code a").last(),
      target: page.locator("#writing a").first(),
    },
    {
      before: page.locator("#writing a").last(),
      target: page.locator('#contact a[href^="mailto:"]').first(),
    },
  ]) {
    await path.before.focus();
    await page.keyboard.press(browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab");
    await expect(path.target).toBeFocused();
    expect(await path.target.evaluate((target) => {
      const row = target.closest<HTMLElement>("[data-page-motion-row]");
      return row !== null && getComputedStyle(row).opacity === "1" && getComputedStyle(row).transform === "none";
    })).toBe(true);
  }
});

test("Page motion recovers focus that predates its listener", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
    const observer = new MutationObserver(() => {
      const summary = document.querySelector<HTMLElement>("#experience summary");
      if (!summary) return;
      summary.focus();
      observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  await page.goto("/");

  const section = page.locator("#experience");
  const summary = section.getByText("Details", { exact: true }).first();
  await expect(summary).toBeFocused();
  await expect(section).toHaveAttribute("data-page-motion-revealed", "true");
  expect(await summary.evaluate((target) => {
    const row = target.closest<HTMLElement>("[data-page-motion-row]");
    return row !== null && getComputedStyle(row).opacity === "1" && getComputedStyle(row).transform === "none";
  })).toBe(true);
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

  await page.getByRole("link", { name: "Read case study" }).first().click();
  await expect(page).toHaveURL(/\/projects\//);
  await page.getByRole("navigation", { name: "Project navigation" }).getByRole("link", { name: "Home" }).click();
  await expect(page).toHaveURL("/");
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
      if (selector === "#intro-heading") return null;
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
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hi, I’m Nikita Reshetnik.");
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
  const surname = splash.getByText("Reshetnik", { exact: true });
  const role = splash.getByText("AI Engineer", { exact: true });
  await expect(surname).toBeVisible();
  await expect(role).toBeVisible();
  await expect(splash).toHaveCSS("transition-duration", "0s");
  await expect(surname).toHaveCSS("text-transform", "uppercase");
  expect(Number.parseFloat(await surname.evaluate((element) => getComputedStyle(element).fontSize)))
    .toBeGreaterThan(Number.parseFloat(await role.evaluate((element) => getComputedStyle(element).fontSize)) * 3);
  await expect(splash.locator("span")).toHaveCount(0);
  const visibleAt = await page.evaluate(() =>
    (window as typeof window & { __splashVisibleAt?: number }).__splashVisibleAt ?? performance.now());
  await expect(splash).toHaveAttribute("data-state", "exiting", { timeout: 2_000 });
  await expect(splash).toHaveCSS("opacity", "1");
  await expect(splash).toHaveCSS("transition-property", "transform");
  await expect.poll(async () => (await splash.boundingBox())?.y ?? 0).toBeGreaterThan(0);
  const exitElapsed = await page.evaluate((startedAt) => performance.now() - startedAt, visibleAt);
  expect(exitElapsed).toBeGreaterThanOrEqual(1_700);
  expect(exitElapsed).toBeLessThanOrEqual(2_000);
  await expect(splash).toHaveCount(0, { timeout: 800 });
  expect(await page.evaluate((startedAt) => performance.now() - startedAt, visibleAt)).toBeLessThanOrEqual(2_800);

  await page.reload();
  await expect(splash).toHaveCount(0, { timeout: 500 });
  await page.goto("/projects/devbook");
  await expect(splash).toHaveCount(0, { timeout: 500 });
  await page.getByRole("link", { name: "Home" }).click();
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
  await page.addInitScript(() => {
    let markerReady = false;
    let markerTimerStarted = false;
    // eslint-disable-next-line @typescript-eslint/no-deprecated, @typescript-eslint/unbound-method -- The test intentionally patches this DOM prototype method.
    const querySelector = Document.prototype.querySelector;
    // eslint-disable-next-line @typescript-eslint/no-deprecated, @typescript-eslint/no-unnecessary-type-parameters -- Preserve the DOM method's generic return contract while patching it.
    Document.prototype.querySelector = function <ElementType extends Element = Element>(selector: string) {
      if (selector === "main#main" && !markerReady) {
        if (!markerTimerStarted) {
          markerTimerStarted = true;
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
  const delayedVisibleAt = await page.evaluate(() => performance.now());
  await page.waitForTimeout(1_800);
  await expect(splash).toHaveAttribute("data-state", "visible");
  await expect(splash).toHaveAttribute("data-state", "exiting", { timeout: 500 });
  const delayedExitElapsed = await page.evaluate((startedAt) => performance.now() - startedAt, delayedVisibleAt);
  expect(delayedExitElapsed).toBeGreaterThanOrEqual(2_000);
  expect(delayedExitElapsed).toBeLessThanOrEqual(2_300);
  await expect(splash).toHaveCount(0, { timeout: 800 });

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
  const splash = page.locator("[aria-hidden=true]").filter({ hasText: "Reshetnik" });
  await expect(splash).toBeVisible();
  await expect(splash).toHaveCSS("transform", "none");
  await expect(splash.getByText("AI Engineer", { exact: true })).toBeVisible();
  await expect(page.locator('[data-slot="availability-dot"]')).toHaveCSS("animation-name", "none");
  const primaryAction = page.getByRole("link", { name: "Download Résumé" });
  await primaryAction.hover();
  await expect(primaryAction.locator("svg")).toHaveCSS("translate", "none");
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("Page motion targets remain visible without JavaScript", async ({ page }) => {
    await page.goto("/");
    const targets = page.locator('[data-page-motion-intro], [data-page-motion-row], [data-page-motion-item], [data-page-motion-rows="children"] > *');
    expect(await targets.count()).toBeGreaterThan(13);
    expect(await targets.evaluateAll((elements) => elements.every((element) => {
      const style = getComputedStyle(element);
      return style.opacity === "1" && style.transform === "none";
    }))).toBe(true);
  });

  for (const route of [
    { label: "project list", path: "/projects" },
    { label: "project detail", path: "/projects/devbook" },
    { label: "article list", path: "/articles" },
    { label: "article detail", path: "/articles/building-an-llm-evaluation-harness" },
  ]) {
    test(`the ${route.label} motion targets remain visible without JavaScript`, async ({ page }) => {
      await page.goto(route.path);
      const targets = page.locator('[data-page-motion-intro], [data-page-motion-row], [data-page-motion-item], [data-page-motion-rows="children"] > *');
      expect(await targets.count()).toBeGreaterThan(1);
      expect(await targets.evaluateAll((elements) => elements.every((element) => {
        const style = getComputedStyle(element);
        return style.opacity === "1" && style.transform === "none";
      }))).toBe(true);
    });
  }

  for (const width of [390, 768, 1024, 1279, 1280]) {
    test(`the Phase 9 header exposes only approved navigation at ${String(width)}px`, async ({ page }) => {
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
      await expect(page.locator("#code").getByRole("link", { name: "github.com/grafanaKibana" })).toBeVisible();
      await expect(page.locator("#writing").getByRole("link", {
        name: /Building an LLM Evaluation Harness with Microsoft\.Extensions\.AI/,
      })).toHaveAttribute("href", "/articles/building-an-llm-evaluation-harness");
      await expect(page.locator("#contact").getByRole("link", {
        name: "reshetnik.nikita@gmail.com",
      })).toHaveAttribute("href", "mailto:reshetnik.nikita@gmail.com");
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
