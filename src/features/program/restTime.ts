import { exerciseRole } from "./exerciseRole";
import type { ProgramExercise } from "./programTypes";

/** A plan built for sessions this short rests less (Lift4 (5)). */
const SHORT_SESSION_MINUTES = 30;

/**
 * Rest between sets as the plan suggests it (Lift4 (5)), by the lift's role
 * and reps: a main lift of 6 reps or fewer rests 3 minutes, other main lifts
 * 2½, other compounds 2 and isolations 75 seconds. A plan built for
 * 30-minute sessions rests less (2 minutes, 90 seconds, 90 seconds and a
 * minute), since with those rests 30 minutes holds about six working sets.
 * A rest an older plan's template wrote for the lift stands.
 */
export function suggestedRestSeconds(
  exercise: Pick<ProgramExercise, "exerciseId" | "reps"> &
    Partial<Pick<ProgramExercise, "isAccessory" | "repUnit" | "restSeconds">>,
  /** The session length the plan is built for (`programState.sessionMinutes`). */
  sessionMinutes?: number
): number {
  if (exercise.restSeconds !== undefined && exercise.restSeconds > 0) {
    return exercise.restSeconds;
  }
  const short =
    sessionMinutes !== undefined && sessionMinutes <= SHORT_SESSION_MINUTES;
  const role = exerciseRole(exercise);
  if (role === "isolation") return short ? 60 : 75;
  if (role === "compound") return short ? 90 : 120;
  const heavy = exercise.repUnit !== "seconds" && exercise.reps <= 6;
  if (heavy) return short ? 120 : 180;
  return short ? 90 : 150;
}

/** Where a set's rest comes from besides the lift itself. */
export interface RestContext {
  /** The rest the person fixed in Workout preferences
   *  (`profile.defaultRestSeconds`); 0 or absent leaves it to the plan. */
  fixedRest?: number;
  /** The session length the plan is built for. */
  sessionMinutes?: number;
}

/**
 * The rest a set gets: the one the person fixed in Workout preferences, or,
 * where they left it to the plan, the plan's suggestion.
 */
export function restSecondsFor(
  exercise: Parameters<typeof suggestedRestSeconds>[0],
  { fixedRest, sessionMinutes }: RestContext = {}
): number {
  return fixedRest !== undefined && fixedRest > 0
    ? fixedRest
    : suggestedRestSeconds(exercise, sessionMinutes);
}
