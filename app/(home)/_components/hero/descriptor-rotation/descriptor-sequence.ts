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
 * Resolves descriptor motion that stays brief for reduced-motion preferences.
 *
 * @param reducedMotion - Whether translation should be removed and timing shortened.
 * @returns Entry, active, exit, and transition values for one descriptor.
 */
export function resolveDescriptorMotion(reducedMotion: boolean) {
  if (reducedMotion) {
    return {
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      initial: { opacity: 0 },
      transition: { duration: 0.12, ease: [0.25, 0.1, 0.25, 1] as const },
    };
  }

  return {
    animate: { opacity: 1, y: "0rem" },
    exit: { opacity: 0, y: "-0.875rem" },
    initial: { opacity: 0, y: "0.875rem" },
    transition: { duration: 0.58, ease: [0.22, 0.61, 0.36, 1] as const },
  };
}
