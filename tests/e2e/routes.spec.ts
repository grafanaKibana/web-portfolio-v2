import { expect, test } from "@playwright/test";

const missingRouteFamilies = ["articles", "projects"];

test("every article index link resolves to a static semantic article", async ({ page }) => {
  await page.goto("/articles");
  const hrefs = await page.locator('[data-slot="article-row"]').evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")).filter((href): href is string => href !== null));

  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    expect(href).toMatch(/^\/articles\/[a-z0-9-]+$/);
    const response = await page.goto(href);

    expect(response?.status()).toBe(200);
    const article = page.locator("main#main > article");
    await expect(article).toBeVisible();
    const headingTags = await article.locator("h1, h2, h3, h4, h5, h6").evaluateAll((headings) =>
      headings.map((heading) => heading.tagName));
    expect(headingTags[0]).toBe("H1");
    expect(headingTags.slice(1)).not.toContain("H1");
  }
});

test("every project index link resolves to a static semantic case study", async ({ page }) => {
  await page.goto("/projects");
  const hrefs = await page.locator('[data-slot="project-row"]').evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")).filter((href): href is string => href !== null));

  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    expect(href).toMatch(/^\/projects\/[a-z0-9-]+$/);
    const response = await page.goto(href);

    expect(response?.status()).toBe(200);
    const article = page.locator("main#main > article");
    await expect(article).toBeVisible();
    await expect(article.getByRole("heading", { level: 1 })).toBeVisible();
    const headingTags = await article.locator("h1, h2, h3, h4, h5, h6").evaluateAll((headings) =>
      headings.map((heading) => heading.tagName));
    expect(headingTags[0]).toBe("H1");
    expect(headingTags.slice(1)).not.toContain("H1");
  }
});

test("every Home Writing link resolves to a rendered static article", async ({ page }) => {
  await page.goto("/");
  const links = page.locator('#writing a[href^="/articles/"]');
  const hrefs = await links.evaluateAll((anchors) =>
    anchors.map((anchor) => anchor.getAttribute("href")).filter((href) => href !== null));

  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    const response = await page.goto(href);

    expect(response?.status()).toBe(200);
    const article = page.locator("main#main > article");
    await expect(article).toBeVisible();
    await expect(article.getByRole("heading", { level: 1 })).toBeVisible();
  }
});

for (const family of missingRouteFamilies) {
  test(`unknown ${family} slug uses the static framework 404`, async ({ page }) => {
    const response = await page.goto(`/${family}/not-a-real-slug`);

    expect(response?.status()).toBe(404);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
}

test("project case studies use the route-aware header and hero actions", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/projects/devbook");

  await expect(page.getByRole("banner")).toHaveCount(1);
  const header = page.locator('[data-slot="site-header"]');
  const navigation = header.getByRole("navigation", { name: "Project navigation" });
  await expect(header).toBeVisible();
  await expect(page.locator('[data-slot="project-header"]')).toHaveCount(0);
  await expect(header.getByRole("heading")).toHaveCount(0);
  const back = navigation.getByRole("link", { name: "Back to list" });
  await expect(back).toHaveAttribute("href", "/projects");
  await expect(back).toHaveAttribute("data-slot", "detail-back-link");
  await expect(navigation.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");

  const hero = page.locator('[data-slot="project-hero"]');
  await expect(hero.locator('[data-slot="project-title-row"] > [data-slot="project-actions"]')).toHaveCount(1);
  await expect(hero.getByRole("heading", { level: 1, name: "DevBook" })).toBeVisible();
  await expect(hero.getByRole("link", { name: "Live" })).toHaveAttribute("href", "https://devbook.zip");
  await expect(hero.getByRole("link", { name: "Source" })).toHaveAttribute(
    "href",
    "https://github.com/grafanaKibana/devbook.zip",
  );
  await expect(page.getByText("All projects", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Case study", { exact: true })).toHaveCount(0);
  await expect(page.locator("article").getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.locator("article").getByRole("heading", { name: "Links" })).toHaveCount(0);
  await expect(page.locator("article").getByRole("heading", { name: "Stack" })).toHaveCount(0);

  const titleBox = await hero.getByRole("heading", { level: 1, name: "DevBook" }).boundingBox();
  const actionsBox = await hero.locator('[data-slot="project-actions"]').boundingBox();
  if (!titleBox || !actionsBox) throw new Error("Project title and actions must be measurable");
  expect(titleBox.y + titleBox.height / 2).toBeCloseTo(actionsBox.y + actionsBox.height / 2, 1);
});

test("project case-study prose keeps a readable measure without page overflow", async ({ page }) => {
  for (const width of [390, 414, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/projects/devbook");

    expect(await page.locator("html").evaluate((root) => root.scrollWidth <= root.clientWidth)).toBe(true);
    const articleBox = await page.locator("main#main > article").boundingBox();
    if (!articleBox) throw new Error("Project article must be measurable");
    expect(articleBox.width).toBeLessThanOrEqual(848);
    expect(articleBox.x).toBeGreaterThanOrEqual(0);
    expect(articleBox.x + articleBox.width).toBeLessThanOrEqual(width);
  }
});

test("project case studies link to the next discovered case study", async ({ page }) => {
  await page.goto("/projects");
  const rows = page.locator('[data-slot="project-row"]');
  const firstHref = await rows.nth(0).getAttribute("href");
  const secondHref = await rows.nth(1).getAttribute("href");
  const secondTitle = await rows.nth(1).getByRole("heading", { level: 2 }).textContent();
  if (!firstHref || !secondHref || !secondTitle) throw new Error("Two project case studies are required");

  await page.goto(firstHref);
  const pagination = page.getByRole("navigation", { name: "Project pagination" });
  await expect(pagination).toContainText("Next");
  const nextLink = pagination.locator('[data-slot="next-project"]');
  await expect(nextLink).toHaveAttribute("href", secondHref);
  await expect(nextLink).toContainText(secondTitle.trim());

  await nextLink.click();
  await expect(page).toHaveURL(new RegExp(`${secondHref}$`));
  await expect(page.locator("main#main > article").getByRole("heading", {
    level: 1,
    name: secondTitle.trim(),
  })).toBeVisible();
});

test("web-portfolio-v1 omits the unavailable live destination", async ({ page }) => {
  await page.goto("/projects/web-portfolio-v1");

  const actions = page.locator('[data-slot="project-hero"] [data-slot="project-actions"] a');
  await expect(actions).toHaveCount(1);
  await expect(actions.first()).toHaveAccessibleName("Source");
  await expect(actions.first()).toHaveAttribute(
    "href",
    "https://github.com/grafanaKibana/web-portfolio-v1",
  );
});

for (const plugin of [
  {
    path: "/projects/obsidian-colsdown",
    store: "https://obsidian.md/plugins?id=colsdown",
    source: "https://github.com/grafanaKibana/obsidian-colsdown",
  },
  {
    path: "/projects/obsidian-tabsdown",
    store: "https://obsidian.md/plugins?id=tabsdown",
    source: "https://github.com/grafanaKibana/obsidian-tabsdown",
  },
]) {
  test(`${plugin.path} leads with its Obsidian store link`, async ({ page }) => {
    await page.goto(plugin.path);

    const links = page.locator('[data-slot="project-hero"] [data-slot="project-actions"] a');
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toHaveAttribute("href", plugin.store);
    await expect(links.nth(0).locator('[data-slot="obsidian-icon"]')).toHaveCount(1);
    await expect(links.nth(1)).toHaveAttribute("href", plugin.source);
  });
}

test("the project index keeps each complete row as one ordered case-study link", async ({ page }) => {
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/projects");

    const mainBox = await page.locator("main#main").boundingBox();
    if (!mainBox) throw new Error("Projects content must be measurable");
    expect(mainBox.x + mainBox.width / 2).toBeCloseTo(width / 2, 1);
  }

  const header = page.locator('[data-slot="site-header"]');
  await expect(header).toBeVisible();
  await expect(page.locator('[data-slot="project-header"]')).toHaveCount(0);
  await expect(header.getByRole("link", { name: "Back to top" })).toHaveAttribute("href", "/#top");
  await expect(header.getByRole("link", { name: "Projects" })).toHaveAttribute("aria-current", "location");
  expect(await header.getByRole("navigation", { name: "Primary navigation" }).getByRole("link").evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")),
  )).toEqual(["/#top", "/#about", "/#experience", "/#education", "/#skills", "/#projects", "/#code", "/#writing", "/#contact"]);
  await expect(page.locator("main").getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
  await expect(page.getByText("Selected work", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Software, learning systems, and applied AI work.", { exact: true })).toHaveCount(0);

  const rows = page.locator('[data-slot="project-row"]');
  await expect(rows).toHaveCount(8);
  await expect(rows.first()).toHaveAttribute("href", "/projects/devbook");
  expect(await rows.first().locator("article > *").evaluateAll((elements) =>
    elements.map((element) => element.tagName),
  )).toEqual(["H2", "P", "P"]);
});

test("article pages use the route-aware detail header without index-page copy", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("theme", "dark");
  });
  await page.goto("/articles/building-an-llm-evaluation-harness");

  await expect(page.getByRole("banner")).toHaveCount(1);
  const header = page.locator('[data-slot="site-header"]');
  const navigation = header.getByRole("navigation", { name: "Article navigation" });
  await expect(header).toBeVisible();
  await expect(page.locator('[data-slot="article-header"]')).toHaveCount(0);
  await expect(header.getByRole("heading")).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: "Back to list" }))
    .toHaveAttribute("href", "/articles");
  await expect(navigation.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
  await expect(page.locator("main#main").getByText("All articles", { exact: true })).toHaveCount(0);
  await expect(page.locator("main#main").getByText("Writing", { exact: true })).toHaveCount(0);
  await expect(page.locator("main#main").getByRole("heading", {
    level: 1,
    name: "Building an LLM Evaluation Harness with Microsoft.Extensions.AI",
  })).toBeVisible();

  expect(await page.locator("main article > header > *").evaluateAll((elements) =>
    elements.map((element) => element.tagName),
  )).toEqual(["P", "H1", "P", "P"]);
  const articleMetadata = page.locator("main article > header > p").first();
  await expect(articleMetadata).toContainText("March 16, 2026 · 8 min read");
  await expect(articleMetadata.locator("time")).toHaveAttribute("datetime", "2026-03-16");
  await expect(articleMetadata.locator("time")).toHaveText("March 16, 2026");
  await expect(page.locator('[data-slot="article-pagination"]')).toHaveCount(0);

  const highlightedCode = page.locator(
    'figure[data-rehype-pretty-code-figure] pre[data-language="csharp"] code[data-language="csharp"]',
  ).first();
  await expect(highlightedCode).toHaveAttribute(
    "data-theme",
    /(?:github-light.*github-dark-dimmed|github-dark-dimmed.*github-light)/,
  );
  await expect(highlightedCode.locator('span[style*="--shiki-light"][style*="--shiki-dark"]').first())
    .toBeVisible();

  const codeBlock = highlightedCode.locator("xpath=..");
  const backgrounds = await codeBlock.evaluate((element) => {
    const mutedProbe = document.createElement("span");
    mutedProbe.className = "bg-muted";
    document.body.append(mutedProbe);
    const result = {
      block: getComputedStyle(element).backgroundColor,
      muted: getComputedStyle(mutedProbe).backgroundColor,
      page: getComputedStyle(document.body).backgroundColor,
    };
    mutedProbe.remove();
    return result;
  });
  expect(backgrounds.block).not.toBe(backgrounds.muted);
  expect(backgrounds.block).not.toBe(backgrounds.page);
});

test("article metadata describes the rendered static article", async ({ page }) => {
  await page.goto("/articles/building-an-llm-evaluation-harness");

  await expect(page).toHaveTitle("Building an LLM Evaluation Harness with Microsoft.Extensions.AI | Nikita Reshetnik");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/articles\/building-an-llm-evaluation-harness$/,
  );
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");
});

test("article prose keeps its readable shell measure across responsive themes", async ({ page }) => {
  for (const { width, theme } of [
    { width: 390, theme: "light" },
    { width: 414, theme: "dark" },
    { width: 768, theme: "light" },
    { width: 1440, theme: "dark" },
  ]) {
    await page.setViewportSize({ width, height: 900 });
    const initScript = await page.addInitScript((selectedTheme) => {
      localStorage.setItem("theme", selectedTheme);
    }, theme);
    try {
      await page.goto("/articles/building-an-llm-evaluation-harness");

      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      expect(await page.locator("html").evaluate((root) => root.scrollWidth <= root.clientWidth)).toBe(true);
      const main = page.locator("main#main");
      const articleBox = await main.locator(":scope > article").boundingBox();
      const mainBox = await main.boundingBox();
      if (!articleBox || !mainBox) throw new Error("Article shell must be measurable");
      expect(articleBox.width).toBeLessThanOrEqual(848);
      expect(articleBox.x).toBeGreaterThanOrEqual(mainBox.x);
      expect(articleBox.x + articleBox.width).toBeLessThanOrEqual(width);
      expect(articleBox.x).toBeCloseTo(
        mainBox.x + await main.evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingLeft)),
        1,
      );
    } finally {
      await initScript.dispose();
    }
  }
});

test("article MDX keeps semantic subheadings, ordered lists, and quotations", async ({ page }) => {
  await page.goto("/articles/fixing-bugs-with-mcps");
  const article = page.locator("main#main > article");

  await expect(article.getByRole("heading", { level: 3 }).first()).toBeVisible();
  await expect(article.locator("ol").first()).toBeVisible();
  await expect(article.locator("blockquote").first()).toBeVisible();
});

test("article detail controls remain keyboard reachable", async ({ page, browserName }) => {
  await page.goto("/articles/building-an-llm-evaluation-harness");
  const forward = browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
  await page.keyboard.press(forward);
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press(forward);
  await expect(page.getByRole("link", { name: "Home" })).toBeFocused();
  await page.keyboard.press(forward);
  const back = page.getByRole("link", { name: "Back to list" });
  await expect(back).toBeFocused();
  await expect(back).not.toHaveCSS("outline-style", "none");
});

test("the Writing index reuses the approved whole-row project composition", async ({ page }) => {
  for (const width of [375, 414, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/articles");
    expect(await page.locator("html").evaluate((root) => root.scrollWidth <= root.clientWidth)).toBe(true);

    const mainBox = await page.locator("main#main").boundingBox();
    if (!mainBox) throw new Error("Articles content must be measurable");
    expect(mainBox.x + mainBox.width / 2).toBeCloseTo(width / 2, 1);
  }

  await expect(page.locator("main").getByRole("heading", { level: 1, name: "Articles" })).toBeVisible();
  await expect(page.getByText("Notes on AI evaluation and software engineering.", { exact: true })).toHaveCount(0);

  const rows = page.locator('[data-slot="article-row"]');
  await expect(rows).toHaveCount(3);
  expect(await rows.evaluateAll((links) => links.map((link) => link.getAttribute("href")))).toEqual([
    "/articles/building-an-llm-evaluation-harness",
    "/articles/fixing-bugs-with-mcps",
    "/articles/microsoft-agent-framework-setup",
  ]);
  expect(await rows.first().locator("article > *").evaluateAll((elements) =>
    elements.map((element) => element.tagName),
  )).toEqual(["P", "H2", "P"]);
  await expect(rows.first()).toContainText("March 16, 2026 · 8 min read");
  await expect(page.locator('[data-slot="site-header"]').getByRole("link", { name: "Writing" }))
    .toHaveAttribute("aria-current", "location");
});

test("collection lists and detail pages share one slightly wider centered pane", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  for (const [indexPath, detailPath] of [
    ["/projects", "/projects/devbook"],
    ["/articles", "/articles/building-an-llm-evaluation-harness"],
  ] as const) {
    await page.goto(indexPath);
    const index = await page.locator("main#main").boundingBox();
    await page.goto(detailPath);
    const detail = await page.locator("main#main").boundingBox();
    if (!index || !detail) throw new Error("Collection panes must be measurable");
    expect(index.width).toBeGreaterThan(768);
    expect(detail.width).toBe(index.width);
    expect(index.x + index.width / 2).toBeCloseTo(720, 1);
    expect(detail.x + detail.width / 2).toBeCloseTo(720, 1);
    await expect(page.locator("main#main > article")).toHaveCSS("max-width", "none");
  }
});

test("project case-study shell headers center the back-to-list link on narrow screens", async ({ page }) => {
  for (const width of [280, 320, 344]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/projects/quartz-tabsdown");

    const header = page.locator('[data-slot="site-header"]');
    const homeLink = header.getByRole("link", { name: "Home" });
    const backLink = header.getByRole("link", { name: "Back to list" });
    await expect(header.getByRole("heading")).toHaveCount(0);
    await expect(backLink).toBeVisible();
    const [headerBox, backBox] = await Promise.all([header.boundingBox(), backLink.boundingBox()]);
    if (!headerBox || !backBox) throw new Error("Detail header and back link must be measurable");
    expect(backBox.x + backBox.width / 2).toBeCloseTo(headerBox.x + headerBox.width / 2, 1);
    await expect(page.locator('[data-slot="project-hero"]').getByRole("heading", {
      level: 1,
      name: "Quartz Tabsdown",
    })).toBeVisible();
    await homeLink.click();
    await expect(page).toHaveURL("/");
  }
});

test("Home sections keep their semantic order", async ({ page }) => {
  await page.goto("/");

  expect(await page.locator("main#main > section").evaluateAll((sections) =>
    sections.map((section) => section.getAttribute("aria-labelledby") ?? section.id),
  )).toEqual(["intro-heading", "about-heading", "experience-heading", "education-heading", "skills-heading", "projects-heading", "code-heading", "writing-heading", "contact-heading"]);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("article index and detail content remain usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/articles");
    const firstArticle = page.locator('[data-slot="article-row"]').first();
    await expect(firstArticle).toBeVisible();
    await firstArticle.click();

    await expect(page.getByRole("banner")).toHaveCount(1);
    await expect(page.locator("main#main > article")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to list" })).toHaveAttribute("href", "/articles");
    await expect(page.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    await expect(page.locator('pre[data-language="csharp"] code[data-language="csharp"]').first()).toBeVisible();
    expect(await page.locator("html").evaluate((root) => root.scrollWidth <= root.clientWidth)).toBe(true);
  });

  test("the corrected intro, shell anchors, and long-form routes remain usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Hi, I’m Nikita Reshetnik.Shipping Agents at scale.");
    await expect(page.getByText("Open to work", { exact: false })).toBeVisible();
    await expect(page.locator('[data-slot="hero-descriptor"]')).toHaveText("AI Engineer");
    await expect(page.getByRole("link", { name: "Download Résumé" })).toHaveAttribute(
      "href",
      "https://github.com/grafanaKibana/LatexCV/releases/latest/download/resume.pdf",
    );
    await expect(page.getByRole("contentinfo")).toContainText(
      `© ${String(new Date().getFullYear())} Nikita Reshetnik. All rights reserved. · Local Time:`,
    );
    await expect(page.getByRole("navigation", {
      name: "Compact navigation",
      includeHidden: true,
    })).toHaveCount(1);
    expect(await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link").evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")),
    )).toEqual(["/#top"]);
    await expect(page.locator("#about")).toHaveCount(1);
    await expect(page.locator("#experience")).toHaveCount(1);
    await expect(page.locator("#education")).toHaveCount(1);
    await expect(page.locator("#skills")).toHaveCount(1);
    await expect(page.locator("#projects")).toHaveCount(1);
    await expect(page.locator('#projects [data-slot="home-project"]')).toHaveCount(3);
    await expect(page.getByRole("link", { name: "See other work" })).toHaveAttribute("href", "/projects");
    const education = page.locator("#education");
    await expect(education.getByRole("heading", { level: 3 })).toHaveText([
      "University degree",
      "Industry certifications",
    ]);
    await expect(education.getByRole("heading", { level: 3, name: "Learning & training" })).toHaveCount(0);
    await expect(education.getByRole("link", { name: "Azure AI Fundamentals" })).toHaveAttribute(
      "href",
      "https://learn.microsoft.com/api/credentials/share/en-us/nikitareshetnik/F3083C3D360731B0?sharingId=8BF347D38A5CD134",
    );
    await expect(education.getByRole("link", { name: "GitHub Copilot" })).toHaveAttribute(
      "href",
      "https://www.credly.com/badges/ba1ea295-7465-4edc-8ca1-faa90eee9ec1/public_url",
    );
    const skills = page.locator("#skills");
    await expect(skills.getByRole("heading", { level: 3 })).toHaveText([
      "AI / Machine Learning",
      "Programming Languages",
      "Backend",
      "Data",
      "Cloud & DevOps",
      "Observability & CI/CD",
      "AI Development Tools",
    ]);
    await expect(skills.locator('[data-slot="skill"]')).toHaveCount(42);
    await expect(skills.locator('[data-slot="skill-icon"]')).toHaveCount(42);
    await expect(page.locator("#code").getByRole("link", { name: "github.com/grafanaKibana" })).toBeVisible();
    const writing = page.locator("#writing");
    await expect(writing.getByRole("heading", { level: 2, name: "Writing" })).toBeVisible();
    const articleLinks = writing.locator('a[href^="/articles/"]');
    expect(await articleLinks.count()).toBeGreaterThan(0);
    await articleLinks.first().click();
    const article = page.locator("main#main > article");
    await expect(article).toBeVisible();
    await expect(article.getByRole("heading", { level: 1 })).toBeVisible();

    await page.goto("/projects");
    await page.getByRole("link", { name: "DevBook" }).click();
    await expect(page).toHaveURL(/\/projects\/devbook$/);
    await expect(page.getByRole("banner")).toHaveCount(1);
    await expect(page.getByRole("navigation", { name: "Project navigation" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to list" })).toHaveAttribute("href", "/projects");
    await expect(page.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    await expect(
      page.getByRole("heading", { level: 2, name: "One source, different uses" }),
    ).toBeVisible();
  });
});
