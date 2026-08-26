import assert from "node:assert/strict";
import test from "node:test";

import robots from "../app/robots";
import sitemap from "../app/sitemap";
import { getSiteOrigin } from "../content/site-url";

test("site origin accepts deployment URL conventions", () => {
  assert.equal(getSiteOrigin({ NEXT_PUBLIC_SITE_URL: "https://portfolio.example.test/" }), "https://portfolio.example.test");
  assert.equal(getSiteOrigin({ VERCEL_PROJECT_PRODUCTION_URL: "portfolio.example.test" }), "https://portfolio.example.test");
  assert.equal(getSiteOrigin({}), undefined);
});

test("site origin rejects values that are not HTTPS origins", () => {
  for (const value of ["http://portfolio.example.test", "https://portfolio.example.test/path", "not a host"]) {
    assert.throws(() => getSiteOrigin({ NEXT_PUBLIC_SITE_URL: value }), /must be an HTTPS origin/);
  }
});

test("metadata routes include every known static content route", () => {
  const previous = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = "https://portfolio.example.test";

  try {
    assert.deepEqual(sitemap().map(({ url }) => url), [
      "https://portfolio.example.test",
      "https://portfolio.example.test/articles",
      "https://portfolio.example.test/projects",
      "https://portfolio.example.test/articles/building-an-llm-evaluation-harness",
      "https://portfolio.example.test/articles/fixing-bugs-with-mcps",
      "https://portfolio.example.test/articles/microsoft-agent-framework-setup",
      "https://portfolio.example.test/projects/devbook",
      "https://portfolio.example.test/projects/latex-cv",
      "https://portfolio.example.test/projects/lifeos",
      "https://portfolio.example.test/projects/obsidian-colsdown",
      "https://portfolio.example.test/projects/obsidian-tabsdown",
      "https://portfolio.example.test/projects/quartz-tabsdown",
      "https://portfolio.example.test/projects/web-portfolio-v1",
      "https://portfolio.example.test/projects/web-portfolio-v2",
    ]);
    assert.equal(robots().sitemap, "https://portfolio.example.test/sitemap.xml");
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previous;
  }
});
