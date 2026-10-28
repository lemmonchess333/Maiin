/**
 * When a lift started, as the lifter says it on the finish screen (Mob2
 * call 12, Lift3 STATUS): for a session recorded late, earlier today or on
 * a past day. A session is still dated by when it started (Lift3); this
 * lets the lifter say when that was, and every reader of the start reads
 * the stated one, as it reads any start (`liftSessionDay`).
 *
 * The start is never later than now, and never before the account began.
 * A programme day's start also stays in the plan's week: finishing one
 * marks that week's day done, so a start in the week before would put the
 * workout in one week (every count by its date) and the done day in
 * another. A routine and an empty workout move no plan, so they can go
 * back as far as the account. A session that began before the floor, a
 * draft resumed across it, keeps its own start among the choices.
 */
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";
import {
  formatShortWeekdayDayMonth,
  formatTimeOfDay,
} from "@/utils/formatters";

export interface StartBounds {
  /** The earliest the start can be, in ms. */
  earliest: number;
  /** The latest: now, in ms. */
  latest: number;
}

/** How far back a session's start can be said to be. Without a known
 *  account start, it can be earlier today only. */
export function startBounds({
  now,
  startedAt,
  accountStart,
  planWeek,
}: {
  now: number;
  /** The session's start as it stands. */
  startedAt: number;
  accountStart: number | null;
  /** A programme day: the start stays in the plan's week. */
  planWeek: boolean;
}): StartBounds {
  const floors = [
    accountStart ?? parseLocalDate(localDateString(new Date(now))).getTime(),
  ];
  if (planWeek)
    floors.push(parseLocalDate(localWeekKey(new Date(now))).getTime());
  return {
    earliest: Math.min(Math.max(...floors), startedAt),
    latest: now,
  };
}

/** The days a start can be on, newest first, as "yyyy-MM-dd". */
export function startDays(bounds: StartBounds): string[] {
  const first = localDateString(new Date(bounds.earliest));
  const days: string[] = [];
  let day = localDateString(new Date(bounds.latest));
  // A day a step, at most a few years of them.
  for (let guard = 0; guard < 4000 && day >= first; guard++) {
    days.push(day);
    day = localDateString(addLocalDays(parseLocalDate(day), -1));
  }
  return days;
}

/** A start's day as the finish screen says it: "Today", "Yesterday", or
 *  "Mon 26 Oct", with its year when that is not this one. */
export function startDayName(day: Date, todayKey: string): string {
  const key = localDateString(day);
  if (key === todayKey) return "Today";
  const yesterday = localDateString(addLocalDays(parseLocalDate(todayKey), -1));
  if (key === yesterday) return "Yesterday";
  const name = formatShortWeekdayDayMonth(day);
  return key.slice(0, 4) === todayKey.slice(0, 4)
    ? name
    : `${name} ${key.slice(0, 4)}`;
}

/** "Today · 18:30": a start, as the finish screen shows it. */
export function startLabel(startedAt: number, todayKey: string): string {
  const at = new Date(startedAt);
  return `${startDayName(at, todayKey)} · ${formatTimeOfDay(at)}`;
}

/** The moment of a day and a time of day ("18:30" as 18 and 30). */
export function startAt(dayKey: string, hour: number, minute: number): number {
  const at = parseLocalDate(dayKey);
  at.setHours(hour, minute, 0, 0);
  return at.getTime();
}

/** What is wrong with a start, or null when it can be used. Minutes are
 *  what the lifter picks, so a start in the current minute is now. */
export function startProblem(
  at: number,
  bounds: StartBounds
): "later-than-now" | "before-the-floor" | null {
  const minute = (ms: number) => Math.floor(ms / 60_000);
  if (minute(at) > minute(bounds.latest)) return "later-than-now";
  if (minute(at) < minute(bounds.earliest)) return "before-the-floor";
  return null;
}
