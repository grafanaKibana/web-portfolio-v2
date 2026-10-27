import type { PanelElevationKeyframes, PanelElevationSnapshot, PanelGeometry, PanelInsets, SurfaceMorphPhase } from "./conversation.models";

/** Derives clipping and shadow insets from one rectangle relative to the natural panel.
 * @param bounds - Natural panel edges in screen coordinates.
 * @param visible - Visible panel edges in screen coordinates, including any overhang.
 * @returns Equivalent clip polygon and shadow insets without rounding geometry.
 */
export function panelGeometry(bounds: Pick<DOMRectReadOnly, "top" | "right" | "bottom" | "left">,
  visible: Pick<DOMRectReadOnly, "top" | "right" | "bottom" | "left">): PanelGeometry {
  const left = visible.left - bounds.left;
  const right = visible.right - bounds.left;
  const top = visible.top - bounds.top;
  const bottom = visible.bottom - bounds.top;
  return {
    clipPath: `polygon(${String(left)}px ${String(top)}px, ${String(right)}px ${String(top)}px, ${String(right)}px ${String(bottom)}px, ${String(left)}px ${String(bottom)}px)`,
    insets: { top, right: bounds.right - bounds.left - right, bottom: bounds.bottom - bounds.top - bottom, left },
  };
}

/** Builds explicit panel-shadow keyframes from shared geometry and any interrupted state.
 * @param collapsed - Shadow insets for the composer-sized panel.
 * @param phase - Direction of the panel reveal.
 * @param previous - Interrupted shadow geometry and opacity.
 * @returns Complete inset and opacity pairs on the panel's animation clock.
 */
export function panelElevationFrames(collapsed: PanelInsets, phase: SurfaceMorphPhase, previous: PanelElevationSnapshot | null): PanelElevationKeyframes {
  const opening = phase === "opening";
  return {
    top: [previous?.top ?? (opening ? `${String(collapsed.top)}px` : "0px"), opening ? "0px" : `${String(collapsed.top)}px`],
    right: [previous?.right ?? (opening ? `${String(collapsed.right)}px` : "0px"), opening ? "0px" : `${String(collapsed.right)}px`],
    bottom: [previous?.bottom ?? (opening ? `${String(collapsed.bottom)}px` : "0px"), opening ? "0px" : `${String(collapsed.bottom)}px`],
    left: [previous?.left ?? (opening ? `${String(collapsed.left)}px` : "0px"), opening ? "0px" : `${String(collapsed.left)}px`],
    opacity: [previous?.opacity ?? (opening ? 0 : 1), opening ? 1 : 0],
  };
}

/** Captures shadow values before cancellation clears the current animation's inline styles.
 * @param element - Current panel-shadow layer.
 * @returns A detached snapshot of its insets and opacity.
 */
export function readPanelElevation(element: HTMLElement): PanelElevationSnapshot {
  const style = getComputedStyle(element);
  return { top: style.top, right: style.right, bottom: style.bottom, left: style.left, opacity: Number.parseFloat(style.opacity) };
}
