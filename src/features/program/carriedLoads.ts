/**
 * A new plan's lifts started from where the person left them (TrainWk1
 * step 6). Stop lifting takes the plan's lift days and the weights in them
 * off the plan, and Add lifting builds a plan again; the saved workouts,
 * outside the plan, still say what each lift was last done with. Without
 * this a lifter who stopped and came back started their squat at a first
 * guess from their body weight.
 *
 * A lift done before starts at the weight its last session followed (the
 * weight most of its sets were lifted at, `followedWeight`), moved to the
 * new plan's reps by `scaleLoadForReps`, which never adds load: more reps
 * than last time take less, fewer keep the weight. A lift not done before
 * keeps the plan's first weight, and so do a bodyweight lift, which starts
 * from last time in the session itself (`startingSetRows`), and one timed
 * in seconds.
 */
import { isBodyweightExerciseId } from "@/lib/exercises";
import type { LiftUnit } from "@/lib/liftLoad";
import type { LastSet } from "./lastSets";
import type { WorkoutDay } from "./programTypes";
import { scaleLoadForReps } from "./represcribe";
import { followedWeight, sameWeight } from "./sessionSets";

export function withLastLoads(
  workouts: readonly WorkoutDay[],
  /** Each exercise's sets in its last session (`lastSetsByExercise`). */
  lastSets: ReadonlyMap<string, readonly LastSet[]>,
  /** The plan's kit (`settings.loadUnit`), for the step a weight rounds to. */
  unit: LiftUnit = "kg"
): WorkoutDay[] {
  return workouts.map((day) => ({
    ...day,
    exercises: day.exercises.map((exercise) => {
      if (exercise.repUnit === "seconds") return exercise;
      if (isBodyweightExerciseId(exercise.exerciseId)) return exercise;
      const sets = lastSets.get(exercise.exerciseId);
      if (!sets?.length) return exercise;
      const followed = followedWeight(
        sets.map((s) => ({ weight: s.weightKg }))
      );
      if (followed === null || followed <= 0) return exercise;
      // The fewest reps done at that weight: the load it says they can lift
      // for the plan's reps is the lighter reading.
      const reps = Math.min(
        ...sets
          .filter((s) => sameWeight(s.weightKg, followed))
          .map((s) => s.reps)
      );
      const weight = scaleLoadForReps(
        followed,
        reps,
        exercise.baseReps ?? exercise.reps,
        unit
      );
      if (weight <= 0) return exercise;
      return {
        ...exercise,
        weight,
        lastSuccessfulWeight: weight,
        lastAttemptedWeight: weight,
      };
    }),
  }));
}
