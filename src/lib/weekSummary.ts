import { beforeStart } from "@/lib/startDay";

/**
 * The week so far, in three counts: lifts, runs and days with food logged.
 *
 * Home's "This week" card (DS3) reads these. They come from the same
 * resolved calendar week the week strip draws, so the card and the strip
 * can never disagree about what was planned.
 *
 *   lifts  logged sessions dated this week, against the lift days planned
 *          (a session on an unplanned day still counts: it happened)
 *   runs   planned runs completed, plus logged runs that matched no
 *          planned day, against the run days planned
 *   food   days this week with at least one meal logged, out of the
 *          week's days since the account began (7 after the first week)
 *
 * Days before the account began are not counted: a week someone joined on
 * a Friday plans the Friday onward (startDay.ts).
 */
export interface WeekCount {
  done: number;
  planned: number;
}

export interface WeekSummaryCounts {
  lifts: WeekCount;
  runs: WeekCount;
  foodDays: number;
  /** The days food could have been logged on: 7, or fewer in the week
   *  the account began. */
  foodDayTotal: number;
}

interface WindowDay {
  dateKey: string;
  scheduleType: "lift" | "run" | "both" | "rest";
  run: { isCompleted: boolean };
}

export function summariseWeek({
  window,
  liftDates,
  extraRunsByDate,
  mealsByDate,
  startKey = null,
}: {
  /** The seven resolved days of the calendar week. */
  window: readonly WindowDay[];
  /** The date ("yyyy-MM-dd") of every logged lift session. */
  liftDates: readonly string[];
  /** Logged runs that claimed no planned day, keyed by date. */
  extraRunsByDate: ReadonlyMap<string, readonly unknown[]>;
  /** Meals logged per date. */
  mealsByDate: ReadonlyMap<string, { meals: number }>;
  /** The day the account began; earlier days plan nothing. */
  startKey?: string | null;
}): WeekSummaryCounts {
  const days = new Set(window.map((d) => d.dateKey));
  let liftPlanned = 0;
  let runPlanned = 0;
  let runDone = 0;
  let foodDays = 0;
  let foodDayTotal = 0;
  for (const day of window) {
    const begun = !beforeStart(day.dateKey, startKey);
    if (begun) foodDayTotal++;
    if (begun && (day.scheduleType === "lift" || day.scheduleType === "both"))
      liftPlanned++;
    if (begun && (day.scheduleType === "run" || day.scheduleType === "both")) {
      runPlanned++;
      if (day.run.isCompleted) runDone++;
    }
    runDone += extraRunsByDate.get(day.dateKey)?.length ?? 0;
    if ((mealsByDate.get(day.dateKey)?.meals ?? 0) > 0) foodDays++;
  }
  const liftDone = liftDates.filter((d) => days.has(d)).length;
  return {
    lifts: { done: liftDone, planned: liftPlanned },
    runs: { done: runDone, planned: runPlanned },
    foodDays,
    foodDayTotal,
  };
}
