/**
 * Multi-rep-range PR tracking.
 * Buckets: 1RM, 3RM, 5RM, 8RM, 10RM+
 * Only fires after the user has ≥3 sessions with that exercise.
 *
 * PR map is persisted to Firestore (users/{uid}/stats/prMap)
 * after each workout for complete history beyond the 50-session window.
 */

export type RepBucket = "1rm" | "3rm" | "5rm" | "8rm" | "10rm";

export interface ExercisePR {
  weight: number;
  reps: number;
  date: string;
}

export type PRMap = Record<string, Record<RepBucket, ExercisePR | null>>;

export function getRepBucket(reps: number): RepBucket {
  if (reps <= 1) return "1rm";
  if (reps <= 3) return "3rm";
  if (reps <= 5) return "5rm";
  if (reps <= 8) return "8rm";
  return "10rm";
}

export function repBucketLabel(bucket: RepBucket): string {
  switch (bucket) {
    case "1rm":
      return "1-Rep Max";
    case "3rm":
      return "3-Rep Max";
    case "5rm":
      return "5-Rep Max";
    case "8rm":
      return "8-Rep Max";
    case "10rm":
      return "10+ Rep Max";
  }
}

const EMPTY_BUCKETS: Record<RepBucket, ExercisePR | null> = {
  "1rm": null,
  "3rm": null,
  "5rm": null,
  "8rm": null,
  "10rm": null,
};

export function buildPRMap(
  workouts: {
    exercises: {
      exerciseName: string;
      sets: { weightKg: number; reps: number }[];
    }[];
    date: string;
  }[]
): PRMap {
  const map: PRMap = {};
  for (const w of workouts) {
    for (const ex of w.exercises) {
      if (!map[ex.exerciseName]) map[ex.exerciseName] = { ...EMPTY_BUCKETS };
      for (const set of ex.sets) {
        if (set.weightKg <= 0) continue;
        const bucket = getRepBucket(set.reps);
        const current = map[ex.exerciseName][bucket];
        // Same tiebreak as checkSetPR: heavier weight, OR same weight with
        // more reps. The rebuild used to keep weight-only, so a
        // same-weight-more-reps record silently degraded whenever the map
        // was rebuilt from history (training-book backlog, section 3 B1).
        if (
          !current ||
          set.weightKg > current.weight ||
          (set.weightKg === current.weight && set.reps > current.reps)
        ) {
          map[ex.exerciseName][bucket] = {
            weight: set.weightKg,
            reps: set.reps,
            date: w.date,
          };
        }
      }
    }
  }
  return map;
}

export function checkSetPR(
  exerciseName: string,
  weight: number,
  reps: number,
  prMap: PRMap,
  sessionCounts: Record<string, number>,
  minSessions: number = 3
): RepBucket | null {
  if (weight <= 0) return null;
  if ((sessionCounts[exerciseName] || 0) < minSessions) return null;
  const bucket = getRepBucket(reps);
  const current = prMap[exerciseName]?.[bucket];
  // PR if heavier weight, OR same weight with more reps (rep PR at same load)
  if (
    !current ||
    weight > current.weight ||
    (weight === current.weight && reps > current.reps)
  )
    return bucket;
  return null;
}

/* ================================
   SESSION-VOLUME PR (backlog #2, three-axis PR — Green, bench manual B1)
   Third axis: most total work (kg × reps) for an exercise in one session.
   Presentation policy: one celebration toast, no mechanism talk.
================================ */

export interface VolumeBest {
  volume: number;
  date: string;
}

export type VolumeBestMap = Record<string, VolumeBest>;

/** Sum of weight×reps over the given sets; zero-weight sets contribute 0. */
export function exerciseSessionVolume(
  sets: { weightKg: number; reps: number }[]
): number {
  return sets.reduce(
    (sum, s) =>
      s.weightKg > 0 && s.reps > 0 ? sum + s.weightKg * s.reps : sum,
    0
  );
}

/** Best single-session volume per exercise across the workout history. */
export function buildVolumeBest(
  workouts: {
    exercises: {
      exerciseName: string;
      sets: { weightKg: number; reps: number }[];
    }[];
    date: string;
  }[]
): VolumeBestMap {
  const best: VolumeBestMap = {};
  for (const w of workouts) {
    for (const ex of w.exercises) {
      const vol = exerciseSessionVolume(ex.sets);
      if (vol > 0 && vol > (best[ex.exerciseName]?.volume ?? 0)) {
        best[ex.exerciseName] = { volume: vol, date: w.date };
      }
    }
  }
  return best;
}

/**
 * Same gating philosophy as checkSetPR: needs history depth (minSessions)
 * so day-one sessions don't spray celebrations, and zero volume never fires
 * (bodyweight/uncalibrated work has no volume identity).
 */
export function checkVolumePR(
  exerciseName: string,
  sessionVolume: number,
  volumeBest: VolumeBestMap,
  sessionCounts: Record<string, number>,
  minSessions: number = 3
): boolean {
  if (sessionVolume <= 0) return false;
  if ((sessionCounts[exerciseName] || 0) < minSessions) return false;
  const current = volumeBest[exerciseName];
  return !current || sessionVolume > current.volume;
}
