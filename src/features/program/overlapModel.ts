/**
 * Overlap-aware scheduling (training-book backlog #10 — D1 + M6 + H6).
 *
 * Helms supplies the concept: "the body does not 'think' of movements as
 * specific to muscle groups… training squats three times a week and
 * deadlifts three times a week wouldn't be ideal for 90% of people because
 * of the overlap." Tropos's fractional volume model IS an overlap model
 * (primary 1.0, secondary 0.5) — the gap was that overlap informed volume
 * TOTALS but never SCHEDULING, so nothing stopped the generator putting the
 * same expensive pattern in every session.
 *
 * Measured on main before writing this, rather than trusting the finding:
 *
 *   1d full_body   1/1 day   Deadlift(acc)
 *   2d upper_lower 1/2 days  Deadlift(main)
 *   3d full_body   3/3 days  Deadlift(acc) + Deadlift ×2 (main)   ← the defect
 *   4d upper_lower 2/4 days  …one day carries Deadlift AND an RDL
 *   5d ppl_ul      2/5 days  fine
 *   6d ppl_x2      2/6 days  …one day carries Deadlift AND an RDL
 *
 * So D1's "every leg/full-body day" was overstated for upper/lower and PPL —
 * those sit at two hinge days, which is what Helms would endorse. Two real
 * problems remain, and one rule covers both: the 3-day full-body user is
 * prescribed the deadlift pattern three times a week (Helms's own example of
 * what not to do, and on the heavy day it lands next to a squat), and the
 * 4/6-day builds stack a deadlift and an RDL in one session.
 *
 * Only `hip_dominant` is listed as expensive, deliberately. Every powerlifting
 * source in the review flags the heavy hinge specifically — Lilliebridge
 * ("pulling for reps burnt out my lower back"), Little, Beck — and Meadows
 * arrives at the same place from bodybuilding (M6: separate legs and back to
 * protect the lower back). Squat frequency is NOT capped: 3×/week squatting in
 * a 3-day full body is deliberate, advertised to the user by `splitRationale`,
 * and backed by the frequency evidence the split choice rests on.
 *
 * Green dissents from the whole premise (pulls weekly, no deloads), which is
 * why the caps bias a default rather than forbidding a frequency — twice a
 * week is still frequent.
 *
 * Presentation policy: INVISIBLE — a different exercise is simply scheduled.
 */

import type {
  MovementCategory,
  ProgramExercise,
  WorkoutDay,
} from "./programTypes";
import { weeklyVolumeByMuscle, type CanonicalMuscle } from "./volumeModel";

/** Patterns whose systemic cost is capped independently of muscle volume. */
export const EXPENSIVE_PATTERNS: ReadonlySet<MovementCategory> = new Set([
  "hip_dominant",
] as MovementCategory[]);

/** Two hinge sessions a week — frequent, but not Helms's counter-example. */
export const MAX_EXPENSIVE_SESSIONS_PER_WEEK = 2;
/** One heavy hinge per session; a deadlift AND an RDL is a lot of lower back. */
export const MAX_EXPENSIVE_SLOTS_PER_SESSION = 1;

export interface Exposure {
  dayIndex: number;
  exIndex: number;
  isAccessory: boolean;
}

function isExpensive(ex: ProgramExercise): boolean {
  return EXPENSIVE_PATTERNS.has(ex.movementCategory);
}

export function expensiveExposures(workouts: WorkoutDay[]): Exposure[] {
  const out: Exposure[] = [];
  workouts.forEach((day, dayIndex) =>
    day.exercises.forEach((ex, exIndex) => {
      if (isExpensive(ex)) {
        out.push({ dayIndex, exIndex, isAccessory: ex.isAccessory === true });
      }
    })
  );
  return out;
}

/**
 * Which expensive-pattern slots exceed the caps and should be re-pointed.
 *
 * Priority when something has to give — mains outrank accessories (a main is
 * the progression anchor and the session's reason for existing), then the
 * earlier slot and the earlier day win. Fully deterministic: the same week in
 * gives the same surplus out, so a regenerate can't churn the programme.
 */
export function surplusExposures(workouts: WorkoutDay[]): Exposure[] {
  const all = expensiveExposures(workouts);
  const surplus: Exposure[] = [];

  // 1. Per-session cap — keep the highest-priority slot in each day.
  const keptPerDay = new Map<number, Exposure>();
  for (const e of all) {
    const held = keptPerDay.get(e.dayIndex);
    if (!held) {
      keptPerDay.set(e.dayIndex, e);
      continue;
    }
    const better =
      held.isAccessory && !e.isAccessory
        ? e
        : !held.isAccessory && e.isAccessory
          ? held
          : held.exIndex <= e.exIndex
            ? held
            : e;
    keptPerDay.set(e.dayIndex, better);
    surplus.push(better === held ? e : held);
  }
  void MAX_EXPENSIVE_SLOTS_PER_SESSION; // the cap this loop enforces

  // 2. Per-week cap — mains first, then earliest day.
  const days = [...keptPerDay.values()].sort((a, b) => {
    if (a.isAccessory !== b.isAccessory) return a.isAccessory ? 1 : -1;
    return a.dayIndex - b.dayIndex;
  });
  surplus.push(...days.slice(MAX_EXPENSIVE_SESSIONS_PER_WEEK));

  return surplus.sort((a, b) =>
    a.dayIndex === b.dayIndex ? a.exIndex - b.exIndex : a.dayIndex - b.dayIndex
  );
}

const CATEGORY_TO_MUSCLE: Record<MovementCategory, CanonicalMuscle> = {
  horizontal_push: "Chest",
  vertical_push: "Shoulders",
  horizontal_pull: "Back",
  vertical_pull: "Back",
  knee_dominant: "Quads",
  hip_dominant: "Hamstrings",
  arms_biceps: "Biceps",
  arms_triceps: "Triceps",
  core: "Core",
};

/**
 * The replacement for a demoted slot: the category whose muscle the week
 * trains LEAST, which is the fractional volume model doing the accounting
 * H6 says it should. Excludes categories already in that day (no duplicate)
 * and the expensive patterns themselves (no swapping one hinge for another).
 * Ties break on a fixed order, so this stays deterministic.
 */
export function leastTrainedCategory(
  workouts: WorkoutDay[],
  excluded: ReadonlySet<MovementCategory>
): MovementCategory | null {
  const volume = new Map(
    weeklyVolumeByMuscle(workouts).map((v) => [v.muscle, v.sets])
  );
  const candidates = (
    Object.keys(CATEGORY_TO_MUSCLE) as MovementCategory[]
  ).filter((c) => !excluded.has(c) && !EXPENSIVE_PATTERNS.has(c));
  if (candidates.length === 0) return null;

  let best = candidates[0];
  let bestSets = volume.get(CATEGORY_TO_MUSCLE[best]) ?? 0;
  for (const c of candidates.slice(1)) {
    const sets = volume.get(CATEGORY_TO_MUSCLE[c]) ?? 0;
    if (sets < bestSets) {
      best = c;
      bestSets = sets;
    }
  }
  return best;
}
