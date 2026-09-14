import assert from "node:assert/strict";
import test from "node:test";

import { getSiteOrigin } from "../content/site-url";
import { buildRobots, buildSitemap } from "../lib/metadata-routes";

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

test("metadata builders combine static routes with supplied content slugs", () => {
  const origin = "https://portfolio.example.test";
  const urls = buildSitemap(origin, {
    articleSlugs: ["first-article", "second-article"],
    projectSlugs: ["sample-project"],
  }).map(({ url }) => url);

  assert.deepEqual(urls, [
    origin,
    `${origin}/accessibility`,
    `${origin}/articles`,
    `${origin}/for-robots`,
    `${origin}/privacy`,
    `${origin}/projects`,
    `${origin}/terms`,
    `${origin}/articles/first-article`,
    `${origin}/articles/second-article`,
    `${origin}/projects/sample-project`,
  ]);
  assert.deepEqual(buildRobots(origin), {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${origin}/sitemap.xml`,
  });
});

test("metadata builders omit deployment URLs when no origin is configured", () => {
  assert.deepEqual(buildSitemap(undefined, {
    articleSlugs: ["unused-article"],
    projectSlugs: ["unused-project"],
  }), []);
  assert.deepEqual(buildRobots(undefined), {
    rules: { userAgent: "*", allow: "/" },
    sitemap: undefined,
  });
});
