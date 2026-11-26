import { weekPosition } from "@/lib/dateHelpers";

const gap = (a: number, b: number) =>
  Math.min(Math.abs(a - b), 7 - Math.abs(a - b));

/** Rank the existing quality slots without changing the requested dose.
 * The long run repeats across the week boundary, so Sunday/Monday count
 * as neighbours here. Actual one-off moves use dates instead.
 */
export function chooseQualityRunSlots({
  availableDays,
  longDay,
  count,
  weekSchedule,
  otherDemanding = [],
}: {
  availableDays: readonly number[];
  longDay: number;
  count: 1 | 2;
  weekSchedule: ReadonlyArray<{ day: number; type: string }>;
  /** Run26 (2): other demanding days the week already holds (an ultra's
   *  back-to-back run), kept apart from as the long run is. */
  otherDemanding?: readonly number[];
}): number[] {
  const days = [...new Set(availableDays)]
    .filter(
      (day) => Number.isInteger(day) && day >= 0 && day <= 6 && day !== longDay
    )
    .sort((a, b) => weekPosition(a) - weekPosition(b));
  if (!days.length) return [];
  const options =
    count === 2 && days.length >= 2
      ? days.flatMap((day, i) => days.slice(i + 1).map((other) => [day, other]))
      : days.map((day) => [day]);
  const score = (choice: number[]) => {
    const demanding = [longDay, ...otherDemanding, ...choice];
    const gaps = demanding.flatMap((day, i) =>
      demanding.slice(i + 1).map((other) => gap(day, other))
    );
    return [
      gaps.filter((distance) => distance === 1).length,
      choice.filter(
        (day) => weekSchedule.find((slot) => slot.day === day)?.type === "both"
      ).length,
      -Math.min(...gaps),
      ...choice.map(weekPosition),
    ];
  };
  options.sort((a, b) => {
    const left = score(a);
    const right = score(b);
    for (let i = 0; i < left.length; i++) {
      if (left[i] !== right[i]) return left[i] - right[i];
    }
    return 0;
  });
  return options[0];
}

/** The week's easy days in the order the plan fills them: the first takes
 *  the medium-long run, the next the strides. A medium-long run of an hour
 *  or more is demanding (Run20), so it takes the first easy day that isn't
 *  beside the long run or a quality session, where there is one; otherwise
 *  the week keeps its own order, since the days are the person's.
 */
/** Whether `day` has a day between it and each of `others` (the week
 *  wraps, as `gap` holds it). */
export function clearOf(day: number, others: readonly number[]): boolean {
  return others.every((other) => gap(day, other) > 1);
}

export function easyDaysInFillOrder({
  easyDays,
  demandingDays,
  mediumLongDemanding,
}: {
  easyDays: readonly number[];
  demandingDays: readonly number[];
  mediumLongDemanding: boolean;
}): number[] {
  const days = [...easyDays];
  if (!mediumLongDemanding || days.length < 2) return days;
  const clear = days.find((day) => clearOf(day, demandingDays));
  if (clear === undefined || clear === days[0]) return days;
  return [clear, ...days.filter((day) => day !== clear)];
}

/** Pick a long-run slot from available run-eligible day indices.
 *  Stress-aware: prefer single-modality "run" slots over "both"
 *  slots so the hardest session isn't paired with a lift day by
 *  default. Falls back to any available slot (with the same
 *  weekend bias as V1) when no run-only slots exist. */
export function pickLongRunSlot(
  runEligibleSlots: number[],
  weekSchedule: ReadonlyArray<{ day: number; type: string }>
): number {
  // Categorise: run-only (no lift on that day) vs both (lift+run)
  const runOnlySlots = runEligibleSlots.filter(
    (d) => weekSchedule[d]?.type === "run"
  );
  const bothSlots = runEligibleSlots.filter(
    (d) => weekSchedule[d]?.type === "both"
  );

  // Preference: weekend run-only > any run-only > weekend both > any both
  const weekendRunOnly = runOnlySlots.find((d) => d === 0 || d === 6);
  if (weekendRunOnly !== undefined) return weekendRunOnly;
  if (runOnlySlots.length > 0) return runOnlySlots[0];
  const weekendBoth = bothSlots.find((d) => d === 0 || d === 6);
  if (weekendBoth !== undefined) return weekendBoth;
  return bothSlots[0] ?? runEligibleSlots[0];
}

/** The week's run days, lifting or not, in the schedule's order. */
function runDaysOf(
  weekSchedule: ReadonlyArray<{ day: number; type: string }>
): number[] {
  return weekSchedule
    .filter((d) => d.type === "run" || d.type === "both")
    .map((d) => d.day);
}

/** The weekday a plan's long run falls on, the race and structured plans'
 *  one picker, or null for a week with no run day. Lift13: a new plan's
 *  lift order keeps its heaviest leg session off the day before it. */
export function longRunDayOf(
  weekSchedule: ReadonlyArray<{ day: number; type: string }>
): number | null {
  const runDays = runDaysOf(weekSchedule);
  return runDays.length > 0 ? pickLongRunSlot(runDays, weekSchedule) : null;
}

/**
 * Run26 (2): the day an ultra's back-to-back run takes, beside the long
 * run: a weekend day where the one beside it is, else the day after, else
 * the day before. A run day with no lifting only, as the long run's own
 * pick prefers (`pickLongRunSlot`); null when neither neighbour is one.
 */
export function backToBackSlotOf(
  longSlot: number,
  slots: readonly number[],
  weekSchedule: ReadonlyArray<{ day: number; type: string }>
): number | null {
  const after = (longSlot + 1) % 7;
  const before = (longSlot + 6) % 7;
  const open = [after, before].filter(
    (d) =>
      slots.includes(d) &&
      weekSchedule.find((day) => day.day === d)?.type === "run"
  );
  return open.find((d) => d === 0 || d === 6) ?? open[0] ?? null;
}

/** Run26 (2): the weekday an ultra plan's back-to-back run falls on, beside
 *  the long run (`longRunDayOf`), or null: no run day, or no day beside
 *  the long run to take it. The run plan's own pick. */
export function backToBackDayOf(
  weekSchedule: ReadonlyArray<{ day: number; type: string }>
): number | null {
  const longDay = longRunDayOf(weekSchedule);
  return longDay === null
    ? null
    : backToBackSlotOf(longDay, runDaysOf(weekSchedule), weekSchedule);
}

/**
 * Run27 (19): the weekdays a plan's long runs fall on, as the lifting
 * reads them: the long run's (`longRunDayOf`) and, in a plan whose weekend
 * holds an ultra's back-to-back runs (`weekendHoldsBackToBacks`), the
 * back-to-back's beside it (`backToBackDayOf`). A new plan's lift order
 * keeps its heaviest leg session off the day before each (Lift13). Empty
 * for a week with no run day.
 */
export function longRunDaysOf(
  weekSchedule: ReadonlyArray<{ day: number; type: string }>,
  backToBacks: boolean
): number[] {
  const longDay = longRunDayOf(weekSchedule);
  if (longDay === null) return [];
  const pair = backToBacks ? backToBackDayOf(weekSchedule) : null;
  return pair === null ? [longDay] : [longDay, pair];
}

/**
 * The weekdays a plan's quality run(s) fall on (tempo / intervals), using
 * `chooseQualityRunSlots` on the non-long run days. Requires at least 2 run
 * days; picks 2 quality slots when the week holds 5+ run days, else 1.
 */
export function qualityRunDaysOf(
  weekSchedule: ReadonlyArray<{ day: number; type: string }>,
  backToBacks = false
): number[] {
  const runDays = runDaysOf(weekSchedule);
  if (runDays.length < 2) return [];
  const longDay = longRunDayOf(weekSchedule);
  if (longDay === null) return [];
  const pair = backToBacks ? backToBackDayOf(weekSchedule) : null;
  const availableDays = runDays.filter((d) => d !== longDay && d !== pair);
  if (availableDays.length === 0) return [];
  const count: 1 | 2 = runDays.length >= 5 ? 2 : 1;
  return chooseQualityRunSlots({
    availableDays,
    longDay,
    count,
    weekSchedule,
    otherDemanding: pair !== null ? [pair] : [],
  });
}
