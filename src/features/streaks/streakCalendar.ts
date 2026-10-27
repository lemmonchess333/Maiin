import {
  addLocalDays,
  localDateString,
  parseLocalDate,
  WEEK_STARTS_ON,
} from "@/lib/dateHelpers";
import { formatMonth, formatWeekdayDayMonth } from "@/utils/formatters";

/**
 * The streak sheet's month (Mob1 call 4): each day of a month marked as
 * logged, covered or neither.
 *
 * "Logged" is the streak's own active day (`computeActiveDateSet`): a
 * workout, a valid run or a meal with something in it. The streak counts
 * all three, so a calendar marking only the trained days would show
 * gaps inside a streak that has none. "Covered" is a day the grace
 * bridged inside the current streak (`bridgedDates`, Streak1): never more
 * than one in seven, and shown only after the fact. A day still to come,
 * and today before anything is logged, carry no mark: the sheet never
 * says a streak is at risk.
 */
export type StreakDayState = "logged" | "covered" | "none" | "ahead";

export interface StreakCalendarDay {
  key: string;
  /** The day of the month, 1 to 31. */
  date: number;
  state: StreakDayState;
  isToday: boolean;
  /** What a screen reader says for the day: "Monday 19 October, logged". */
  label: string;
}

export interface StreakMonth {
  /** "October 2026". */
  title: string;
  /** Empty cells before the 1st, for a week that starts on Monday. */
  leadingBlanks: number;
  days: StreakCalendarDay[];
}

const STATE_WORDS: Record<StreakDayState, string> = {
  logged: "logged",
  covered: "covered",
  none: "nothing logged",
  ahead: "",
};

/** The first of the month holding `dayKey`. */
export function monthOf(dayKey: string): Date {
  const d = parseLocalDate(dayKey);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** The earliest month the streak can show: its reads reach back
 *  `windowDays` (`STREAK_WINDOW_DAYS`), and nothing older is known. */
export function earliestStreakMonth(
  todayKey: string,
  windowDays: number
): Date {
  return monthOf(
    localDateString(addLocalDays(parseLocalDate(todayKey), -windowDays))
  );
}

export function streakMonth(
  month: Date,
  logged: ReadonlySet<string>,
  covered: readonly string[],
  todayKey: string
): StreakMonth {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const length = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0
  ).getDate();
  const coveredSet = new Set(covered);
  const days: StreakCalendarDay[] = [];
  for (let date = 1; date <= length; date++) {
    const d = new Date(first.getFullYear(), first.getMonth(), date);
    const key = localDateString(d);
    const isToday = key === todayKey;
    const state: StreakDayState = logged.has(key)
      ? "logged"
      : coveredSet.has(key)
        ? "covered"
        : key >= todayKey
          ? "ahead"
          : "none";
    const name = `${formatWeekdayDayMonth(d)}${isToday ? ", today" : ""}`;
    days.push({
      key,
      date,
      state,
      isToday,
      label: STATE_WORDS[state] ? `${name}, ${STATE_WORDS[state]}` : name,
    });
  }
  return {
    title: `${formatMonth(first)} ${first.getFullYear()}`,
    leadingBlanks: (first.getDay() - WEEK_STARTS_ON + 7) % 7,
    days,
  };
}

/**
 * The one sentence of reassurance, after the fact (Streak1's
 * Visibility clause): yesterday's covered rest day in Streak1's own
 * words, otherwise the latest covered day this streak holds. Null with
 * none.
 */
export function coveredDayLine(
  covered: readonly string[],
  streak: number,
  todayKey: string
): string | null {
  if (covered.length === 0 || streak <= 0) return null;
  const latest = [...covered].sort().at(-1)!;
  const yesterday = localDateString(addLocalDays(parseLocalDate(todayKey), -1));
  if (latest === yesterday)
    return `Yesterday's rest day is covered. Still on a ${streak}-day streak.`;
  return `${formatWeekdayDayMonth(parseLocalDate(latest))} was a rest day, and it's covered.`;
}
