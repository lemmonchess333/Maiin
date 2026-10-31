/**
 * The sets of a saved workout that were new bests (Mob2 call 1, lifting
 * finding 8). The finish screen lists a session's new bests and the set
 * table marks them in gold, but nothing about them is stored on the
 * workout, so its page had no way to say which sets they were.
 *
 * They are worked out again from the history, by the rule the session
 * used (`sessionRecords`): the workouts before this one give each
 * exercise's best by rep range and how many sessions trained it, and a
 * set is a new best when it beats the exercise's best so far, counting
 * the sets before it in this workout, once the exercise has three
 * sessions behind it (`checkSetPR`). Warm-ups and timed holds are never
 * bests. "Before" is by the day the workout started, then by when it was
 * saved, so two sessions on one day are in the order they were done.
 *
 * Read-side only: the stored best-lift map (`liftRecordsStore`) is the
 * state after every session, not before this one, so it cannot answer.
 */
import { isSetEligibleForStrengthPr } from "@/features/program/sessionSetPolicy";
import { fetchSavedWorkouts, type Workout } from "./savedWorkouts";
import { buildPRMap, checkSetPR, recordSetBest } from "./prTracking";

/** A saved workout's sets as its page lists them: every set but the
 *  warm-ups, in order. */
export function listedSets(
  exercise: Workout["exercises"][number]
): Workout["exercises"][number]["sets"] {
  return (exercise.sets ?? []).filter((set) => set.type !== "warmup");
}

const savedAt = (workout: Pick<Workout, "createdAt">) =>
  workout.createdAt?.toMillis?.() ?? 0;

/** Whether `other` came before `workout`. */
function before(other: Workout, workout: Workout): boolean {
  if (other.date !== workout.date) return other.date < workout.date;
  return savedAt(other) < savedAt(workout);
}

/**
 * Each exercise's new-best sets, by the exercise's place in the workout
 * and each set's place among its listed sets (`listedSets`). An exercise
 * with none is absent.
 */
export function workoutBests(
  workout: Workout,
  history: readonly Workout[]
): Map<number, Set<number>> {
  const earlier = history.filter(
    (other) => other.id !== workout.id && before(other, workout)
  );
  let map = buildPRMap(earlier);
  const counts: Record<string, number> = {};
  for (const other of earlier)
    for (const name of new Set(
      other.exercises
        .filter((ex) => (ex.sets ?? []).length > 0)
        .map((ex) => ex.exerciseName)
    ))
      counts[name] = (counts[name] ?? 0) + 1;

  const bests = new Map<number, Set<number>>();
  workout.exercises.forEach((exercise, exIdx) => {
    const name = exercise.exerciseName;
    listedSets(exercise).forEach((set, setIdx) => {
      const type = set.type ?? "working";
      if (!isSetEligibleForStrengthPr(type, exercise.repUnit)) return;
      const weight = set.weightKg;
      const reps = set.reps;
      if (!(weight > 0) || !(reps > 0)) return;
      if (checkSetPR(name, weight, reps, map, counts, 3)?.kind === "best") {
        const marked = bests.get(exIdx) ?? new Set<number>();
        marked.add(setIdx);
        bests.set(exIdx, marked);
      }
      map = recordSetBest(map, name, { weight, reps, date: workout.date });
    });
  });
  return bests;
}

/** The new-best sets of a saved workout, from the history up to its day. */
export async function loadWorkoutBests(
  uid: string,
  workout: Workout
): Promise<Map<number, Set<number>>> {
  const history = await fetchSavedWorkouts(uid, {
    since: "1970-01-01",
    until: workout.date,
  });
  return workoutBests(workout, history);
}
