import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"] as const) {
  test(`Home keeps a shared responsive rhythm in ${theme}`, { tag: "@webkit" }, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.addInitScript((theme) => {
      localStorage.setItem("theme", theme);
      sessionStorage.setItem("portfolio-opening-splash-seen", "true");
    }, theme);
    await page.goto("/");
    const fixture = await page.evaluate(() => ({
      origin: location.origin,
      styles: [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((link) => link.href),
      htmlClass: document.documentElement.className,
      bodyClass: document.body.className,
      main: document.querySelector("main")?.outerHTML,
    }));
    const main = fixture.main;
    if (!main) throw new Error("Missing Home fixture");
    // Isolate the production markup/CSS so hydration cannot replace synthetic entries mid-measurement.
    await page.route("**/__home-spacing-fixture", (route) => route.fulfill({
      contentType: "text/html",
      body: `<html class="${fixture.htmlClass}"><head><base href="${fixture.origin}/">
        ${fixture.styles.map((href) => `<link rel="stylesheet" href="${href}">`).join("")}
        </head><body class="${fixture.bodyClass}">${main}</body></html>`,
    }));
    await page.goto("/__home-spacing-fixture");
    await page.evaluate(() => document.fonts.ready);

    // Content is deliberately replaced: spacing must not depend on portfolio copy or record counts.
    await page.locator('#experience > ol, #projects > ul, #writing ul').evaluateAll((lists) => {
      for (const list of lists) {
        const template = list.firstElementChild;
        if (!template) continue;
        const entries = Array.from({ length: 3 }, () => {
          const entry = template.cloneNode(true) as HTMLElement;
          entry.removeAttribute("data-page-motion-row");
          entry.innerHTML = '<article style="height:48px">Synthetic entry</article>';
          return entry;
        });
        list.replaceChildren(...entries);
      }
    });

    for (const width of [390, 767, 768, 1023, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const measured = await page.evaluate(() => {
        const sectionIds = ["about", "experience", "education", "skills", "projects", "code", "writing", "contact"];
        const sections = sectionIds.map((id) => {
          const section = document.getElementById(id);
          if (!section) throw new Error(`Missing Home section: ${id}`);
          return section;
        });
        const headers = sections.filter((section) => section.id !== "about" && section.id !== "contact").map((section) => {
          const header = section.id === "code" ? section.querySelector("#code-heading")?.parentElement
            : section.querySelector("h2");
          if (!header) throw new Error(`Missing section header: ${section.id}`);
          return header;
        });
        const lists = [...document.querySelectorAll('#experience > ol, #projects > ul, #writing ul')];
        return {
          rootSize: parseFloat(getComputedStyle(document.documentElement).fontSize),
          contained: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          sections: sections.map((section) => {
            const style = getComputedStyle(section);
            return [parseFloat(style.paddingTop), parseFloat(style.paddingBottom)];
          }),
          headers: headers.map((header) => {
            const style = getComputedStyle(header);
            return [parseFloat(style.paddingTop), parseFloat(style.marginBottom)];
          }),
          separations: lists.flatMap((list) => [...list.children].slice(1).map((entry) => {
            const previous = entry.previousElementSibling?.querySelector("article");
            const current = entry.querySelector("article");
            if (!previous || !current) throw new Error("Missing synthetic entry");
            const end = previous.getBoundingClientRect().bottom;
            const start = current.getBoundingClientRect().top;
            return start - end - parseFloat(getComputedStyle(entry).borderTopWidth);
          })),
        };
      });
      const spacious = width >= 1024;
      const interval = measured.rootSize * (spacious ? 3 : 2);
      expect(measured.contained).toBe(true);
      for (const sides of measured.sections) expect(sides).toEqual([interval, interval]);
      for (const header of measured.headers) {
        expect(header).toEqual([0, measured.rootSize * (spacious ? 2.5 : 2)]);
      }
      for (const separation of measured.separations) expect(separation).toBeCloseTo(interval, 1);
    }
  });
}
