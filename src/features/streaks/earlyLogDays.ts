/**
 * The early-bird badge's days: distinct local days with a log before 07:00.
 *
 * early_bird counts five such days over all time, and it is the one badge
 * rule that reaches past the streak's read window. So the days it has seen
 * are kept on `streaks/data` as `earlyLogDays`, up to the five the badge
 * needs, and merged with the window's on every load: the count can only
 * grow. A document without the field predates it and is seeded once from a
 * deeper read (`useStreaks`).
 */
import { format } from "date-fns";
import { EARLY_BIRD_DAYS } from "./badgeEarning";

/** Before this local hour, a log is an early one. */
export const EARLY_HOUR = 7;

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** The local day key of a log time before 07:00, or null. */
export function earlyDayOf(
  at: { toDate(): Date } | Date | null | undefined
): string | null {
  if (!at) return null;
  try {
    const d = at instanceof Date ? at : at.toDate();
    if (Number.isNaN(d.getTime())) return null;
    return d.getHours() < EARLY_HOUR ? format(d, "yyyy-MM-dd") : null;
  } catch {
    return null;
  }
}

/** The distinct early days among some log times. */
export function earlyDaysOf(
  times: Iterable<{ toDate(): Date } | Date | null | undefined>
): string[] {
  const days = new Set<string>();
  for (const at of times) {
    const day = earlyDayOf(at);
    if (day) days.add(day);
  }
  return Array.from(days);
}

/**
 * The stored days, read defensively. `undefined` means the document has no
 * such field yet (so it is seeded); an array, even an empty one, means it
 * has been counted.
 */
export function storedEarlyDays(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(
    (v): v is string => typeof v === "string" && DAY_KEY.test(v)
  );
}

/**
 * What to keep: every distinct day from the sources, earliest first, up to
 * the badge's five. The earliest, so a kept list never changes once full.
 */
export function keptEarlyDays(
  ...sources: readonly (readonly string[] | null | undefined)[]
): string[] {
  const days = new Set<string>();
  for (const source of sources) for (const day of source ?? []) days.add(day);
  return Array.from(days).sort().slice(0, EARLY_BIRD_DAYS);
}
