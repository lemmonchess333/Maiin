/**
 * Multi-rep-range PR tracking.
 * Buckets: 1RM, 3RM, 5RM, 8RM, 10RM+
 * Only fires after the user has ≥3 sessions with that exercise.
 *
 * PR map is persisted to Firestore (users/{uid}/stats/prMap)
 * after each workout for complete history beyond the 50-session window.
 */
import { isSetEligibleForStrengthPr } from "@/features/program/sessionSetPolicy";

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

/**
 * Rebuilds the rep-bucket PR map from workout history.
 *
 * Filters with the SAME predicate the live path uses
 * (`isSetEligibleForStrengthPr`): no warm-ups, no timed holds. The live
 * gate alone was not enough, because this rebuild REPLACES the live-built
 * map whenever `stats/prMap` is missing or legacy — so records the live
 * path refused to create came back on the next rebuild, and two of them
 * were user-visible:
 *
 *   - A timed hold seeded rep-bucket records (a 20 kg / 60 s weighted
 *     plank filed under "10+ Rep Max"), which the compare sheet then
 *     displayed and the post-session persist wrote to the account. The
 *     app has already ruled a hold is not a rep-max anywhere it had
 *     been told (ExerciseHistory says "Longest hold"; the live PR gate
 *     refuses one).
 *   - A warm-up could seed a record that then SUPPRESSED a real PR: a
 *     historical 60 kg warm-up outranks today's 55 kg working set, so
 *     the working set fires nothing — the same phantom-suppression
 *     class as the malformed-set guard below, reached via honest data.
 *
 * A set with no `type` counts as working — pre-D2 documents carry none,
 * and that has always been the documented default (`src/lib/export.ts`).
 * Drop sets and failure sets stay ELIGIBLE, deliberately: the predicate's
 * own docblock distinguishes PR eligibility from progression eligibility
 * on exactly that axis, and excluding them here would erase real records.
 */
export function buildPRMap(
  workouts: {
    exercises: {
      exerciseName: string;
      repUnit?: "reps" | "seconds";
      sets: { weightKg: number; reps: number; type?: string }[];
    }[];
    date: string;
  }[]
): PRMap {
  const map: PRMap = {};
  for (const w of workouts) {
    for (const ex of w.exercises) {
      if (ex.repUnit === "seconds") continue;
      if (!map[ex.exerciseName]) map[ex.exerciseName] = { ...EMPTY_BUCKETS };
      for (const set of ex.sets) {
        if (!isSetEligibleForStrengthPr(set.type ?? "working", ex.repUnit)) {
          continue;
        }
        // Malformed legacy sets mint PHANTOM records that then suppress real
        // PRs forever (probe sweep 2026-08-05, verifier-confirmed):
        // `undefined <= 0` is false, so a set missing weightKg passed this
        // guard and recorded {weight: undefined} — every later real set
        // fails both `weight > undefined` and the tiebreak, blocking the
        // bucket permanently. And getRepBucket(undefined) returns "10rm"
        // (all <= comparisons false), filing a real weight under a phantom
        // bucket. A record needs BOTH fields real and positive.
        if (
          !Number.isFinite(set.weightKg) ||
          set.weightKg <= 0 ||
          !Number.isFinite(set.reps) ||
          set.reps <= 0
        ) {
          continue;
        }
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

/**
 * Advance the per-exercise session counts after a completed session.
 *
 * THE COUNTS MUST GROW OR THE CELEBRATIONS NEVER FIRE. `checkSetPR` /
 * `checkVolumePR` gate on `sessionCounts[name] >= 3` — a deliberate
 * "you've done this at least 3 times before" floor so a first attempt
 * doesn't spray confetti. WorkoutSession loaded the persisted counts,
 * never incremented them, and persisted the identical object back — so
 * once the stats doc existed, a new user froze at counts ≤ 2 and the
 * gate NEVER opened: no set-PR, no volume-PR, for anyone whose doc was
 * created before their third session, permanently. (Probe-measured
 * 2026-08-05: ten sessions of monotonically heavier bench, checkSetPR
 * null on every one, doc still `{Bench: 1}` at the end.) Any exercise
 * adopted after the doc existed froze at 0 the same way. The only path
 * that ever grew counts was the legacy rebuild-from-history, which is
 * skipped precisely when the doc exists.
 *
 * Pure and non-mutating; counts only ever go UP here (the floor of the
 * merge is the persisted value, so a partial history can't shrink
 * anyone's standing). Frozen production docs self-heal: three sessions
 * after this ships, the gate opens — no migration.
 */
export function bumpSessionCounts(
  counts: Record<string, number>,
  trainedExerciseNames: readonly string[]
): Record<string, number> {
  const next = { ...counts };
  for (const name of new Set(trainedExerciseNames)) {
    next[name] = (next[name] || 0) + 1;
  }
  return next;
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

/**
 * Best single-session volume per exercise across the workout history.
 *
 * Timed exercises are EXCLUDED, not scored differently. A hold's `reps` is
 * a duration, so weight × reps is not a weight moved — and the app already
 * has an answer for what a hold's best session means: ExerciseHistory
 * headlines "Longest hold" and picks its top set by duration. Volume is
 * simply not the axis for them, which is why the metric isn't even offered
 * there and why `isSetEligibleForStrengthPr` refuses a volume PR for one.
 *
 * This map is the last place that hadn't been told. It is PERSISTED
 * (`users/{uid}/stats/prMap.volumeBest`), so an unscored hold wasn't inert
 * — it wrote a weight×seconds figure under the name "volume" and kept it
 * there for whatever reads the map next.
 */
export function buildVolumeBest(
  workouts: {
    exercises: {
      exerciseName: string;
      repUnit?: "reps" | "seconds";
      sets: { weightKg: number; reps: number }[];
    }[];
    date: string;
  }[]
): VolumeBestMap {
  const best: VolumeBestMap = {};
  for (const w of workouts) {
    for (const ex of w.exercises) {
      if (ex.repUnit === "seconds") continue;
      const vol = exerciseSessionVolume(ex.sets);
      if (vol > 0 && vol > (best[ex.exerciseName]?.volume ?? 0)) {
        best[ex.exerciseName] = { volume: vol, date: w.date };
      }
    }
  }
  return best;
}

/**
 * The volume-best map after a completed session, given the map loaded at
 * session start.
 *
 * Extracted from `WorkoutSession`'s persist block, which is where the
 * result is written to `users/{uid}/stats/prMap`. It lived inline in a
 * ~1900-line component with no test file, so the rule below could not be
 * exercised at all — the same reason `exerciseFromRoutine` moved out.
 *
 * `sets` must already be filtered to the completed, non-warm-up ones: the
 * caller owns the session-log shape, and `exerciseSessionVolume` takes
 * plain weight/reps pairs for the same reason.
 *
 * A timed exercise DELETES its entry rather than merely skipping it. The
 * map is carried forward by spreading the loaded copy, so skipping would
 * preserve a bogus weight×seconds figure written before this rule existed,
 * indefinitely. Deleting lets it shed the next time the movement is
 * actually trained.
 */
export function nextVolumeBest(
  current: VolumeBestMap,
  entries: {
    name: string;
    repUnit?: "reps" | "seconds";
    sets: { weightKg: number; reps: number }[];
  }[],
  date: string
): VolumeBestMap {
  const next: VolumeBestMap = { ...current };
  for (const entry of entries) {
    if (!entry.name) continue;
    if (entry.repUnit === "seconds") {
      delete next[entry.name];
      continue;
    }
    const vol = exerciseSessionVolume(entry.sets);
    if (vol > 0 && vol > (next[entry.name]?.volume ?? 0)) {
      next[entry.name] = { volume: vol, date };
    }
  }
  return next;
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
