"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import styles from "./descriptor-rotation.module.scss";

/**
 * Rotates the YAML-authored hero descriptors at the reference cadence.
 *
 * @param descriptors - Non-empty descriptor sequence.
 * @param interval - Rotation interval in milliseconds.
 * @returns The current animated descriptor.
 */
export function DescriptorRotation({ descriptors, interval }: {
  descriptors: readonly string[];
  interval: number;
}) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"entering" | "exiting">("entering");
  const phaseClass = phase === "entering" ? styles.entering : styles.exiting;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPhase("exiting");
    }, interval);
    return () => {
      window.clearInterval(timer);
    };
  }, [interval]);

  return (
    <span className="inline-grid">
      <span
        key={`${String(index)}-${phase}`}
        className={clsx(styles.label, phaseClass, "col-start-1 row-start-1 inline-block font-mono text-xs font-medium uppercase text-primary-text")}
        data-slot="hero-descriptor"
        data-state={phase}
        onAnimationEnd={() => {
          if (phase !== "exiting") return;
          setIndex((current) => (current + 1) % descriptors.length);
          setPhase("entering");
        }}
      >
        {descriptors[index] ?? ""}
      </span>
    </span>
  );
}
