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

/* ================================
   ADJACENCY (M6) — needs the week's SHAPE, not date-pinned lifts
================================ */

/**
 * Which adjacent session-pairs land on back-to-back CALENDAR days.
 *
 * `workouts[i]` is the i-th lift session of the week, not a weekday — lifts
 * are split-ordered by ADR-0002 and that is deliberate: pinning them to
 * weekdays would mark a Tuesday-instead-of-Monday session as "missed Monday"
 * and drop its volume, punishing exactly the light-trainer and
 * lapsed-and-returning segments. Adjacency does NOT need pinning, though. It
 * only needs to know the SHAPE of the week — whether the planned lift days
 * are consecutive — which `profile.weekSchedule` already carries and the
 * generator simply never received.
 *
 * Returns one flag per adjacent pair (length = sessions − 1). A Mon/Wed/Fri
 * lifter gets all-false and the whole rule correctly becomes a no-op for
 * them; a Mon/Tue/Wed lifter gets all-true. The week does not wrap: the last
 * session and the first are a week apart in execution terms.
 */
export function backToBackPairs(
  schedule: ReadonlyArray<{ day: number; type: string }> | undefined | null,
  sessionCount: number
): boolean[] {
  if (sessionCount <= 1) return [];
  if (!schedule || schedule.length === 0) {
    // No schedule known — assume nothing. Assuming back-to-back would apply a
    // reorder to users it cannot possibly help.
    return Array.from({ length: sessionCount - 1 }, () => false);
  }
  const liftDays = [...schedule]
    .filter((d) => d.type === "lift" || d.type === "both")
    .sort((a, b) => a.day - b.day)
    .map((d) => d.day);
  return Array.from({ length: sessionCount - 1 }, (_, i) => {
    const a = liftDays[i];
    const b = liftDays[i + 1];
    return a != null && b != null && b - a === 1;
  });
}

/**
 * Shared POSTERIOR-CHAIN load between two days — the thing M6 actually warns
 * about ("legs and back are separated to keep lower back from getting too
 * beat up"; "go easy on your lower back as you will be doing heavy legs the
 * next day").
 *
 * Deliberately not a general muscle-overlap score. A general score reorders
 * push/pull/legs out of its intended rotation to chase torso separation that
 * no source asks for; restricting to the posterior chain expresses the
 * source's claim and leaves the rotation alone.
 */
const POSTERIOR_CHAIN: ReadonlySet<CanonicalMuscle> = new Set([
  "Back",
  "Hamstrings",
  "Glutes",
] as CanonicalMuscle[]);

export function posteriorChainOverlap(a: WorkoutDay, b: WorkoutDay): number {
  const vec = (d: WorkoutDay) => {
    const m = new Map<CanonicalMuscle, number>();
    for (const v of weeklyVolumeByMuscle([d])) {
      if (POSTERIOR_CHAIN.has(v.muscle)) m.set(v.muscle, v.sets);
    }
    return m;
  };
  const va = vec(a);
  const vb = vec(b);
  let total = 0;
  for (const [muscle, sets] of va) total += Math.min(sets, vb.get(muscle) ?? 0);
  return total;
}

/**
 * Reorder the week so the sessions that land on BACK-TO-BACK days aren't the
 * two that load the same posterior chain hardest (M6).
 *
 * Returns the input untouched when there is nothing to do — no back-to-back
 * pairs (the Mon/Wed/Fri case), fewer than three sessions, or no ordering
 * that improves on the one the builders produced. Deterministic: ties keep
 * the earlier permutation, so the same week in always gives the same week
 * out.
 *
 * The CALLER must only apply this when there is no existing plan to carry —
 * `workouts[i]` is matched to saved state positionally, so reordering an
 * established plan would land a user's logged bench weight on squats. That
 * has already caused two silent data-loss bugs in this arc.
 */
export function orderForAdjacency(
  workouts: WorkoutDay[],
  schedule: ReadonlyArray<{ day: number; type: string }> | undefined | null
): WorkoutDay[] {
  const n = workouts.length;
  if (n < 3) return workouts; // nothing meaningful to permute
  const adjacency = backToBackPairs(schedule, n);
  if (!adjacency.some(Boolean)) return workouts; // spread-out week — no-op

  const cost = (order: number[]) => {
    let total = 0;
    for (let i = 0; i + 1 < order.length; i += 1) {
      if (!adjacency[i]) continue; // only back-to-back seams are penalised
      total += posteriorChainOverlap(
        workouts[order[i]],
        workouts[order[i + 1]]
      );
    }
    return total;
  };

  const identity = workouts.map((_, i) => i);
  let best = identity;
  let bestCost = cost(identity);
  // n <= 6 in every split the engine emits, so exhaustive is 720 at worst.
  const permute = (rest: number[], acc: number[]) => {
    if (rest.length === 0) {
      const c = cost(acc);
      if (c < bestCost) {
        bestCost = c;
        best = acc;
      }
      return;
    }
    for (let i = 0; i < rest.length; i += 1) {
      permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, rest[i]]);
    }
  };
  permute(identity, []);

  return best === identity ? workouts : best.map((i) => workouts[i]);
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
