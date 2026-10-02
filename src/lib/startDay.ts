import {
  dateForDayOfWeek,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";

/**
 * The day an account began, as a local date key ("yyyy-MM-dd"), or null
 * when it is not known yet.
 *
 * A week that began before someone joined is not a week they missed. Home's
 * strip drew the planned days before a Friday sign-up as missed, "This week"
 * counted "0 of 4" lifts and "0 of 7" days of food, and the first recap said
 * "3 of 7 days" for someone who logged every day they had the app. The day
 * they started is where their week's counts begin.
 *
 * `createdAt` is written as a server timestamp, so until the first server
 * round-trip it is a sentinel with no `toMillis`, and reads as unknown.
 */
export function startDayKey(createdAt: unknown): string | null {
  const c = createdAt as { toMillis?: () => number } | null | undefined;
  if (!c || typeof c.toMillis !== "function") return null;
  const ms = c.toMillis();
  return Number.isFinite(ms) ? localDateString(new Date(ms)) : null;
}

/** Whether a day came before the account began. */
export function beforeStart(
  dateKey: string,
  startKey: string | null | undefined
): boolean {
  return !!startKey && dateKey < startKey;
}

/**
 * How many of a week's scheduled days of the given kinds fall on or after
 * the day the account began: the whole schedule for any week after the
 * first. The recap and the finish screen's week line count planned lifts
 * with it, as Home's "This week" does.
 */
export function scheduledDaysSinceStart(
  schedule: readonly { day?: number; type?: string }[],
  types: readonly string[],
  weekKey: string,
  startKey: string | null | undefined
): number {
  return schedule.filter(
    (s) =>
      typeof s.type === "string" &&
      types.includes(s.type) &&
      (typeof s.day !== "number" ||
        !beforeStart(dateForDayOfWeek(weekKey, s.day), startKey))
  ).length;
}

/**
 * How many days the account has existed, counting its first day as one;
 * null when the start day is not known.
 */
export function daysSinceStart(
  startKey: string | null | undefined,
  todayKey: string
): number | null {
  if (!startKey) return null;
  return (
    Math.round(
      (parseLocalDate(todayKey).getTime() -
        parseLocalDate(startKey).getTime()) /
        86_400_000
    ) + 1
  );
}
