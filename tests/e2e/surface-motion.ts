import { expect, type Locator } from "@playwright/test";

/**
 * Pauses conversation animations at creation so delayed frames cannot finish them before sampling.
 *
 * @param control - Enabled control that starts the surface transition.
 * @param selector - Animated element whose creation confirms the required transition.
 * @param property - Keyframe property identifying the transition to capture.
 */
export async function triggerAndPauseSurfaceMotion(
  control: Locator,
  selector: string,
  property: "clipPath" | "transform",
): Promise<void> {
  await expect(control).toBeEnabled();
  await control.evaluate(async (element, target) => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- The interceptor preserves the native Element receiver.
    const animate = Element.prototype.animate;
    let timer: number | undefined;
    const started = new Promise<void>((resolve, reject) => {
      timer = window.setTimeout(() => {
        reject(new Error(`Expected surface animation for ${target.selector} (${target.property}) within five seconds.`));
      }, 5_000);

      /** Pauses morph-owned animations and records creation of the required transition.
       * @param keyframes - Native animation keyframes.
       * @param options - Native animation timing options.
       * @returns The original animation, paused when owned by the surface morph.
       */
      Element.prototype.animate = function captureSurfaceAnimation(this: Element, keyframes, options) {
        const animation = animate.call(this, keyframes, options);
        if (this.closest("[data-chat-surface][data-morph]")) {
          animation.pause();
          if (this.matches(target.selector)
            && animation.effect instanceof KeyframeEffect
            && animation.effect.getKeyframes().some((frame) => frame[target.property] !== undefined)) {
            resolve();
          }
        }
        return animation;
      };
    });

    try {
      (element as HTMLElement).click();
      await started;
    } finally {
      Element.prototype.animate = animate;
      window.clearTimeout(timer);
    }
  }, { selector, property });
}
