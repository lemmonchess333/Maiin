import type { WorkoutExercise, WorkoutSet } from "@/lib/savedWorkouts";

/** One set as Train's "Last:" line shows it. */
export interface LastSet {
  weightKg: number;
  reps: number;
}

/** A run of consecutive sets at one weight: "90 kg × 5, 5". */
export interface LastSetGroup {
  weightKg: number;
  reps: number[];
}

/**
 * The sets each exercise was last done with, for Train's "Last:" line:
 * every set the plan reads, in the order they were done.
 *
 * Not the best set alone: under Lift4 the plan says nothing when last
 * time's sets explain the new number, and one set can't. A weight held
 * after 12, 12, 10 would read "Last: 60 kg × 12" beside an unchanged
 * prescription, which looks like a bug.
 *
 * Drop sets are left out, as progression leaves them out. Warm-ups are not
 * saved, but a document from before sets had types (D2) can hold a light
 * set typed in by hand, so an untyped set under half the heaviest is still
 * read as a warm-up, as the best-set line did.
 */
export function lastSetsByExercise(
  workouts: readonly { exercises: readonly WorkoutExercise[] }[]
): Map<string, LastSet[]> {
  const map = new Map<string, LastSet[]>();
  // Newest first, so the first session found for an exercise is its last.
  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      if (map.has(exercise.exerciseId)) continue;
      const sets = countedSets(exercise.sets);
      if (sets.length) map.set(exercise.exerciseId, sets);
    }
  }
  return map;
}

function countedSets(sets: readonly WorkoutSet[]): LastSet[] {
  const heaviest = Math.max(0, ...sets.map((set) => set.weightKg));
  return sets
    .filter((set) =>
      set.type === undefined
        ? set.weightKg >= heaviest * 0.5
        : set.type === "working" || set.type === "failure"
    )
    .map(({ weightKg, reps }) => ({ weightKg, reps }));
}

/** Consecutive sets at one weight, grouped, so a top set and its back-offs
 *  read "100 kg × 5 · 90 kg × 5, 5". */
export function groupLastSets(sets: readonly LastSet[]): LastSetGroup[] {
  const groups: LastSetGroup[] = [];
  for (const set of sets) {
    const last = groups[groups.length - 1];
    if (last && last.weightKg === set.weightKg) last.reps.push(set.reps);
    else groups.push({ weightKg: set.weightKg, reps: [set.reps] });
  }
  return groups;
}
