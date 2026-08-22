import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Combines conditional class names while resolving Tailwind conflicts.
 *
 * @param inputs - Conditional class-name values.
 * @returns The merged class-name string.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
