"use client";

import { useEffect, useState } from "react";

const descriptors = [
  "AI Engineer",
  "Software Developer",
  "UI Design Enthusiast",
  "Open Source Contributor",
] as const;

/**
 * Rotates the hero descriptor briefly unless reduced motion is requested.
 *
 * @returns The current hero descriptor.
 */
export function DescriptorRotation() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const deadline = performance.now() + 5_000;
    const timer = window.setInterval(
      () => {
        if (performance.now() >= deadline) {
          window.clearInterval(timer);
          return;
        }
        setIndex((current) => (current + 1) % descriptors.length);
      },
      2_000,
    );

    return () => window.clearInterval(timer);
  }, []);

  return (
    <span
      key={index}
      className="hero-descriptor"
    >
      {descriptors[index]}
    </span>
  );
}
