import { WEEK_STARTS_ON } from "@/lib/dateHelpers";
import type { ScheduleDay } from "@/lib/scheduleUtils";

const calendarOrder = (day: number) => (day - WEEK_STARTS_ON + 7) % 7;
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
    .sort((a, b) => calendarOrder(a) - calendarOrder(b));
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
      ...choice.map(calendarOrder),
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
