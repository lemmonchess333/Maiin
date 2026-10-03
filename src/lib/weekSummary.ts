import { beforeStart } from "@/lib/startDay";
import {
  weekDays,
  type TrainingWeek,
  type WeekCount,
} from "@/lib/trainingWeek";

/**
 * The week so far, in three counts: lifts, runs and days with food logged.
 *
 * Home's "This week" card (DS3) reads these. Lifts and runs are the week
 * every screen counts (`trainingWeek`), so the card agrees with the finish
 * screens' "Your week so far" and with the recap:
 *
 *   food   days this week with at least one meal logged, out of the
 *          week's days since the account began (7 after the first week)
 *
 * Days before the account began are not counted: a week someone joined on
 * a Friday plans the Friday onward (startDay.ts).
 */
export interface WeekSummaryCounts {
  lifts: WeekCount;
  runs: WeekCount;
  foodDays: number;
  /** The days food could have been logged on: 7, or fewer in the week
   *  the account began. */
  foodDayTotal: number;
}

export function summariseWeek({
  training,
  mealsByDate,
  startKey = null,
}: {
  /** The week's lifts and runs. */
  training: Pick<TrainingWeek, "weekKey" | "lifts" | "runs">;
  /** Meals logged per date. */
  mealsByDate: ReadonlyMap<string, { meals: number }>;
  /** The day the account began; earlier days are not counted. */
  startKey?: string | null;
}): WeekSummaryCounts {
  let foodDays = 0;
  let foodDayTotal = 0;
  for (const day of weekDays(training.weekKey)) {
    if (!beforeStart(day, startKey)) foodDayTotal++;
    if ((mealsByDate.get(day)?.meals ?? 0) > 0) foodDays++;
  }
  return {
    lifts: training.lifts,
    runs: { done: training.runs.done, planned: training.runs.planned },
    foodDays,
    foodDayTotal,
  };
}
