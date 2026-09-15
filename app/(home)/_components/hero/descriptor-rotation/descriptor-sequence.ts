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
