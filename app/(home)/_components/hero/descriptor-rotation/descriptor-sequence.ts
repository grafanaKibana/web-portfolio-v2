/**
 * Advances within a descriptor sequence while keeping empty and single-item inputs stable.
 *
 * @param current - Current descriptor index.
 * @param count - Number of available descriptors.
 * @returns The next valid descriptor index.
 */
export function nextDescriptorIndex(current: number, count: number): number {
  return count > 1 ? (current + 1) % count : 0;
}

/**
 * Resolves how long one phrase stays: the lead phrase holds for two intervals, except on its opening pass.
 *
 * @param index - Index of the visible phrase.
 * @param interval - Base rotation interval in milliseconds.
 * @param opening - Whether the sequence has not advanced yet, so the first change arrives promptly.
 * @returns The dwell time in milliseconds.
 */
export function descriptorDwell(index: number, interval: number, opening: boolean): number {
  return index === 0 && !opening ? interval * 2 : interval;
}

const settle = [0.16, 1, 0.3, 1] as const;
const leave = [0.5, 0, 0.9, 0.4] as const;

/** Phrase motion under reduced motion: one brief fade with no travel. */
export const reducedDescriptorMotion = {
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  initial: { opacity: 0 },
  transition: { duration: 0.12, ease: [0.25, 0.1, 0.25, 1] as const },
};

/**
 * Resolves the reel: letters roll up and away while their successors roll in, timed by progress through the phrase.
 *
 * @param growing - Whether the incoming phrase is wider, so its letters wait for the slot to open.
 * @returns Letter variants driven by 0–1 progress through the phrase.
 */
export function resolveDescriptorReel(growing: boolean) {
  const enter = growing ? 0.36 : 0.14;

  return {
    /**
     * Rolls a letter into place; later letters in the phrase start later.
     *
     * @param progress - Position of the letter through the phrase, from 0 to 1.
     * @returns The target values and timing for that letter.
     */
    animate: (progress: number) => ({
      filter: "blur(0em)",
      opacity: 1,
      rotateX: 0,
      transformPerspective: 400,
      y: "0%",
      transition: { delay: enter + progress * 0.24, duration: 0.62, ease: settle },
    }),
    /**
     * Rolls a letter up and away; later letters in the phrase leave later.
     *
     * @param progress - Position of the letter through the phrase, from 0 to 1.
     * @returns The target values and timing for that letter.
     */
    exit: (progress: number) => ({
      filter: "blur(0.06em)",
      opacity: 0,
      rotateX: 60,
      transformPerspective: 400,
      y: "-90%",
      transition: { delay: progress * 0.14, duration: 0.3, ease: leave },
    }),
    initial: { filter: "blur(0.06em)", opacity: 0, rotateX: -60, transformPerspective: 400, y: "90%" },
  };
}
