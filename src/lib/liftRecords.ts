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
 *
 * App1 Q15, one record book: a set the workout screen calls a new best
 * (`checkSetPR`, loaded sets by estimated one-rep max) is this list's row
 * for its exercise. So on a bodyweight exercise a set with added load
 * outranks one without: the screen celebrates only loaded sets, and an
 * unweighted set's reps are not on the same scale as a loaded set's
 * estimate (20 reps would otherwise beat +10 kg × 5, which scores 11.7).
 */
import { epley1RMExact } from "./analytics";
import { EXERCISES } from "./exercises";

export interface LiftRecord {
  name: string;
  weight: number;
  reps: number;
  /** Local "YYYY-MM-DD" of the session that set it. */
  date: string;
  /** A personal best set inside the last week: the row says so, as the
   *  running rows do. */
  isNew: boolean;
}

interface ScoredSet {
  weight: number;
  reps: number;
  date: string;
  /** Lifted with load: every counted set of a loaded exercise, and a
   *  bodyweight exercise's sets with added weight. */
  loaded: boolean;
  score: number;
}

function keepBest(
  best: Map<string, ScoredSet>,
  name: string,
  set: ScoredSet
): void {
  const prev = best.get(name);
  // A tie keeps the day the best was FIRST set: a lifter holding
  // 105 kg × 5 for four weeks has not set a record each week, and
  // the row must not move its date, or say New, every session.
  if (
    !prev ||
    (set.loaded && !prev.loaded) ||
    (set.loaded === prev.loaded &&
      (set.score > prev.score ||
        (set.score === prev.score && set.date < prev.date)))
  ) {
    best.set(name, set);
  }
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
 *
 * New is drawn in gold, and gold means a personal best, so a window's
 * best is new only when it is also the exercise's best over every
 * session. This week's 95 kg × 5 is the best of the last 30 days, and
 * not a new best while an older 100 kg × 5 stands.
 */
export function bestSetPerExercise(
  workouts: readonly RecordWorkout[],
  { sinceKey, newSinceKey }: { sinceKey?: string; newSinceKey: string }
): LiftRecord[] {
  const best = new Map<string, ScoredSet>();
  /* Every session's bests. Both maps keep the same set objects under the
     same rule, so the window's best is the all-time record exactly when
     it is the same object. */
  const allTime = new Map<string, ScoredSet>();
  for (const w of workouts) {
    const inWindow = !sinceKey || w.date >= sinceKey;
    for (const ex of w.exercises ?? []) {
      if (ex.repUnit === "seconds") continue;
      const name = ex.exerciseName;
      const isBodyweight =
        EXERCISES.find((e) => e.name === name)?.equipment === "Bodyweight";
      for (const set of ex.sets ?? []) {
        if (set.type === "warmup") continue;
        if (!(set.reps > 0)) continue;
        if (!isBodyweight && !(set.weightKg > 0)) continue;
        const loaded = set.weightKg > 0;
        const scored: ScoredSet = {
          weight: set.weightKg,
          reps: set.reps,
          date: w.date,
          loaded,
          score: loaded ? epley1RMExact(set.weightKg, set.reps) : set.reps,
        };
        keepBest(allTime, name, scored);
        if (inWindow) keepBest(best, name, scored);
      }
    }
  }
  return [...best.entries()]
    .map(([name, r]) => ({
      name,
      weight: r.weight,
      reps: r.reps,
      date: r.date,
      isNew: r.date >= newSinceKey && allTime.get(name) === r,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
