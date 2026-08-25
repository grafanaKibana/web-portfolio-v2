import { expect, test } from "@playwright/test";

const futureSectionIds = ["code", "writing", "contact"];

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
  )).toEqual(["/#top", "/#about", "/#experience", "/#education", "/#skills", "/#projects"]);
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
  for (const id of ["about", "experience", "education", "skills", "projects"]) {
    const href = `/#${id}`;
    await page.locator(`#${id}`).evaluate((section) => {
      section.scrollIntoView();
    });
    await expect(navigation.locator(`a[href="${href}"]`)).toHaveAttribute("aria-current", "location");
    await expect(navigation.locator('a[aria-current="location"]')).toHaveCount(1);
  }
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

test("the home page contains approved content through Phase 6 Selected Work", async ({ page }) => {
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
  await expect(experience.getByRole("heading", { level: 2, name: "Experience" })).toHaveText("Experience");
  await expect(experience.getByText("7 roles · 2021—Present", { exact: true })).toHaveCount(0);
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
  expect(openingNextTop).toBeLessThan(openNextTop);
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
  await page.setViewportSize({ width: 1280, height: 768 });
  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Experience" })
    .click();
  await expect(page).toHaveURL(/#experience$/);
  const desktopHeader = await page.locator('[data-slot="site-header"]').boundingBox();
  const desktopHeading = await page.locator("#experience > div").first().boundingBox();
  if (!desktopHeader || !desktopHeading) throw new Error("Desktop Experience heading must be measurable");
  expect(Math.abs(desktopHeading.y - desktopHeader.y - desktopHeader.height)).toBeLessThanOrEqual(1);

  for (const width of [1024, 1279]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await page.evaluate(() => {
      window.scrollTo(0, 320);
    });
    await page.getByRole("button", { name: "Jump to section" }).click();
    await page.getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("link", { name: "Experience" })
      .click();
    const tabletHeader = await page.locator('[data-slot="site-header"]').boundingBox();
    const tabletHeading = await page.locator("#experience > div").first().boundingBox();
    if (!tabletHeader || !tabletHeading) throw new Error("Tablet Experience heading must be measurable");
    expect(Math.abs(tabletHeading.y - tabletHeader.y - tabletHeader.height)).toBeLessThanOrEqual(1);
  }

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

test("Education clears the sticky header at each shell layout", async ({ page }) => {
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/#education");
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
    "Backend & Data",
    "Cloud & DevOps",
    "Observability & CI/CD",
    "AI Development Tools",
  ]);
  await expect(skills.locator('[data-slot="skill-label"]')).toHaveText([
    "Microsoft Agent Framework",
    "Semantic Kernel",
    "Microsoft.Extensions.AI",
    "LLM Evaluation",
    "RAG Systems",
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
    "Postman",
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
  await expect(skills.locator('[data-icon-kind="semantic-gradient"]')).toHaveCount(4);
  await expect(skills.locator('[data-icon-kind="dotnet"]')).toHaveCount(4);
  await expect(skills.locator('[data-icon-kind="gcp-api"]')).toHaveCount(1);
  await expect(skills.locator('[data-icon-kind="microsoft-agent-framework"]')).toHaveCount(1);
  await expect(skills.locator('[data-icon-kind="claude-code"]')).toHaveCount(1);
  await expect(skills.locator('[data-icon-kind="claude-design"]')).toHaveCount(1);
  await expect(skills.locator('[data-icon-kind="codex"]')).toHaveCount(1);
  await expect(skills.getByText("Semantic Kernel", { exact: true }).locator("..").locator(".lucide-sparkles")).toHaveCount(2);
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

    expect(await skills.evaluate((section) => section.scrollWidth <= section.clientWidth)).toBe(true);
    await expect(skills.locator('[data-slot="skill-group"]')).toHaveCount(6);
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

  const projectAction = page.locator("#projects").getByRole("link", { name: "Read case study" }).first();
  const restingActionColor = await projectAction.evaluate((element) => getComputedStyle(element).color);
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
  const sourceAction = page.locator('[data-slot="project-hero"]').getByRole("link", { name: "Source" });
  const restingSourceColor = await sourceAction.evaluate((element) => getComputedStyle(element).color);
  await sourceAction.hover();
  await expect.poll(() => sourceAction.evaluate((element) => getComputedStyle(element).color))
    .not.toBe(restingSourceColor);
  await expect(sourceAction.locator("svg")).toHaveCSS("transform", "none");
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
  const splash = page.locator('[data-slot="opening-splash"]');
  await expect(splash).toHaveAttribute("data-state", "visible");
  const visibleAt = await page.evaluate(() => performance.now());
  await expect(splash).toHaveCount(0, { timeout: 4_500 });
  expect(await page.evaluate((startedAt) => performance.now() - startedAt, visibleAt)).toBeLessThanOrEqual(4_500);
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hi, I’m Nikita Reshetnik.");
});

test("splash remains noticeable and supports an indefinite debug flag", async ({ page }) => {
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
  const exitElapsed = await page.evaluate((startedAt) => performance.now() - startedAt, visibleAt);
  expect(exitElapsed).toBeGreaterThanOrEqual(1_700);
  expect(exitElapsed).toBeLessThanOrEqual(2_000);
  await expect(splash).toHaveCount(0, { timeout: 400 });
  expect(await page.evaluate((startedAt) => performance.now() - startedAt, visibleAt)).toBeLessThanOrEqual(2_400);

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
      if (selector === "#intro-heading" && !markerReady) {
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
  await expect(splash).toHaveCount(0, { timeout: 400 });

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

  for (const width of [390, 768, 1024, 1279, 1280]) {
    test(`the Phase 6 header exposes only approved navigation at ${String(width)}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/");
      await expect(page.getByRole("navigation", {
        name: "Compact navigation",
        includeHidden: true,
      })).toHaveCount(1);
      expect(await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link").evaluateAll((links) =>
        links.map((link) => link.getAttribute("href")),
      )).toEqual(width >= 1280 ? ["/#top", "/#about", "/#experience", "/#education", "/#skills", "/#projects"] : ["/#top"]);
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
    await expect(compactNavigation.getByRole("link")).toHaveText(["About", "Experience", "Education", "Skills", "Projects"]);
    await compactNavigation.getByRole("link", { name: "About" }).click();
    await expect(page).toHaveURL(/#about$/);
    const headingBox = await page.getByRole("heading", { level: 2, name: "About" }).boundingBox();
    const headerBox = await page.locator('[data-slot="site-header"]').boundingBox();
    if (!headingBox || !headerBox) throw new Error("About heading must be measurable without JavaScript");
    expect(Math.abs(headingBox.y - headerBox.y - headerBox.height)).toBeLessThanOrEqual(1);
  });
});
