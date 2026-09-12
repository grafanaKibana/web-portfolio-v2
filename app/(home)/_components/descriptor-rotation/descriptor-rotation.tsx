"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
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
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % descriptors.length);
    }, interval);
    return () => {
      window.clearInterval(timer);
    };
  }, [descriptors.length, interval]);

  return (
    <AnimatePresence key={String(reducedMotion)} initial={false} mode="wait">
      <motion.span
        key={index}
        className={clsx(styles.rotation, "inline-block font-mono text-xs font-medium uppercase")}
        initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: "0.875rem" }}
        animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: "0rem" }}
        exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: "-0.875rem" }}
        transition={{
          duration: reducedMotion ? 0.5 : 0.58,
          ease: reducedMotion ? [0.25, 0.1, 0.25, 1] : [0.22, 0.61, 0.36, 1],
        }}
      >
        <span className="text-brand-gradient inline-block" data-slot="hero-descriptor">
          {descriptors[index] ?? ""}
        </span>
      </motion.span>
    </AnimatePresence>
  );
}
