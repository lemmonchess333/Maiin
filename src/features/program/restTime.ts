import { exerciseRole } from "./exerciseRole";
import type { ProgramExercise } from "./programTypes";

/**
 * Rest between sets as the plan suggests it (Lift4 (5)), by the lift's role
 * and reps: a main lift of 6 reps or fewer rests 3 minutes, other main lifts
 * 2½, other compounds 2 and isolations 75 seconds. A rest an older plan's
 * template wrote for the lift stands.
 */
export function suggestedRestSeconds(
  exercise: Pick<ProgramExercise, "exerciseId" | "reps"> &
    Partial<Pick<ProgramExercise, "isAccessory" | "repUnit" | "restSeconds">>
): number {
  if (exercise.restSeconds !== undefined && exercise.restSeconds > 0) {
    return exercise.restSeconds;
  }
  const role = exerciseRole(exercise);
  if (role === "isolation") return 75;
  if (role === "compound") return 120;
  return exercise.repUnit !== "seconds" && exercise.reps <= 6 ? 180 : 150;
}

/**
 * The rest a set gets: the one the person fixed in Workout preferences
 * (`profile.defaultRestSeconds`), or, where they left it to the plan, the
 * plan's suggestion.
 */
export function restSecondsFor(
  exercise: Parameters<typeof suggestedRestSeconds>[0],
  fixedRest: number | undefined
): number {
  return fixedRest !== undefined && fixedRest > 0
    ? fixedRest
    : suggestedRestSeconds(exercise);
}
