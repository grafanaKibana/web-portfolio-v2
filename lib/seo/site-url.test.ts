import assert from "node:assert/strict";
import test from "node:test";

import { getSiteOrigin } from "./site-url";

test("site origin accepts deployment URL conventions", () => {
  for (const value of ["portfolio.example.test", "https://portfolio.example.test/", " portfolio.example.test "]) {
    assert.equal(getSiteOrigin({ VERCEL_PROJECT_PRODUCTION_URL: value }), "https://portfolio.example.test");
  }
});

test("site origin stays absent when Vercel has no production URL", () => {
  assert.equal(getSiteOrigin({}), undefined);
  assert.equal(getSiteOrigin({ VERCEL_PROJECT_PRODUCTION_URL: " " }), undefined);
});

test("site origin rejects values that are not HTTPS origins", () => {
  for (const value of [
    "http://portfolio.example.test",
    "https://portfolio.example.test/path",
    "https://user:password@portfolio.example.test",
    "https://portfolio.example.test?query=value",
    "https://portfolio.example.test#fragment",
    "not a host",
  ]) {
    assert.throws(() => getSiteOrigin({ VERCEL_PROJECT_PRODUCTION_URL: value }), /VERCEL_PROJECT_PRODUCTION_URL must be an HTTPS origin/);
  }
});
