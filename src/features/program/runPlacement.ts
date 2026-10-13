import { weekPosition } from "@/lib/dateHelpers";
import type { ScheduleDay } from "@/lib/scheduleUtils";

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
}: {
  availableDays: readonly number[];
  longDay: number;
  count: 1 | 2;
  weekSchedule: readonly ScheduleDay[];
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
    const demanding = [longDay, ...choice];
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
  const clear = days.find((day) =>
    demandingDays.every((other) => gap(day, other) > 1)
  );
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

/** The weekday a plan's long run falls on, the race and structured plans'
 *  one picker, or null for a week with no run day. Lift13: a new plan's
 *  lift order keeps its heaviest leg session off the day before it. */
export function longRunDayOf(
  weekSchedule: ReadonlyArray<{ day: number; type: string }>
): number | null {
  const runDays = weekSchedule
    .filter((d) => d.type === "run" || d.type === "both")
    .map((d) => d.day);
  return runDays.length > 0 ? pickLongRunSlot(runDays, weekSchedule) : null;
}
