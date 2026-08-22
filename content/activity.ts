import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface ActivityMonth {
  period: string;
  value: number;
}

export type ActivitySnapshotResult =
  | { available: true; months: readonly ActivityMonth[] }
  | { available: false };

const unavailable = { available: false } as const;

/**
 * Logs an unavailable activity source without failing page rendering.
 *
 * @param source - Path to the unavailable activity snapshot.
 * @returns The shared unavailable result.
 */
function unavailableFrom(source: string): ActivitySnapshotResult {
  console.warn(`Activity snapshot unavailable: ${source}`);
  return unavailable;
}

/**
 * Loads and validates an optional twelve-month activity snapshot.
 *
 * @param source - Path to the activity snapshot JSON file.
 * @returns The sorted snapshot, or an unavailable result when loading fails.
 */
export async function loadActivitySnapshot(
  source = join(process.cwd(), "content", "activity.json"),
): Promise<ActivitySnapshotResult> {
  try {
    const input: unknown = JSON.parse(await readFile(source, "utf8"));
    if (typeof input !== "object" || input === null || Array.isArray(input)) return unavailableFrom(source);

    const months = (input as Record<string, unknown>).months;
    if (!Array.isArray(months) || months.length !== 12) return unavailableFrom(source);

    const valid = months.every((month) => {
      if (typeof month !== "object" || month === null || Array.isArray(month)) return false;
      const { period, value } = month as Record<string, unknown>;
      return typeof period === "string" && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(period) && typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
    });
    if (!valid) return unavailableFrom(source);

    const normalized = months as ActivityMonth[];
    if (new Set(normalized.map(({ period }) => period)).size !== normalized.length) {
      return unavailableFrom(source);
    }

    return { available: true, months: normalized.toSorted((left, right) => left.period.localeCompare(right.period)) };
  } catch {
    return unavailableFrom(source);
  }
}
