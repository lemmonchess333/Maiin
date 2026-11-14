/**
 * The week's days, and the week's runs that count. Split from
 * trainingWeek.ts because it reads no plan: nonRaceGoal.ts needs it, and
 * the profile type in auth.tsx reaches nonRaceGoal.ts, so taking it from
 * trainingWeek.ts (which reads the plan through trainingResolver.ts, which
 * reads the profile type) made an import cycle.
 */
import { addLocalDays, localDateString, parseLocalDate } from "./dateHelpers";
import { isVolumeEligible, type RunRecord } from "./runStatsEligibility";

/** A saved run as the week counts it. */
export interface WeekRun extends RunRecord {
  /** The day the run belongs to, "yyyy-MM-dd". */
  day: string;
}

/** The seven days of the week that starts on `weekKey`. */
export function weekDays(weekKey: string): string[] {
  const monday = parseLocalDate(weekKey);
  return Array.from({ length: 7 }, (_, i) =>
    localDateString(addLocalDays(monday, i))
  );
}

/**
 * The week's runs that count: on a day in the week, and counted by
 * `isVolumeEligible`, the rule every run total uses. For a figure made of
 * the runs themselves, as a weekly goal's minutes are.
 */
export function weekRunsThatCount<R extends WeekRun>(
  weekKey: string,
  runs: readonly R[]
): R[] {
  const days = weekDays(weekKey);
  return runs.filter(
    (run) => run.day >= days[0] && run.day <= days[6] && isVolumeEligible(run)
  );
}
