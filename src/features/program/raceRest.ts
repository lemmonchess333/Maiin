/**
 * The race's rest days (Lift4 (10), owner 2026-10-06): race week is "one
 * short session at least three days before the race", so the last two days
 * before it, and race day, have no lifting. From two days out a session not
 * done yet is skipped, as the rollover skips race week's others
 * (`raceWeekSession`): race week's session can't drift to the day before,
 * and when the race falls early in a week, the taper week's last session
 * two days before it waits too.
 *
 * Each skip goes through the same command as a skip the person makes
 * (`skipWorkoutDay`), from `useProgram`, after the rollovers: a week still
 * to roll over is theirs to move first.
 */
import type { ProgramState, RunPlan } from "./programTypes";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";

/** The days before a race with no lifting. */
export const RACE_REST_DAYS = 2;

/** Whether a day is one of the race's rest days: the two before it, or the
 *  day itself. Only a race plan has them. */
export function isRaceRestDay(
  runPlan: Pick<RunPlan, "mode" | "raceGoal"> | null | undefined,
  today: string
): boolean {
  const race =
    runPlan?.mode === "race_prep" ? runPlan.raceGoal?.targetDate : undefined;
  if (!race) return false;
  const from = localDateString(
    addLocalDays(parseLocalDate(race), -RACE_REST_DAYS)
  );
  // YYYY-MM-DD compares in date order.
  return today >= from && today <= race;
}

/** The sessions to skip for the race's rest days: on one of them, this
 *  week's sessions not done or skipped yet; none on any other day. */
export function raceRestSkips(
  state: Pick<ProgramState, "runPlan" | "workouts">,
  today: string
): number[] {
  if (!isRaceRestDay(state.runPlan, today)) return [];
  return state.workouts.flatMap((day, index) =>
    day.completed || day.skipped ? [] : [index]
  );
}
