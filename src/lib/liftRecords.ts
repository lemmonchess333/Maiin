/**
 * The PRs tab's lift records: each exercise's best set, judged the way the
 * rest of the app judges a set (estimated one-rep max, reps for an
 * unweighted bodyweight exercise).
 *
 * This lived twice inline in History, once for all time and once for the
 * last 30 days, and both copies scored a TIMED hold as if its seconds were
 * reps: a 60-second weighted plank at 20 kg is not a 60 kg one-rep max.
 * `workoutTonnageKg` and `buildPRMap` already leave timed holds out; the
 * records now do too, and warm-up sets with them (writers strip warm-ups,
 * but a set typed as one says what it is).
 */
import { epley1RMExact } from "./analytics";
import { EXERCISES } from "./exercises";

export interface LiftRecord {
  name: string;
  weight: number;
  reps: number;
  /** Local "YYYY-MM-DD" of the session that set it. */
  date: string;
  /** Set inside the last week: the row says so, as the running rows do. */
  isNew: boolean;
}

interface RecordWorkout {
  date: string;
  exercises?: readonly {
    exerciseName: string;
    repUnit?: string;
    sets?: readonly { weightKg: number; reps: number; type?: string }[];
  }[];
}

/**
 * The best set per exercise across `workouts` on or after `sinceKey`
 * (all of them without one), newest record first. `newSinceKey` is the
 * first day a record counts as new.
 */
export function bestSetPerExercise(
  workouts: readonly RecordWorkout[],
  { sinceKey, newSinceKey }: { sinceKey?: string; newSinceKey: string }
): LiftRecord[] {
  const best = new Map<
    string,
    { weight: number; reps: number; date: string; score: number }
  >();
  for (const w of workouts) {
    if (sinceKey && w.date < sinceKey) continue;
    for (const ex of w.exercises ?? []) {
      if (ex.repUnit === "seconds") continue;
      const name = ex.exerciseName;
      const isBodyweight =
        EXERCISES.find((e) => e.name === name)?.equipment === "Bodyweight";
      for (const set of ex.sets ?? []) {
        if (set.type === "warmup") continue;
        if (!(set.reps > 0)) continue;
        if (!isBodyweight && !(set.weightKg > 0)) continue;
        const score =
          isBodyweight && set.weightKg === 0
            ? set.reps
            : epley1RMExact(set.weightKg, set.reps);
        const prev = best.get(name);
        // A tie keeps the day the best was FIRST set: a lifter holding
        // 105 kg × 5 for four weeks has not set a record each week, and
        // the row must not move its date, or say New, every session.
        if (
          !prev ||
          score > prev.score ||
          (score === prev.score && w.date < prev.date)
        ) {
          best.set(name, {
            weight: set.weightKg,
            reps: set.reps,
            date: w.date,
            score,
          });
        }
      }
    }
  }
  return [...best.entries()]
    .map(([name, r]) => ({
      name,
      weight: r.weight,
      reps: r.reps,
      date: r.date,
      isNew: r.date >= newSinceKey,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
