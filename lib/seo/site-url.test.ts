import assert from "node:assert/strict";
import test from "node:test";

import { getSiteOrigin } from "./site-url";

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

test("an explicit site origin overrides the provider hostname consistently", () => {
  assert.equal(getSiteOrigin({
    NEXT_PUBLIC_SITE_URL: " https://canonical.example.test/ ",
    VERCEL_PROJECT_PRODUCTION_URL: "previous.example.test",
  }), "https://canonical.example.test");
  assert.equal(getSiteOrigin({
    NEXT_PUBLIC_SITE_URL: " ",
    VERCEL_PROJECT_PRODUCTION_URL: "previous.example.test",
  }), "https://previous.example.test");
  assert.throws(() => getSiteOrigin({
    NEXT_PUBLIC_SITE_URL: "https://canonical.example.test/path",
    VERCEL_PROJECT_PRODUCTION_URL: "previous.example.test",
  }), /NEXT_PUBLIC_SITE_URL must be an HTTPS origin/);
});
