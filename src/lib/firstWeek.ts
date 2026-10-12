import { addLocalDays, localWeekKey, parseLocalDate } from "@/lib/dateHelpers";

/**
 * A new account's first seven days, as Home's "Your first week" card
 * shows them: the few things that make the app useful, ticked as they
 * happen, and the day the first weekly recap arrives.
 *
 * It replaced a card of tab hints ("Tap Train to start a workout or
 * run"), which named buttons the tab bar already shows and said nothing
 * about what the first days are for, and which went away for good the
 * moment one session and one meal were logged.
 */

/** How long the card lasts, from the day the account began. */
export const FIRST_WEEK_DAYS = 7;
/** Weigh-ins before the trend line appears on Analytics (TrendWeight). */
export const FIRST_WEEK_WEIGH_INS = 3;

export type FirstWeekItemKey = "workout" | "run" | "meal" | "weigh-in";

export interface FirstWeekItem {
  key: FirstWeekItemKey;
  label: string;
  /** What finishing it gives, said only while it is still to do. */
  hint?: string;
  done: boolean;
  /** "1 of 3", for the one item done over several days. */
  progress?: string;
}

export interface FirstWeekInput {
  /** The day the account began ("yyyy-MM-dd"), or null when not known. */
  startKey: string | null;
  todayKey: string;
  /** The plan has lifts. */
  lifts: boolean;
  /** The person runs. */
  runs: boolean;
  workoutCount: number;
  runCount: number;
  mealCount: number;
  /** Days with a logged weight. */
  weighInCount: number;
  dismissed: boolean;
}

export interface FirstWeek {
  /** 1 on the day the account began, up to 7. */
  day: number;
  items: FirstWeekItem[];
  /** The Monday the first recap arrives, while it is still ahead and
   *  there is something for it to cover. */
  recapKey: string | null;
}

const DAY_MS = 86_400_000;

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round(
    (parseLocalDate(toKey).getTime() - parseLocalDate(fromKey).getTime()) /
      DAY_MS
  );
}

/** Which day of the account `todayKey` is: 1 on the day it began. Zero or
 *  less before it began, which only a wrong clock produces. */
export function accountDay(startKey: string, todayKey: string): number {
  return daysBetween(startKey, todayKey) + 1;
}

/**
 * The card's content, or null when it should not show: before the start
 * day is known, after the seventh day, once dismissed, or once every item
 * is done.
 */
export function firstWeek(input: FirstWeekInput): FirstWeek | null {
  if (input.dismissed || !input.startKey) return null;
  const day = accountDay(input.startKey, input.todayKey);
  if (day < 1 || day > FIRST_WEEK_DAYS) return null;

  const items: FirstWeekItem[] = [];
  if (input.lifts)
    items.push({
      key: "workout",
      label: "Finish your first workout",
      done: input.workoutCount > 0,
    });
  if (input.runs)
    items.push({
      key: "run",
      label: "Go for your first run",
      done: input.runCount > 0,
    });
  items.push({
    key: "meal",
    label: "Log your first meal",
    done: input.mealCount > 0,
  });
  const weighIns = Math.min(input.weighInCount, FIRST_WEEK_WEIGH_INS);
  items.push({
    key: "weigh-in",
    label: "Weigh in on three mornings",
    hint: "Three start your trend line",
    done: weighIns >= FIRST_WEEK_WEIGH_INS,
    progress: `${weighIns} of ${FIRST_WEEK_WEIGH_INS}`,
  });
  if (items.every((i) => i.done)) return null;

  // The recap covers the calendar week the account began in, and comes
  // the Monday after it, once that week has something in it.
  const firstRecap = localWeekKey(
    addLocalDays(parseLocalDate(input.startKey), 7)
  );
  const loggedAnything =
    input.workoutCount + input.runCount + input.mealCount > 0;
  const recapKey =
    loggedAnything && input.todayKey < firstRecap ? firstRecap : null;

  return { day, items, recapKey };
}
