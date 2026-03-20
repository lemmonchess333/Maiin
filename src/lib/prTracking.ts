/**
 * Multi-rep-range PR tracking.
 * Buckets: 1RM, 3RM, 5RM, 8RM, 10RM+
 * Only fires after the user has ≥3 sessions with that exercise.
 *
 * PR map is persisted to Firestore (users/{uid}/stats/prMap)
 * after each workout for complete history beyond the 50-session window.
 */

export type RepBucket = '1rm' | '3rm' | '5rm' | '8rm' | '10rm';

export interface ExercisePR {
  weight: number;
  reps: number;
  date: string;
}

export type PRMap = Record<string, Record<RepBucket, ExercisePR | null>>;

export function getRepBucket(reps: number): RepBucket {
  if (reps <= 1) return '1rm';
  if (reps <= 3) return '3rm';
  if (reps <= 5) return '5rm';
  if (reps <= 8) return '8rm';
  return '10rm';
}

export function repBucketLabel(bucket: RepBucket): string {
  switch (bucket) {
    case '1rm': return '1-Rep Max';
    case '3rm': return '3-Rep Max';
    case '5rm': return '5-Rep Max';
    case '8rm': return '8-Rep Max';
    case '10rm': return '10+ Rep Max';
  }
}

const EMPTY_BUCKETS: Record<RepBucket, ExercisePR | null> = {
  '1rm': null, '3rm': null, '5rm': null, '8rm': null, '10rm': null,
};

export function buildPRMap(
  workouts: { exercises: { exerciseName: string; sets: { weightKg: number; reps: number }[] }[]; date: string }[]
): PRMap {
  const map: PRMap = {};
  for (const w of workouts) {
    for (const ex of w.exercises) {
      if (!map[ex.exerciseName]) map[ex.exerciseName] = { ...EMPTY_BUCKETS };
      for (const set of ex.sets) {
        if (set.weightKg <= 0) continue;
        const bucket = getRepBucket(set.reps);
        const current = map[ex.exerciseName][bucket];
        if (!current || set.weightKg > current.weight) {
          map[ex.exerciseName][bucket] = { weight: set.weightKg, reps: set.reps, date: w.date };
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
  if (!current || weight > current.weight) return bucket;
  return null;
}
