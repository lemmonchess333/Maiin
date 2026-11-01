/**
 * Where a race plan stands, as every week count on the run side says it:
 * Train's header ("Race prep · Marathon · Week 3/15") and the run summary's
 * row ("Week 3 of 15") read this one answer, so the two cannot disagree.
 *
 * The plan's week counter stops at race week: `runPlan.currentWeek` is not
 * moved on after race day (the plan waits there for the race's own ending,
 * `raceAwaitsItsEnding`), so read alone it said "Week 15 of 15" for weeks
 * after a marathon. Once race day has passed the count is the recovery's
 * ("Recovery week 2 of 4", the wording the post-race lock keeps), and with
 * no recovery running there is no week to count: the race-elapsed,
 * no-show and recovery-complete banners say what state the plan is in.
 *
 * Pure: callers pass the local day key.
 */
import { differenceInCalendarDays } from "date-fns";
import { parseLocalDate } from "@/lib/dateHelpers";
import { isInRecoveryOn } from "@/lib/runPlanResolver";

export type RacePlanWeek =
  /** Race day is today or ahead: the plan's own week, 1-based. */
  | { kind: "plan"; week: number; of: number }
  /** Recovering from the race just run: the recovery's week, 1-based,
   *  or no numbers when the recovery's race can't be dated (a new race
   *  set before the recovery ended). */
  | { kind: "recovery"; week?: number; of?: number };

export interface RacePlanWeekArgs {
  /** The reconciled race goal (`resolveRunPlan`). */
  raceGoal: { targetDate: string } | null | undefined;
  /** The plan's own fields, from `programState.runPlan`. */
  runPlan:
    | {
        currentWeek?: number | null;
        totalWeeks?: number | null;
        phase?: string | null;
        recoveryEndDate?: string | null;
      }
    | null
    | undefined;
  /** Local "YYYY-MM-DD". */
  todayKey: string;
}

export function racePlanWeek({
  raceGoal,
  runPlan,
  todayKey,
}: RacePlanWeekArgs): RacePlanWeek | null {
  if (!raceGoal) return null;
  if (isInRecoveryOn(runPlan, todayKey)) {
    const race = parseLocalDate(raceGoal.targetDate);
    const end = parseLocalDate(runPlan!.recoveryEndDate!);
    const today = parseLocalDate(todayKey);
    const daysSince = differenceInCalendarDays(today, race);
    const length = differenceInCalendarDays(end, race);
    if (!(daysSince > 0) || !(length > 0)) return { kind: "recovery" };
    const of = Math.max(1, Math.round(length / 7));
    return {
      kind: "recovery",
      week: Math.min(of, Math.ceil(daysSince / 7)),
      of,
    };
  }
  if (todayKey > raceGoal.targetDate) return null;
  const week = runPlan?.currentWeek;
  const of = runPlan?.totalWeeks;
  if (
    typeof week !== "number" ||
    typeof of !== "number" ||
    !Number.isInteger(week) ||
    week < 0 ||
    week >= of
  ) {
    return null;
  }
  return { kind: "plan", week: week + 1, of };
}

/**
 * The words: "Week 3 of 15" / "Recovery week 2 of 4" in a sentence or a
 * row, "Week 3/15" / "Recovery week 2/4" in a header line, "Recovering"
 * with no numbers to give.
 */
export function racePlanWeekLabel(
  week: RacePlanWeek,
  form: "long" | "short"
): string {
  if (week.week == null || week.of == null) return "Recovering";
  const count =
    form === "long" ? `${week.week} of ${week.of}` : `${week.week}/${week.of}`;
  return week.kind === "recovery" ? `Recovery week ${count}` : `Week ${count}`;
}
