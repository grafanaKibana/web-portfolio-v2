"use client";

import { ReactLenis } from "lenis/react";

/**
 * Lets a marked nested list scroll natively until it reaches an edge.
 *
 * @param deltaY - Vertical gesture distance.
 * @param target - Gesture target inside or outside a nested list.
 * @returns Whether Lenis should handle the gesture.
 */
function shouldUseRootScroll(deltaY: number, target: EventTarget | null) {
  if (!(target instanceof Element) || deltaY === 0) return true;
  const scrollport = target.closest<HTMLElement>("[data-lenis-native-scroll]");
  if (!scrollport) return true;
  if (deltaY > 0) return scrollport.scrollTop + scrollport.clientHeight >= scrollport.scrollHeight - 1;
  return scrollport.scrollTop <= 1;
}

/**
 * Mounts restrained document scrolling without wrapping the server-rendered shell.
 *
 * @returns The root Lenis adapter.
 */
export function SmoothScroll() {
  return (
    <ReactLenis
      root
      options={{
        lerp: 0.18,
        smoothWheel: true,
        wheelMultiplier: 1,
        syncTouch: false,
        anchors: true,
        stopInertiaOnNavigate: true,
        respectReducedMotion: true,
        autoRaf: true,
        autoResize: true,
        autoToggle: true,
        allowNestedScroll: false,
        /** Routes a wheel gesture to the root only when the nested scrollport is at its edge.
         * @param deltaY - Vertical gesture distance.
         * @param event - Native wheel event and its target.
         * @returns Whether Lenis should handle the gesture.
         */
        virtualScroll: ({ deltaY, event }) => shouldUseRootScroll(deltaY, event.target),
        orientation: "vertical",
        infinite: false,
      }}
    />
  );
}
