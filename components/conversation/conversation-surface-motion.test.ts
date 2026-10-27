import assert from "node:assert/strict";
import test from "node:test";
import { panelElevationFrames, panelGeometry } from "./conversation-surface-motion";

const bounds = { left: 100, top: 200, right: 900, bottom: 800 };

for (const fixture of [
  { name: "inset composer", visible: { left: 124, top: 736, right: 876, bottom: 776 },
    clipPath: "polygon(24px 536px, 776px 536px, 776px 576px, 24px 576px)",
    insets: { top: 536, right: 24, bottom: 24, left: 24 } },
  { name: "full panel", visible: bounds,
    clipPath: "polygon(0px 0px, 800px 0px, 800px 600px, 0px 600px)",
    insets: { top: 0, right: 0, bottom: 0, left: 0 } },
  { name: "fractional overhang", visible: { left: 97.5, top: 198.25, right: 902.75, bottom: 805.5 },
    clipPath: "polygon(-2.5px -1.75px, 802.75px -1.75px, 802.75px 605.5px, -2.5px 605.5px)",
    insets: { top: -1.75, right: -2.75, bottom: -5.5, left: -2.5 } },
]) {
  test(`panel clipping and shadow describe the same ${fixture.name} rectangle`, () => {
    assert.deepEqual(panelGeometry(bounds, fixture.visible), { clipPath: fixture.clipPath, insets: fixture.insets });
  });
}

const collapsed = { top: 536, right: 24, bottom: 24, left: 24 };
const opening = { top: ["536px", "0px"], right: ["24px", "0px"], bottom: ["24px", "0px"], left: ["24px", "0px"], opacity: [0, 1] };

test("panel shadow opens from the composer and closes back to the same rectangle", () => {
  assert.deepEqual(panelElevationFrames(collapsed, "opening", null), opening);
  assert.deepEqual(panelElevationFrames(collapsed, "closing", null), Object.fromEntries(
    Object.entries(opening).map(([property, values]) => [property, [...values].reverse()]),
  ));
});

for (const phase of ["opening", "closing"] as const) {
  test(`interrupted ${phase} keeps the current shadow geometry and opacity`, () => {
    const previous = { top: "10.25px", right: "8.5px", bottom: "17.75px", left: "9.25px", opacity: 0.42 };
    const frames = panelElevationFrames(collapsed, phase, previous);
    for (const side of ["top", "right", "bottom", "left"] as const) {
      assert.equal(frames[side][0], previous[side]);
      assert.equal(frames[side][1], phase === "opening" ? "0px" : `${String(collapsed[side])}px`);
    }
    assert.deepEqual(frames.opacity, [0.42, phase === "opening" ? 1 : 0]);
  });
}
