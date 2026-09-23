import assert from "node:assert/strict";
import test from "node:test";

import { credentialEdgeFade } from "./credential-edge-fade";

test("credential fade exposes the end cue at the top of overflowing content", () => {
  assert.deepEqual(credentialEdgeFade(0, 100, 240), { fade: "end", overflow: true });
});

test("credential fade exposes both cues in the middle of overflowing content", () => {
  assert.deepEqual(credentialEdgeFade(70, 100, 240), { fade: "both", overflow: true });
});

test("credential fade exposes the start cue at the bottom of overflowing content", () => {
  assert.deepEqual(credentialEdgeFade(140, 100, 240), { fade: "start", overflow: true });
});

test("credential fade exposes no cue when all content is visible", () => {
  assert.deepEqual(credentialEdgeFade(0, 100, 100), { fade: "none", overflow: false });
});
