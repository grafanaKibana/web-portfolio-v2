"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import { nextDescriptorIndex, resolveDescriptorMotion } from "./descriptor-sequence";
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
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");

    /** Applies live motion preferences without resetting the rotation cadence. */
    function updateReducedMotion() {
      setReducedMotion(preference.matches);
    }

    updateReducedMotion();
    preference.addEventListener("change", updateReducedMotion);
    return () => {
      preference.removeEventListener("change", updateReducedMotion);
    };
  }, []);

  useEffect(() => {
    if (descriptors.length < 2) return;
    const timer = window.setInterval(() => {
      setIndex((current) => nextDescriptorIndex(current, descriptors.length));
    }, interval);
    return () => {
      window.clearInterval(timer);
    };
  }, [descriptors.length, interval]);

  const descriptorMotion = resolveDescriptorMotion(reducedMotion);

  return (
    <span className={styles.stage}>
      <AnimatePresence key={String(reducedMotion)} initial={false} mode="sync">
        <motion.span
          animate={descriptorMotion.animate}
          className={clsx(styles.rotation, "inline-block font-mono text-xs font-medium uppercase")}
          exit={descriptorMotion.exit}
          initial={descriptorMotion.initial}
          key={index}
          transition={descriptorMotion.transition}
        >
          <span className="inline-block" data-slot="hero-descriptor">
            {descriptors[index] ?? ""}
          </span>
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
