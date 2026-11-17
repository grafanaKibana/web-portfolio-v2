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

/**
 * Resolves phrase motion as focus progress: the outgoing phrase defocuses before the incoming one resolves.
 *
 * @param reducedMotion - Whether the change should collapse to one brief fade.
 * @param growing - Whether the incoming phrase is wider, so it waits for the slot to open around it.
 * @returns Entry, active, exit, and transition values for one phrase.
 */
export function resolveDescriptorMotion(reducedMotion: boolean, growing: boolean) {
  if (reducedMotion) {
    return {
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      initial: { opacity: 0 },
      transition: { duration: 0.12, ease: [0.25, 0.1, 0.25, 1] as const },
    };
  }

  return {
    animate: {
      "--phrase-progress": 1,
      transition: { delay: growing ? 0.36 : 0.22, duration: 0.52, ease: [0.3, 0.5, 0.3, 1] as const },
    },
    exit: { "--phrase-progress": 0, transition: { duration: 0.22, ease: [0.4, 0, 1, 1] as const } },
    initial: { "--phrase-progress": 0 },
    transition: { duration: 0.52 },
  };
}
