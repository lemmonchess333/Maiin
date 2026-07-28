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
 * protect the lower back).
 *
 * CORRECTED 2026-07-28. This comment used to continue: "Squat frequency is NOT
 * capped: 3×/week squatting in a 3-day full body is deliberate, advertised to
 * the user by `splitRationale`." That reasoning was WRONG and it shipped a bad
 * programme — a default 3-day user was prescribed Barbell Squat three times a
 * week, which is Helms's literal counter-example. The error was conflating
 * MUSCLE frequency with LIFT frequency: `splitRationale` promises "every muscle
 * 3× a week", and quads trained 3×/week via squat + leg press + split squat
 * delivers that without repeating the barbell lift. `capRepeatedLifts` below
 * enforces the lift-level cap; the pattern-level caps here are about systemic
 * cost and remain a separate concern.
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
import { exerciseBank } from "./variationBank";

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

/**
 * Hinge variations that do NOT load the spine the way a barbell pull does,
 * most back-sparing first. Excluded from the expensive-pattern count, and used
 * as the same-category replacement when a slot exceeds a cap.
 *
 * The seated leg curl carries no spinal load at all and is the only
 * hamstring-PRIMARY entry in the bank; the hip thrust is the compound of the
 * pair, so a demoted MAIN takes the hip thrust and a demoted ACCESSORY takes
 * the leg curl.
 */
const BACK_SPARING_HINGES: readonly string[] = [
  "seated-leg-curl",
  "hip-thrust",
];

function isExpensive(ex: ProgramExercise): boolean {
  // The cap is about LOWER-BACK cost, not about the hip pattern. A hip thrust
  // is a hip_dominant movement that no source in the review warns about —
  // Lilliebridge's "pulling for reps burnt out my lower back" and Meadows's
  // "keep lower back from getting too beat up" are both about spinal loading.
  // Counting it would make the cap fire on a day that isn't actually costly.
  if (BACK_SPARING_HINGES.includes(ex.exerciseId)) return false;
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
   VARIETY — the same LIFT, repeated across the week
================================ */

/**
 * How many times one exercise may appear in a week.
 *
 * TWO, not one, and not three. Both source claims point here and they only
 * look contradictory:
 *
 * - Nippard (N5): "changing exercises from week to week is more likely to
 *   flatten out the progression curve." Repetition is the progression
 *   mechanism, so a cap of 1 would be actively harmful.
 * - Helms (H6): "training squats three times a week and deadlifts three times
 *   a week wouldn't be ideal for 90% of people because of the overlap."
 *
 * The trap — which backlog #10 fell into and this fixes — is reading Helms's
 * claim as being about the MUSCLE. It is about the LIFT. #10's rationale
 * declined to cap squats because `splitRationale` promises the user "every
 * muscle 3× a week", and concluded squat×3 was therefore deliberate. But
 * quads trained 3×/week via squat + leg press + split squat satisfies the
 * frequency argument completely while satisfying Helms's objection too. The
 * frequency benefit never required the same barbell lift.
 *
 * Measured before the fix: a 3-day full body prescribed Barbell Squat ×3 and
 * a 4-day upper/lower prescribed Barbell Curl ×3, on EVERY goal — the two
 * most common configurations in the app.
 */
export const MAX_WEEKLY_LIFT_EXPOSURES = 2;

/**
 * Re-point the surplus exposures of any over-used lift to a different
 * variation in the SAME movement category.
 *
 * Muscle frequency is untouched — only which variation fills the slot
 * changes — so the split's frequency promise still holds. Slots keep their
 * position, their sets/reps and their accessory role; only `exerciseId` and
 * `name` move, which is what keeps the positional accessory carry safe.
 *
 * Which slots keep the original: mains before accessories (the main is the
 * progression anchor and usually the lift the day is named for), then
 * earliest day, then earliest slot. Fully deterministic — a regenerate must
 * not churn the programme (the lesson of #11 and #17).
 */
export function capRepeatedLifts(workouts: WorkoutDay[]): WorkoutDay[] {
  const slots: Array<{ d: number; e: number; ex: ProgramExercise }> = [];
  workouts.forEach((day, d) =>
    day.exercises.forEach((ex, e) => slots.push({ d, e, ex }))
  );

  const exposures = new Map<string, typeof slots>();
  for (const s of slots) {
    const list = exposures.get(s.ex.exerciseId);
    if (list) list.push(s);
    else exposures.set(s.ex.exerciseId, [s]);
  }

  const over = [...exposures.entries()].filter(
    ([, list]) => list.length > MAX_WEEKLY_LIFT_EXPOSURES
  );
  if (over.length === 0) return workouts;

  const out = workouts.map((day) => ({
    ...day,
    exercises: [...day.exercises],
  }));
  // Track weekly usage so a replacement can't itself become over-used.
  const usage = new Map<string, number>();
  for (const [id, list] of exposures) usage.set(id, list.length);

  for (const [id, list] of over) {
    const ranked = [...list].sort((a, b) => {
      const aMain = a.ex.isAccessory !== true;
      const bMain = b.ex.isAccessory !== true;
      if (aMain !== bMain) return aMain ? -1 : 1;
      return a.d === b.d ? a.e - b.e : a.d - b.d;
    });
    for (const s of ranked.slice(MAX_WEEKLY_LIFT_EXPOSURES)) {
      const day = out[s.d];
      const inDay = new Set(day.exercises.map((x) => x.exerciseId));
      const options = exerciseBank[s.ex.movementCategory] ?? [];
      const pick = options.find(
        (o) =>
          o.id !== id &&
          !inDay.has(o.id) &&
          (usage.get(o.id) ?? 0) < MAX_WEEKLY_LIFT_EXPOSURES
      );
      if (!pick) continue; // category exhausted — leave it rather than duplicate
      day.exercises[s.e] = { ...s.ex, exerciseId: pick.id, name: pick.name };
      usage.set(id, (usage.get(id) ?? 1) - 1);
      usage.set(pick.id, (usage.get(pick.id) ?? 0) + 1);
    }
  }
  return out;
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

/**
 * The replacement for a slot that exceeds an expensive-pattern cap: a
 * back-sparing variation IN THE SAME CATEGORY. Null when the bank has nothing
 * suitable that isn't already in the day.
 *
 * CORRECTED 2026-07-28 — a cross-category `leastTrainedCategory` used to live
 * here, and re-pointing a demoted hinge to "whatever muscle the week trains
 * least" was wrong in three separate ways, all of them measured on shipped
 * code:
 *
 *   1. It DELETED the week's only direct hamstring work. Both the 4-day and
 *      6-day builds authored a Romanian deadlift alongside the main pull; the
 *      per-session cap demoted it, and because `hip_dominant` was the one
 *      expensive pattern, the replacement could never be another hinge.
 *      Hamstring volume halved (4-day: 12 → 6 weekly sets, under the
 *      landmark low) — a rule meant to protect the lower back quietly
 *      removed the posterior-chain training instead.
 *   2. It put a **bicep curl on "Lower — Deadlift Focus"**, because arms
 *      happened to be the week's least-trained muscle. Guarding that with a
 *      day-type allow-list treated the symptom; the premise was the defect.
 *      What belongs in a slot is decided by the BUILDER that authored the
 *      day, and the cap has no business overriding it.
 *   3. Rebuilding the slot from scratch shipped **0 kg prescriptions** — a
 *      re-pointed accessory was minted uncalibrated and the seeding pass
 *      skipped accessories, so nothing ever filled the number in.
 *
 * Keeping the category makes all three impossible by construction: the day
 * keeps its character, the muscle keeps its volume, and the slot keeps its
 * load. Only the variation changes, which is the one thing the cap is
 * actually trying to change.
 */
export function lowCostAlternative(
  category: MovementCategory,
  idsInDay: ReadonlySet<string>,
  isMain = false
): { id: string; name: string } | null {
  if (!EXPENSIVE_PATTERNS.has(category)) return null;
  const ranked = isMain
    ? [...BACK_SPARING_HINGES].reverse() // a main should stay a compound
    : BACK_SPARING_HINGES;
  const options = exerciseBank[category] ?? [];
  for (const id of ranked) {
    if (idsInDay.has(id)) continue;
    const opt = options.find((o) => o.id === id);
    if (opt) return { id: opt.id, name: opt.name };
  }
  return null;
}
