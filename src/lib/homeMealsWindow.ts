import { ACTIVATION_WINDOW_DAYS } from "./activationFraming";
import { addLocalDays, localDateString } from "./dateHelpers";
import { weekDays } from "./trainingWeek";

/**
 * The days of meals Home reads: the current week, which is all the strip,
 * the day peek, today's totals and the week's count show. In an account's
 * first fortnight the window reaches back to the day it began, because the
 * first-meal prompt and the first-week card ask whether any meal has been
 * logged at all. Past the fortnight neither asks.
 */
export function homeMealsWindow(
  weekKey: string,
  startKey: string | null,
  today: Date
): { from: string; to: string } {
  const days = weekDays(weekKey);
  const fortnightAgo = localDateString(
    addLocalDays(today, -ACTIVATION_WINDOW_DAYS)
  );
  const from =
    startKey && startKey >= fortnightAgo && startKey < days[0]
      ? startKey
      : days[0];
  return { from, to: days[6] };
}
