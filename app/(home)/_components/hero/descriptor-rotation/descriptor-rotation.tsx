"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  descriptorDwell,
  nextDescriptorIndex,
  reducedDescriptorMotion,
  resolveDescriptorReel,
} from "./descriptor-sequence";
import styles from "./descriptor-rotation.module.scss";

/** Rendered geometry of one phrase: its width and where each letter starts within it. */
type PhraseMeasure = { readonly width: number; readonly letters: readonly number[] };

/**
 * Splits a phrase into the user-perceived characters that roll individually.
 *
 * @param phrase - Phrase text.
 * @returns Segments with their offsets into the phrase.
 */
function phraseLetters(phrase: string) {
  return [...new Intl.Segmenter().segment(phrase)];
}

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
  const [measures, setMeasures] = useState<readonly PhraseMeasure[]>([]);
  const sizers = useRef<HTMLSpanElement>(null);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");

    /** Applies live motion preferences without resetting the rotation cadence. */
    function updateReducedMotion() {
      setReducedMotion(preference.matches);
      setMoving(false);
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
      setMoving(!reducedMotion);
      setIndex((current) => nextDescriptorIndex(current, phrases.length));
    }, descriptorDwell(index, interval, opening.current));
    return () => {
      window.clearTimeout(timer);
    };
  }, [index, interval, phrases.length, reducedMotion, revealed]);

  useEffect(() => {
    const measured = [...(sizers.current?.children ?? [])];

    /** Records every phrase's width and kerned letter positions, which also follows responsive type changes. */
    function updateMeasures() {
      const range = document.createRange();
      setMeasures(measured.map((element) => {
        const box = element.getBoundingClientRect();
        const text = element.firstChild;
        return {
          letters: text
            ? phraseLetters(element.textContent).map(({ index: start, segment }) => {
                range.setStart(text, start);
                range.setEnd(text, start + segment.length);
                return range.getBoundingClientRect().left - box.left;
              })
            : [],
          width: box.width,
        };
      }));
    }

    const observer = new ResizeObserver(updateMeasures);
    for (const element of measured) observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  const previous = (index + phrases.length - 1) % phrases.length;
  const measure = measures[index];
  const growing = (measure?.width ?? 0) > (measures[previous]?.width ?? 0);
  const reel = reducedMotion || !measure ? undefined : resolveDescriptorReel(growing);
  const phrase = phrases[index] ?? "";
  const letters = reel ? phraseLetters(phrase) : [];

  return (
    // An explicit width is what lets CSS interpolate between phrases.
    // eslint-disable-next-line react/forbid-dom-props
    <span className={styles.stage} data-moving={moving || undefined} style={{ width: measure?.width }}>
      <span className={styles.sizers} ref={sizers}>
        {phrases.map((text) => <span key={text}>{text}</span>)}
      </span>
      <AnimatePresence key={String(reducedMotion)} initial={false} mode="sync">
        {reel ? (
          <motion.span
            animate="animate"
            className={styles.phrase}
            data-slot="hero-descriptor"
            exit="exit"
            initial="initial"
            key={index}
            onAnimationComplete={(definition) => {
              if (definition === "animate") setMoving(false);
            }}
          >
            <span className={styles.plain}>{phrase}</span>
            <span className={styles.letters}>
              {letters.map(({ segment }, position) => (
                <motion.span
                  className={styles.letter}
                  custom={position / Math.max(letters.length - 1, 1)}
                  key={position}
                  style={{ left: measure?.letters[position] }}
                  variants={reel}
                >
                  {segment}
                </motion.span>
              ))}
            </span>
          </motion.span>
        ) : (
          <motion.span {...reducedDescriptorMotion} className={styles.phrase} data-slot="hero-descriptor" key={index}>
            {phrase}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
