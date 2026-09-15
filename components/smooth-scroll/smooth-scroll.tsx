"use client";

import { ReactLenis } from "lenis/react";

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
        orientation: "vertical",
        infinite: false,
      }}
    />
  );
}
