import { expect, test, type Locator, type Page } from "@playwright/test";
import { compile } from "sass";

const educationCss = compile(
  "app/(home)/_components/education/education.module.scss",
).css.replaceAll(/:global\(([^)]+)\)/g, "$1");

const educationWidths = [390, 768, 1024, 1279, 1280, 1440] as const;

/**
 * Reads a measurable element rectangle.
 *
 * @param element - Element whose bounds are required.
 * @returns The rendered rectangle.
 */
async function boxOf(element: Locator) {
  const box = await element.boundingBox();
  if (!box) throw new Error("Expected a measurable rendered element");
  return box;
}

/**
 * Creates deterministic credential rows for layout-only browser fixtures.
 *
 * @param count - Number of credential records to render.
 * @returns Credential list markup in source order.
 */
function credentialRows(count: number) {
  return Array.from({ length: count }, (_, index) => `
    <li class="credentialItem" data-slot="credential-item">
      <a class="credentialLink" href="https://example.com/credential/${String(index + 1)}">
        <span aria-hidden="true" class="credentialMark">
          ${index % 2 === 0
            ? '<span class="credentialIcon" data-slot="credential-icon" style="--credential-icon-url:url(\'/certifications/synthetic.svg\')"></span>'
            : '<img alt="" class="credentialBadge" data-slot="credential-badge" height="42" src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\'/%3E" width="42">'}
        </span>
        <span class="credentialCopy">
          <span class="credentialTitle">Synthetic cloud developer associate certification ${String(index + 1)}</span>
          <span class="credentialDate">Jan ${String(2020 + index)}</span>
        </span>
      </a>
    </li>
  `).join("");
}

/**
 * Mounts Education's production CSS around deterministic content records.
 *
 * @param page - Browser page receiving the fixture.
 * @param count - Number of credential records to render.
 */
async function mountEducation(page: Page, count: number) {
  const hasCredentials = count > 0;
  const singleColumn = count <= 2;
  await page.setContent(`<!doctype html>
    <style>
      :root {
        --border: #d8d8d8;
        --content-foreground: #333333;
        --foreground: #111111;
        --font-geist-mono: ui-monospace;
        --muted-foreground: #666666;
        --ring: #111111;
      }
      * { box-sizing: border-box; }
      body { margin: 0; }
      .fixtureShell { width: min(calc(100% - 2.75rem), 54rem); margin-inline: auto; }
      @media (min-width: 48rem) {
        .fixtureShell { width: min(calc(100% - 8rem), 54rem); }
      }
      ${educationCss}
    </style>
    <main class="fixtureShell">
      <section id="education">
        <h2 class="sectionLabel">Education</h2>
        <div class="tracks${hasCredentials ? "" : " academicOnly"}" data-slot="education-tracks">
          <div class="academic" data-slot="education-academic">
            <h3 class="trackLabel">Academic</h3>
            <p class="qualification">Bachelor of Engineering in Software Engineering</p>
            <p class="institution">National Technical University of Ukraine</p>
            <p class="academicMeta"><span>September 2019 — June 2023</span><span>·</span><span>Kyiv, Ukraine</span></p>
          </div>
          ${hasCredentials ? `
            <div class="credentials" data-slot="education-credentials">
              <h3 class="trackLabel">Professional credentials</h3>
              <div class="credentialFrame">
                <div class="credentialScrollport${count > 2 ? " peek" : ""}" data-slot="credential-scrollport">
                  <ul class="credentialList${singleColumn ? " singleColumn" : ""}" data-slot="credential-list">
                    ${credentialRows(count)}
                  </ul>
                </div>
              </div>
            </div>
          ` : ""}
        </div>
      </section>
    </main>
  `);
}

/**
 * Replaces hydrated credential rows with deterministic overflow content.
 *
 * @param page - Hydrated Home page containing the production track.
 * @param count - Number of synthetic credentials to insert.
 */
async function replaceHydratedCredentials(page: Page, count: number) {
  const list = page.locator('[data-slot="credential-list"]');
  await list.evaluate((element, rowCount) => {
    const template = element.querySelector('[data-slot="credential-item"]');
    if (!template) throw new Error("Expected one server-rendered credential as the synthetic row template");
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < rowCount; index += 1) {
      const item = template.cloneNode(true) as HTMLElement;
      const link = item.querySelector("a");
      const title = item.querySelector('[class*="credentialTitle"]');
      const date = item.querySelector('[class*="credentialDate"]');
      if (!link || !title || !date) throw new Error("Credential template is incomplete");
      link.setAttribute("href", `https://example.com/credential/${String(index + 1)}`);
      title.textContent = `Synthetic cloud developer associate certification ${String(index + 1)}`;
      date.textContent = `Jan ${String(2020 + index)}`;
      fragment.append(item);
    }
    element.replaceChildren(fragment);
    for (const className of element.classList) {
      if (className.includes("singleColumn")) element.classList.remove(className);
    }
  }, count);
}

test("desktop home content stays contained and ordered as text reflows", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");

  const sections = page.locator("main#main > section");
  expect(await sections.count()).toBeGreaterThan(1);
  const sectionBoxes = await Promise.all((await sections.all()).map(boxOf));
  for (const [index, box] of sectionBoxes.entries()) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1280);
    const next = sectionBoxes[index + 1];
    if (next) expect(box.y + box.height).toBeLessThanOrEqual(next.y + 1);
  }

  const sample = sections.locator("p").first();
  if (await sample.count()) {
    await sample.evaluate((element) => {
      element.textContent = "Synthetic readable content ".repeat(40);
    });
  }

  expect(await page.locator("html").evaluate((root) => root.scrollWidth <= root.clientWidth)).toBe(true);
  const mainBox = await boxOf(page.locator("main#main"));
  for (const section of await sections.all()) {
    const box = await boxOf(section);
    expect(box.x).toBeGreaterThanOrEqual(mainBox.x - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(mainBox.x + mainBox.width + 1);
  }
});

test("Education switches tracks and credential columns at the approved breakpoints", async ({ page }) => {
  for (const width of educationWidths) {
    await page.setViewportSize({ width, height: 900 });
    await mountEducation(page, 10);

    const academic = await boxOf(page.locator('[data-slot="education-academic"]'));
    const credentials = await boxOf(page.locator('[data-slot="education-credentials"]'));
    const columns = await page.locator('[data-slot="credential-list"]').evaluate((list) =>
      getComputedStyle(list).gridTemplateColumns.split(" ").filter(Boolean).length,
    );

    if (width >= 1024) expect(Math.abs(academic.height - credentials.height)).toBeLessThanOrEqual(1);
    expect(await page.locator('[data-slot="education-academic"]').evaluate((element) => getComputedStyle(element).paddingBottom)).toBe("0px");
    expect(Math.abs(academic.y - credentials.y) <= 1).toBe(width >= 1024);
    expect(columns).toBe(width >= 768 ? 2 : 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("Education lets Academic use the space left by credential content", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mountEducation(page, 2);

  const titles = page.locator(".credentialTitle");
  await titles.evaluateAll((elements) => {
    const [first, second] = elements;
    if (!first || !second) throw new Error("Expected two credential titles");
    first.textContent = "Credential A";
    second.textContent = "Credential B";
  });
  const academic = page.locator('[data-slot="education-academic"]');
  const credentials = page.locator('[data-slot="education-credentials"]');
  const shortAcademic = await boxOf(academic);
  const shortCredentials = await boxOf(credentials);

  await titles.first().evaluate((element) => {
    element.textContent = "Cloud Architecture Professional Certification";
  });
  const longAcademic = await boxOf(academic);
  const longCredentials = await boxOf(credentials);

  expect(shortAcademic.width).toBeGreaterThan(shortCredentials.width);
  expect(longCredentials.width).toBeGreaterThan(shortCredentials.width + 50);
  expect(longAcademic.width).toBeLessThan(shortAcademic.width - 50);
  expect(Math.abs(shortCredentials.x + shortCredentials.width - longCredentials.x - longCredentials.width)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Education omits or avoids overflow cues for zero, one, and two credentials", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await mountEducation(page, 0);
  await expect(page.locator('[data-slot="education-credentials"]')).toHaveCount(0);

  for (const count of [1, 2]) {
    await mountEducation(page, count);
    const scrollport = page.locator('[data-slot="credential-scrollport"]');
    const columns = await page.locator('[data-slot="credential-list"]').evaluate((list) =>
      getComputedStyle(list).gridTemplateColumns.split(" ").filter(Boolean).length,
    );
    const metrics = await scrollport.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));

    expect(columns).toBe(1);
    expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight + 1);
    await expect(page.locator('[data-slot="credential-item"]')).toHaveCount(count);
  }
});

test("Education keeps height bounded when credentials overflow", async ({ page }) => {
  const measuredHeights = new Map<number, number>();

  for (const width of educationWidths) {
    await page.setViewportSize({ width, height: 900 });
    for (const count of [3, 10, 20]) {
      await mountEducation(page, count);
      const scrollport = page.locator('[data-slot="credential-scrollport"]');
      const items = page.locator('[data-slot="credential-item"]');
      const viewport = await boxOf(scrollport);
      const secondItem = await boxOf(items.nth(1));
      const height = (await boxOf(page.locator('[data-slot="education-tracks"]'))).height;
      const earlierHeight = measuredHeights.get(width);

      if (earlierHeight === undefined) measuredHeights.set(width, height);
      else expect(Math.abs(earlierHeight - height)).toBeLessThanOrEqual(1);
      expect(secondItem.y + secondItem.height).toBeLessThanOrEqual(viewport.y + viewport.height + 1);
      expect(await scrollport.evaluate((element) => element.scrollHeight > element.clientHeight + 1)).toBe(true);
    }
  }
});

test("Education removes borders only from the final visual row", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  for (const count of [9, 10]) {
    await mountEducation(page, count);
    const items = page.locator('[data-slot="credential-item"]');
    const finalRowStart = count % 2 === 0 ? count - 2 : count - 1;
    for (let index = 0; index < count; index += 1) {
      await expect(items.nth(index)).toHaveCSS(
        "border-bottom-width",
        index >= finalRowStart ? "0px" : "1px",
      );
    }
  }
});

test("Education keeps icon masks and badge artwork inside the shared mark slot", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await mountEducation(page, 2);

  const icon = page.locator('[data-slot="credential-icon"]');
  const badge = page.locator('[data-slot="credential-badge"]');
  expect(await icon.evaluate((element) => getComputedStyle(element).maskImage)).toContain("synthetic.svg");
  await expect(badge).toHaveCSS("object-fit", "contain");
  expect(await badge.getAttribute("alt")).toBe("");
  const badgeBox = await boxOf(badge);
  expect(badgeBox.width).toBeCloseTo(42, 0);
  expect(badgeBox.height).toBeCloseTo(42, 0);
});

test("Education keeps enlarged credential text readable and reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await mountEducation(page, 20);
  await page.locator("html").evaluate((root) => {
    root.style.fontSize = "200%";
  });

  const scrollport = page.locator('[data-slot="credential-scrollport"]');
  const titles = page.locator(".credentialTitle");
  expect(await titles.evaluateAll((elements) =>
    elements.every((element) => element.scrollHeight <= element.clientHeight + 1),
  )).toBe(true);

  await scrollport.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const viewport = await boxOf(scrollport);
  const finalItem = await boxOf(page.locator('[data-slot="credential-item"]').last());
  expect(finalItem.y).toBeGreaterThanOrEqual(viewport.y - 1);
  expect(finalItem.y + finalItem.height).toBeLessThanOrEqual(viewport.y + viewport.height + 1);
});

test("hydrated Education preserves the approved partial-row geometry", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const failures: string[] = [];

  for (const width of educationWidths) {
    await page.setViewportSize({ width, height: 900 });
    for (const count of [3, 10, 20]) {
      await page.goto(`/?educationB1=${String(width)}-${String(count)}#education`);
      const scrollport = page.locator('[data-slot="credential-scrollport"]');
      if (await scrollport.count() === 0) {
        await expect(page.locator("#education")).toBeVisible();
        return;
      }
      await replaceHydratedCredentials(page, count);
      await expect(page.locator('[data-slot="credential-item"]')).toHaveCount(count);
      await expect(scrollport).toHaveAttribute("data-edge-fade", "end");

      const items = page.locator('[data-slot="credential-item"]');
      const viewport = await boxOf(scrollport);
      const secondItem = await boxOf(items.nth(1));
      const thirdItem = await boxOf(items.nth(2));
      const ratio = (viewport.y + viewport.height - thirdItem.y) / thirdItem.height;
      if (secondItem.y + secondItem.height > viewport.y + viewport.height + 1) {
        failures.push(`${String(width)}px/${String(count)}: second credential is clipped`);
      }
      if (ratio < 0.2 || ratio > 0.5) {
        failures.push(`${String(width)}px/${String(count)}: next credential ratio ${ratio.toFixed(3)}`);
      }
    }
  }

  expect(failures).toEqual([]);
});

test("hydrated Education updates fade cues during native keyboard scrolling", async ({ browserName, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/?educationB1=interaction#education");

  const scrollport = page.locator('[data-slot="credential-scrollport"]');
  if (await scrollport.count() === 0) {
    await expect(page.locator("#education")).toBeVisible();
    return;
  }

  const list = page.locator('[data-slot="credential-list"]');
  if (await list.locator('[data-slot="credential-item"]').count() <= 2) {
    await expect(scrollport).toHaveAttribute("data-edge-fade", "none");
    await expect(scrollport).toHaveAttribute("tabindex", "-1");
  }
  await replaceHydratedCredentials(page, 20);
  await expect(scrollport).toHaveAttribute("data-lenis-native-scroll");
  await expect(scrollport).toHaveAttribute("data-edge-fade", "end");
  await expect(scrollport).toHaveAttribute("tabindex", "0");
  await expect(list.locator('[data-slot="credential-item"]')).toHaveCount(20);
  await expect(list.locator("a").last()).toHaveAttribute("href", "https://example.com/credential/20");

  await scrollport.focus();
  await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  await expect(list.locator("a").first()).toBeFocused();

  await scrollport.evaluate((element) => {
    element.scrollTop = (element.scrollHeight - element.clientHeight) / 2;
  });
  await expect.poll(() => scrollport.getAttribute("data-edge-fade")).toBe("both");

  await scrollport.focus();
  await page.keyboard.press("End");
  await expect.poll(() => scrollport.getAttribute("data-edge-fade")).toBe("start");
  await page.keyboard.press("Home");
  await expect.poll(() => scrollport.getAttribute("data-edge-fade")).toBe("end");

  await scrollport.hover();
  const pageAtTopEdge = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, -400);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(pageAtTopEdge);

  await scrollport.focus();
  await page.keyboard.press("End");
  await scrollport.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => scrollport.getAttribute("data-edge-fade")).toBe("start");
  const pageAtBottomEdge = await page.evaluate(() => scrollY);
  await scrollport.hover();
  await page.mouse.wheel(0, 400);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(pageAtBottomEdge);

  await replaceHydratedCredentials(page, 2);
  await expect(scrollport).toHaveAttribute("data-edge-fade", "none");
  await expect(scrollport).toHaveAttribute("tabindex", "-1");
  expect(await scrollport.evaluate((element) => element.style.height)).toBe("");
});

test("Education keeps validated content available without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto("/?educationB1=no-js#education");
    await expect(page.locator("#education")).toBeVisible();
    const links = page.locator('[data-slot="credential-item"] a');
    if (await links.count() > 0) {
      await expect(links.first()).toBeVisible();
      await expect(links.first()).toHaveAttribute("href", /^https:\/\//);
    }
  } finally {
    await context.close();
  }
});
