/**
 * A finished lift's saved workout, built as the app builds it.
 *
 * The app's builders (`liftWorkoutExercises` and `liftTotals` in
 * `src/lib/liftCompletion.ts`) sit in a module that starts the app's
 * Firebase client, which a spec's Node process can't load. So a journey's
 * lift (`journeyLift.ts`) builds its workout here, and
 * `src/lib/__tests__/journeyLiftDoc.test.ts` holds these to the app's
 * output, field for field.
 */
import type { ProgramExercise } from "../../src/features/program/programTypes";
import {
  projectWorkoutSets,
  type LoggedSet,
} from "../../src/features/program/workoutSetRecord";
import type { WorkoutExercise } from "../../src/lib/savedWorkouts";
import { estimateLiftBurn } from "../../src/lib/workoutBurn";

/** The exercises a session ran, as its saved workout records them. */
export function journeyWorkoutExercises(
  ran: readonly ProgramExercise[],
  setLogs: readonly (readonly LoggedSet[])[]
): WorkoutExercise[] {
  return ran.map((ex, index) => ({
    exerciseId: ex.exerciseId,
    exerciseName: ex.name,
    category: ex.movementCategory,
    ...(ex.repUnit !== undefined ? { repUnit: ex.repUnit } : {}),
    sets: projectWorkoutSets(setLogs[index], {
      sets: ex.sets,
      reps: ex.reps,
      weightKg: ex.weight,
    }),
    plannedSetCount: ex.sets,
    caloriesBurned: 0,
  }));
}

/** The saved workout's totals: kilograms moved (none for a timed hold),
 *  sets done, minutes (three a set without a clock) and the burn. */
export function journeyLiftTotals(
  exercises: readonly WorkoutExercise[],
  session: { durationMinutes: number; bodyweightKg: number }
) {
  const tonnageKg = exercises.reduce(
    (total, ex) =>
      total +
      (ex.repUnit === "seconds"
        ? 0
        : (ex.sets ?? []).reduce(
            (sum, set) => sum + (set.weightKg || 0) * (set.reps || 0),
            0
          )),
    0
  );
  const completedSetCount = exercises.reduce(
    (count, ex) => count + ex.sets.length,
    0
  );
  const clock = session.durationMinutes > 0 ? session.durationMinutes : 0;
  return {
    tonnageKg,
    completedSetCount,
    durationMinutes: clock > 0 ? clock : completedSetCount * 3,
    totalCalories: estimateLiftBurn({
      durationMinutes: clock,
      tonnageKg,
      bodyweightKg: session.bodyweightKg,
      completedSetCount,
    }),
  };
}
