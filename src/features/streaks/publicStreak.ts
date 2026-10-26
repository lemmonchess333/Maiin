import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The streak a public profile shows today. The count is the one the
 * person's own device last wrote, so a person who stopped opening the app
 * would show it for good. With the day it last counted, a streak whose
 * last active day is more than two days gone reads 0: the owner's own
 * today-or-yesterday rule, with a day's slack because the viewer's
 * calendar can be a day ahead of the owner's. A profile written before it
 * carried the day shows its count as stored.
 */
export function publicStreakAsOf(
  currentStreak: unknown,
  lastActiveDate: unknown,
  todayKey: string
): number {
  const count =
    typeof currentStreak === "number" && Number.isFinite(currentStreak)
      ? Math.max(0, Math.floor(currentStreak))
      : 0;
  if (typeof lastActiveDate !== "string" || !DATE_KEY.test(lastActiveDate)) {
    return count;
  }
  const oldestAlive = localDateString(
    addLocalDays(parseLocalDate(todayKey), -2)
  );
  return lastActiveDate >= oldestAlive ? count : 0;
}
