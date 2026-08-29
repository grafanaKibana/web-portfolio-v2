import { expect, test } from "@playwright/test";

const footerRoutes = [
  "/",
  "/projects",
  "/projects/devbook",
  "/articles",
  "/articles/building-an-llm-evaluation-harness",
  "/privacy",
  "/terms",
  "/accessibility",
  "/for-robots",
];

const footerLinks = [
  ["Privacy Policy", "/privacy"],
  ["Terms & Conditions", "/terms"],
  ["Accessibility", "/accessibility"],
  ["For Robots", "/for-robots"],
] as const;

const policyPages = [
  {
    path: "/privacy",
    title: "Privacy Policy",
    description: "How this personal portfolio handles analytics, performance measurements, and information sent by email.",
  },
  {
    path: "/terms",
    title: "Terms & Conditions",
    description: "Terms for using this personal portfolio and understanding source-code rights in linked repositories.",
  },
  {
    path: "/accessibility",
    title: "Accessibility",
    description: "Accessibility measures, current assessment status, known limitations, and feedback contact for this portfolio.",
  },
  {
    path: "/for-robots",
    title: "For Robots",
    description: "How llms.txt and robots.txt describe this portfolio to automated agents and crawlers.",
  },
] as const;

test("the global footer exposes the exact site-information destinations", async ({ page }) => {
  for (const path of footerRoutes) {
    await page.goto(path);
    const navigation = page.getByRole("contentinfo").getByRole("navigation", { name: "Site information" });
    await expect(navigation.getByRole("link")).toHaveCount(footerLinks.length);
    expect(await navigation.getByRole("link").evaluateAll((links) =>
      links.map((link) => [link.textContent.trim(), link.getAttribute("href")]),
    )).toEqual(footerLinks);
  }
});

test("policy pages expose their approved metadata and semantic structure", async ({ page }) => {
  for (const policy of policyPages) {
    const response = await page.goto(policy.path);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(`${policy.title} | Nikita Reshetnik`);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", policy.description);
    const main = page.locator("main#main");
    await expect(main).toBeVisible();
    await expect(main.getByRole("heading", { level: 1, name: policy.title })).toHaveCount(1);
    await expect(main.getByText("Last updated: August 29, 2026", { exact: true })).toBeVisible();
    const headingTags = await main.locator("h1, h2, h3, h4, h5, h6").evaluateAll((headings) =>
      headings.map((heading) => heading.tagName),
    );
    expect(headingTags[0]).toBe("H1");
    expect(headingTags.slice(1).every((tagName) => tagName === "H2")).toBe(true);
  }
});

test("policy copy keeps the approved privacy, licensing, accessibility, and robot boundaries", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByText("The contact form does not submit information to a portfolio server.", { exact: false })).toBeVisible();
  await expect(page.getByText("Vercel also says its visitor identifier changes daily and is not used to track people across days or websites.", { exact: false })).toBeVisible();
  await expect(page.getByText("Vercel says Speed Insights does not store information that can reconstruct a browsing session or identify a visitor or IP address.", { exact: false })).toBeVisible();
  await expect(page.getByText("Search Console provides aggregated information such as search queries, impressions, clicks, page URLs, countries, and device types.", { exact: false })).toBeVisible();
  await expect(page.getByText("It does not add its own analytics script or cookies to this site.", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Vercel Web Analytics privacy information" })).toHaveAttribute("href", "https://vercel.com/docs/analytics/privacy-policy");
  await expect(page.getByRole("link", { name: "Vercel Speed Insights privacy information" })).toHaveAttribute("href", "https://vercel.com/docs/speed-insights/privacy-policy");
  await expect(page.getByRole("link", { name: "Google Search Console information" })).toHaveAttribute("href", "https://support.google.com/webmasters/answer/10268906?hl=en");

  await page.goto("/terms");
  await expect(page.getByText("Unless a page says otherwise, the original text and articles on this site are © Nikita Reshetnik. All rights reserved.", { exact: false })).toBeVisible();
  await expect(page.getByText("When a linked repository includes a license, that license governs its source code. If it does not, these website terms grant no license to that code.", { exact: true })).toBeVisible();

  await page.goto("/accessibility");
  await expect(page.getByText("WCAG 2.2 Level AA is a design target for this site. The site has not completed a formal WCAG conformance assessment, and no conformance claim is made.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "reshetnik.nikita@gmail.com" })).toHaveAttribute("href", "mailto:reshetnik.nikita@gmail.com");

  await page.goto("/for-robots");
  await expect(page.getByText("llms.txt does not replace robots.txt and does not grant permission to crawl, index, train on, reproduce, or redistribute content.", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open llms.txt" })).toHaveAttribute("href", "/llms.txt");
  await expect(page.getByRole("link", { name: "Open robots.txt" })).toHaveAttribute("href", "/robots.txt");
  await expect(page.getByRole("link", { name: "Read the Terms & Conditions" })).toHaveAttribute("href", "/terms");
});

test("policy pages reflow within the viewport at the required widths", async ({ page }) => {
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const { path } of policyPages) {
      await page.goto(path);
      expect(await page.locator("html").evaluate((root) => root.scrollWidth <= root.clientWidth)).toBe(true);
      const article = await page.locator("main#main > article").boundingBox();
      if (!article) throw new Error("Policy article must be measurable");
      expect(article.x).toBeGreaterThanOrEqual(0);
      expect(article.x + article.width).toBeLessThanOrEqual(width);
    }
  }
});

for (const { path } of policyPages) {
  test(`policy-page text uses the shared reveal system on ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript(() => {
      sessionStorage.setItem("portfolio-opening-splash-seen", "true");
    });
    await page.goto(path);

    const introTargets = page.locator("[data-page-motion-intro]");
    const sections = page.locator("[data-page-motion-section]");
    await expect(introTargets).toHaveCount(3);
    expect(await sections.count()).toBeGreaterThan(0);
    expect(await sections.evaluateAll((items) => items.every((section) =>
      section.getAttribute("data-page-motion-rows") === "children"
        && section.querySelectorAll("[data-page-motion-trigger]").length === 1
        && section.children.length > 1,
    ))).toBe(true);
    await expect.poll(() => introTargets.first().evaluate((target) =>
      target.getAnimations().some((animation) => animation.effect instanceof KeyframeEffect),
    )).toBe(true);

    const firstSection = sections.first();
    const firstHeading = firstSection.locator(":scope > *").first();
    await firstSection.scrollIntoViewIfNeeded();
    await expect(firstSection).toHaveAttribute("data-page-motion-revealed", "true");
    await expect(firstHeading).toHaveCSS("opacity", "1");
    await expect(firstHeading).toHaveCSS("transform", "none");
  });
}

test("footer links meet the touch-target and keyboard-focus contracts", async ({ page, browserName }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  });
  await page.goto("/privacy");
  const navigation = page.getByRole("navigation", { name: "Site information" });
  const links = navigation.getByRole("link");
  expect(await links.evaluateAll((items) => items.every((item) => item.getBoundingClientRect().height >= 44))).toBe(true);

  const forward = browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
  for (let index = 0; index < 60; index += 1) {
    await page.keyboard.press(forward);
    if (await links.first().evaluate((link) => link === document.activeElement)) break;
  }
  await expect(links.first()).toBeFocused();
  await expect(links.first()).not.toHaveCSS("outline-style", "none");
});

test("llms.txt is a plain-text guide whose internal destinations resolve", async ({ request }) => {
  const response = await request.get("/llms.txt");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/^text\/plain/);
  const content = await response.text();
  expect(content.split("\n")[0]).toBe("# Nikita Reshetnik");
  expect(content).toMatch(/^> /m);
  expect(content).toContain("## Main");
  expect(content).toContain("## Site information");
  expect(content).toContain("## External");

  for (const path of ["/", "/projects", "/articles", "/privacy", "/terms", "/accessibility", "/for-robots", "/robots.txt"]) {
    expect((await request.get(path)).status()).toBe(200);
    expect(content).toContain(`](${path})`);
  }
});

test("policy pages preserve representative light-mobile and dark-desktop themes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/privacy");
  await expect(page.locator("html")).toHaveClass(/light/);
  await expect(page.locator("main#main")).toBeVisible();

  await page.evaluate(() => {
    localStorage.setItem("theme", "dark");
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/for-robots");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("main#main")).toBeVisible();
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the accessibility statement and footer remain usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/accessibility");
    await expect(page.locator("main#main")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Accessibility" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Site information" })).toBeVisible();
  });
});
