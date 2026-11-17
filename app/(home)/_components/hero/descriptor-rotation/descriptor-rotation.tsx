"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { descriptorDwell, nextDescriptorIndex, resolveDescriptorMotion } from "./descriptor-sequence";
import styles from "./descriptor-rotation.module.scss";

/**
 * Cycles the hero headline phrases in place, easing the slot to each phrase's width.
 *
 * @param phrases - Non-empty phrase sequence; the first is server-rendered and holds longest on return.
 * @param interval - Base rotation interval in milliseconds.
 * @returns The current animated phrase.
 */
export function DescriptorRotation({ phrases, interval }: {
  phrases: readonly string[];
  interval: number;
}) {
  const [index, setIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const opening = useRef(true);
  const [widths, setWidths] = useState<readonly number[]>([]);
  const sizers = useRef<HTMLSpanElement>(null);

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
    const root = document.documentElement;

    /** Holds the rotation clock until the opening splash has released the page. */
    function updateRevealed() {
      setRevealed(root.dataset.splashPending !== "true");
    }

    updateRevealed();
    const observer = new MutationObserver(updateRevealed);
    observer.observe(root, { attributes: true, attributeFilter: ["data-splash-pending"] });
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!revealed || phrases.length < 2) return;
    const timer = window.setTimeout(() => {
      opening.current = false;
      setIndex((current) => nextDescriptorIndex(current, phrases.length));
    }, descriptorDwell(index, interval, opening.current));
    return () => {
      window.clearTimeout(timer);
    };
  }, [index, interval, phrases.length, revealed]);

  useEffect(() => {
    const measured = [...(sizers.current?.children ?? [])];

    /** Records every phrase width, which also follows responsive type changes. */
    function updateWidths() {
      setWidths(measured.map((element) => element.getBoundingClientRect().width));
    }

    const observer = new ResizeObserver(updateWidths);
    for (const element of measured) observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  const previous = (index + phrases.length - 1) % phrases.length;
  const growing = (widths[index] ?? 0) > (widths[previous] ?? 0);
  const descriptorMotion = resolveDescriptorMotion(reducedMotion, growing);

  return (
    // An explicit width is what lets CSS interpolate between phrases.
    // eslint-disable-next-line react/forbid-dom-props
    <span className={styles.stage} style={{ width: widths[index] }}>
      <span className={styles.sizers} ref={sizers}>
        {phrases.map((text) => <span key={text}>{text}</span>)}
      </span>
      <AnimatePresence key={String(reducedMotion)} initial={false} mode="sync">
        <motion.span
          animate={descriptorMotion.animate}
          className={styles.phrase}
          data-slot="hero-descriptor"
          data-text={phrases[index] ?? ""}
          exit={descriptorMotion.exit}
          initial={descriptorMotion.initial}
          key={index}
          transition={descriptorMotion.transition}
        >
          <span className={styles.sharp}>{phrases[index] ?? ""}</span>
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
