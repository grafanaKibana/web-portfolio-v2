import { expect, test } from "@playwright/test";
import { triggerAndPauseSurfaceMotion } from "./surface-motion";

/** Browser references used to verify restoration of the native animation API. */
type MotionFixtureWindow = Window & { originalAnimate: Element["animate"] };

test("captures short asynchronous morph motion and preserves unrelated animations", { tag: "@webkit" }, async ({ page }) => {
  await page.setContent('<button>Start</button><div data-chat-surface data-morph="opening"><div id="target"></div></div><div id="outside"></div>');
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Keep identity to verify restoration, without invoking the reference.
    (window as unknown as MotionFixtureWindow).originalAnimate = Element.prototype.animate;
    document.querySelector("button")?.addEventListener("click", () => {
      window.setTimeout(() => {
        document.querySelector("#outside")?.animate({ opacity: [0, 1] }, { duration: 60_000 });
        document.querySelector("#target")?.animate({ transform: ["translateY(10px)", "none"] }, { duration: 1 });
      }, 30);
    });
  });

  await triggerAndPauseSurfaceMotion(page.getByRole("button", { name: "Start" }), "#target", "transform");
  const state = await page.evaluate(() => ({
    captured: document.querySelector("#target")?.getAnimations().map((animation) => animation.playState),
    outside: document.querySelector("#outside")?.getAnimations().map((animation) => animation.playState),
    restored: Element.prototype.animate === (window as unknown as MotionFixtureWindow).originalAnimate,
  }));
  expect(state.captured).toEqual(["paused"]);
  expect(state.outside).toEqual(["running"]);
  expect(state.restored).toBe(true);
});

test("restores native animation creation when the trigger throws", { tag: "@webkit" }, async ({ page }) => {
  await page.setContent("<button>Start</button>");
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Keep identity to verify restoration, without invoking the reference.
    (window as unknown as MotionFixtureWindow).originalAnimate = Element.prototype.animate;
    const button = document.querySelector("button");
    if (!button) throw new Error("Expected synthetic trigger.");
    button.click = () => { throw new Error("Synthetic trigger failure"); };
  });

  await expect(triggerAndPauseSurfaceMotion(page.getByRole("button", { name: "Start" }), "#target", "transform"))
    .rejects.toThrow("Synthetic trigger failure");
  expect(await page.evaluate(() =>
    Element.prototype.animate === (window as unknown as MotionFixtureWindow).originalAnimate,
  )).toBe(true);
});
