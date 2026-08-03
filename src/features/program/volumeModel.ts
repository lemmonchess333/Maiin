/**
 * Weekly sets-per-muscle volume model (D-LIFT-1, read-only first).
 *
 * The lift engine programs volume per *day-template* but never accounts for it
 * at the muscle-group-week level — the primary hypertrophy driver
 * (Schoenfeld dose–response; RP MEV/MAV/MRV landmarks). This module computes
 * the weekly hard-set tally per canonical muscle group from a generated week,
 * and classifies each against a goal-driven landmark band. Pure + mirror-ready.
 *
 * Counting convention (fractional/indirect volume, the MASS/RP standard):
 *   - a set counts 1.0 toward the exercise's PRIMARY muscle group
 *   - and `SECONDARY_SET_WEIGHT` toward each SECONDARY group it trains
 * Exercises with no muscle attribution (Cardio / "Full Body" conditioning, or
 * too-coarse labels) are excluded — this is a *resistance* volume view.
 *
 * That convention DISAGREES with the bands it is judged against: the goal bands
 * came from meta-analyses that counted 1:1. `docs/adr/0010-volume-currency.md`
 * settles the currency in favour of 1:1 and records why the flip is staged to
 * land with landmark-aware builders rather than before them — measured, not
 * assumed: flipping alone doubles the per-muscle readings over a ceiling.
 *
 * The muscle taxonomy itself lives in `muscleTaxonomy.ts` (13a): attribution
 * runs on a 27-member fine layer and these ten groups are a roll-up of it.
 *
 * It both SURFACES the tally (WeeklyVolumeCard) and DRIVES selection:
 * `balanceWeeklyVolume` nudges under-dosed muscles toward the landmark low by
 * growing their accessories (add-only, mains untouched).
 */
import { getExerciseById, type Exercise } from "@/lib/exercises";
import {
  CANONICAL_MUSCLE_ORDER,
  fineToCanonical,
  toFine,
  type CanonicalMuscle,
  type FineMuscle,
} from "./muscleTaxonomy";
import type { ProgramExercise, WorkoutDay } from "./programTypes";

// The taxonomy moved to `muscleTaxonomy.ts` in 13a so the fine layer and the
// canonical ten could live together without an import cycle. Re-exported here
// because every existing consumer imports them from this module, and moving a
// type is not a reason to touch ten call sites.
export {
  CANONICAL_MUSCLE_ORDER,
  fineToCanonical,
  toFine,
  type CanonicalMuscle,
  type FineMuscle,
};

// Fallback when an exercise isn't in the DB (custom exercise): attribute by its
// movement category so custom lifts still count. Category is a MOVEMENT, not a
// muscle, so it can only ever name a coarse bucket — which is why these resolve
// to the `*Unspecified` members rather than pretending to know a head.
const CATEGORY_TO_FINE: Record<string, FineMuscle> = {
  horizontal_push: "ChestUnspecified",
  vertical_push: "DeltsUnspecified",
  horizontal_pull: "BackUnspecified",
  vertical_pull: "BackUnspecified",
  knee_dominant: "Quads",
  hip_dominant: "Hamstrings",
  arms_biceps: "Biceps",
  arms_triceps: "Triceps",
  core: "CoreUnspecified",
};

export function toCanonical(name: string | undefined): CanonicalMuscle | null {
  return fineToCanonical(toFine(name));
}

/** The canonical PRIMARY muscle an exercise trains (DB primary, else movement
 *  category for custom lifts), or null when unattributable (cardio/whole-body). */
export function primaryCanonicalForExercise(
  ex: ProgramExercise
): CanonicalMuscle | null {
  const dbEx = getExerciseById(ex.exerciseId);
  if (dbEx) return toCanonical(dbEx.muscleGroup);
  return fineToCanonical(CATEGORY_TO_FINE[ex.movementCategory] ?? null);
}

/**
 * Canonical primary + secondary muscles for a DB exercise — the same
 * attribution `weeklyVolumeByMuscle` applies internally, exposed so sibling
 * views (muscle recovery) speak the identical muscle language as the volume
 * card. `primary: null` means the lift is unattributable (cardio/whole-body)
 * and should be skipped entirely, mirroring the volume tally's rule.
 */
export function canonicalMusclesForDbExercise(dbEx: Exercise): {
  primary: CanonicalMuscle | null;
  secondary: CanonicalMuscle[];
} {
  const primary = toCanonical(dbEx.muscleGroup);
  if (!primary) return { primary: null, secondary: [] };
  const secondary: CanonicalMuscle[] = [];
  for (const sec of dbEx.secondaryMuscles ?? []) {
    const m = toCanonical(sec);
    if (m && m !== primary && !secondary.includes(m)) secondary.push(m);
  }
  return { primary, secondary };
}

export interface MuscleVolume {
  muscle: CanonicalMuscle;
  /** Weekly hard sets (primary 1.0 + secondary 0.5), rounded to 0.5. */
  sets: number;
}

export interface FineMuscleVolume {
  muscle: FineMuscle;
  /**
   * Weekly hard sets (primary 1.0 + secondary `SECONDARY_SET_WEIGHT`),
   * UNROUNDED. This is substrate — the canonical view rounds once, at the
   * level it publishes, because rounding each part and adding the results is
   * a different number from rounding the sum.
   */
  sets: number;
  /** Where this rolls up in the published ten, or `null` when the ten-group
   *  taxonomy has no home for it (forearms, hip flexors). */
  canonical: CanonicalMuscle | null;
}

/**
 * What one set of an exercise contributes to a muscle it trains INDIRECTLY —
 * a secondary rather than the target.
 *
 * ADR-0010 settles that the literature's 1:1 is the correct currency and
 * staged the flip on landmark-aware builders. That condition landed
 * (`reconcileToLandmarks`) — and the 2026-08-03 measurement showed it is
 * NOT sufficient: at 1:1 the canonical Shoulders bucket absorbs every press
 * AND every pull (8 primary + 27 secondary weekly sets at 6 days) and Core
 * absorbs every compound, so even a floor-bound reconciler leaves 292/750
 * readings over a ceiling vs 180 at 0.5 — the flip alone still ships worse
 * advice, exactly what the ADR forbade. Those two buckets need per-head
 * landmarks (front/side/rear delts; direct-ab counting), which is the
 * taxonomy split. THE FLIP IS RE-STAGED ON THAT — see the ADR's status
 * addendum for the numbers.
 *
 * The primary is always 1.0; there is no constant for it because a convention
 * in which the target muscle earns anything else does not exist.
 */
export const SECONDARY_SET_WEIGHT = 0.5;

/**
 * The FINE-layer attribution pass. Since the intra-exercise dedupe this is
 * no longer the substrate `weeklyVolumeByMuscle` sums — the canonical view
 * applies its own per-exercise strongest-relationship rule (see its doc) —
 * but both read the SAME DB fields under the same skip rules, and the
 * dedupe regression test pins the one place they are allowed to differ:
 * an exercise whose primary and secondary roll up to one canonical bucket.
 */
function fineTally(workouts: WorkoutDay[]): Map<FineMuscle, number> {
  const tally = new Map<FineMuscle, number>();
  const add = (m: FineMuscle | null, n: number) => {
    if (!m) return;
    tally.set(m, (tally.get(m) ?? 0) + n);
  };

  for (const day of workouts) {
    if (day.skipped) continue;
    for (const ex of day.exercises) {
      const sets = ex.sets ?? 0;
      if (sets <= 0) continue;
      const dbEx: Exercise | undefined = getExerciseById(ex.exerciseId);
      if (dbEx) {
        // Cardio is not resistance volume at all — skip it outright, whatever
        // its secondaries say. A treadmill listing "Quads/Calves" must not
        // book leg sets.
        if (dbEx.category === "Cardio") continue;

        const primary = toFine(dbEx.muscleGroup);
        if (primary) add(primary, sets);
        // An unattributable PRIMARY used to discard the whole lift, so the
        // thirteen "Full Body" movements in the DB — Zercher squat, landmine
        // squat, thrusters, kettlebell swing, Turkish get-up, muscle-ups —
        // booked ZERO volume despite naming real muscles as secondaries. A
        // Zercher squat trained nothing, as far as the model was concerned.
        // Falling through to the secondaries understates them (0.5 each
        // rather than a primary's 1.0), but understating a squat's legs is a
        // great deal closer than pretending it never happened. Fixing the
        // underlying `muscleGroup: "Full Body"` labels is exercise-DB work
        // (handoff 11b), not this.
        for (const sec of dbEx.secondaryMuscles ?? []) {
          add(toFine(sec), sets * SECONDARY_SET_WEIGHT);
        }
      } else {
        // Custom exercise not in the DB — attribute by movement category.
        add(CATEGORY_TO_FINE[ex.movementCategory] ?? null, sets);
      }
    }
  }

  return tally;
}

/**
 * Weekly sets per FINE muscle — the layer the attribution actually runs on.
 *
 * `weeklyVolumeByMuscle` rolls this up, so there is one attribution pass and
 * the two views cannot drift. Ordered by descending volume, then name; callers
 * that need a fixed display order should impose their own.
 *
 * Includes fine muscles with no canonical home (forearms, hip flexors). They
 * carry `canonical: null` and are dropped by the roll-up, which is why making
 * them visible here moved no published number.
 */
export function weeklyVolumeByFineMuscle(
  workouts: WorkoutDay[]
): FineMuscleVolume[] {
  return [...fineTally(workouts)]
    .filter(([, sets]) => sets > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([muscle, sets]) => ({
      muscle,
      sets,
      canonical: fineToCanonical(muscle),
    }));
}

/**
 * Weekly sets per canonical muscle group across a week's workouts. Skipped days
 * are excluded (no stimulus); completed/planned days count. Returns only
 * muscles with non-zero volume, in CANONICAL_MUSCLE_ORDER.
 *
 * NOT a plain sum of `weeklyVolumeByFineMuscle` since the 1:1 flip
 * (ADR-0010): a set counts ONCE toward a canonical muscle, at the strongest
 * relationship the exercise has with it. Summing fine credits double-counted
 * whenever an exercise's primary and a secondary rolled up to the SAME
 * canonical bucket — a barbell row (Lats primary, Lower Back secondary)
 * booked 2.0 Back sets per physical set at 1:1, and the 2026-08-03
 * measurement showed exactly that shape driving Back to 46 vs a ceiling of
 * 20 at 6 days: 14 of those sets were rows and deadlifts counted twice.
 * The literature's convention this module cites counts a row as one set for
 * the back. The FINE view is untouched — lats and lower back are different
 * muscles, and crediting both is the fine layer's whole point.
 */
export function weeklyVolumeByMuscle(workouts: WorkoutDay[]): MuscleVolume[] {
  const tally = new Map<CanonicalMuscle, number>();
  const add = (m: CanonicalMuscle | null, n: number) => {
    if (!m) return;
    tally.set(m, (tally.get(m) ?? 0) + n);
  };

  for (const day of workouts) {
    if (day.skipped) continue;
    for (const ex of day.exercises) {
      const sets = ex.sets ?? 0;
      if (sets <= 0) continue;
      const dbEx: Exercise | undefined = getExerciseById(ex.exerciseId);
      if (!dbEx) {
        // Custom exercise — attribute by movement category, same as fineTally.
        const fine = CATEGORY_TO_FINE[ex.movementCategory] ?? null;
        add(fine ? fineToCanonical(fine) : null, sets);
        continue;
      }
      if (dbEx.category === "Cardio") continue;

      // Strongest relationship per canonical muscle: primary → 1.0,
      // secondaries-only → SECONDARY_SET_WEIGHT (once, however many fine
      // secondaries roll up to the same bucket).
      const weightByCanonical = new Map<CanonicalMuscle, number>();
      const primaryFine = toFine(dbEx.muscleGroup);
      const primaryCanonical = primaryFine
        ? fineToCanonical(primaryFine)
        : null;
      if (primaryCanonical) weightByCanonical.set(primaryCanonical, 1);
      for (const sec of dbEx.secondaryMuscles ?? []) {
        const fine = toFine(sec);
        const canonical = fine ? fineToCanonical(fine) : null;
        if (!canonical) continue;
        if (!weightByCanonical.has(canonical)) {
          weightByCanonical.set(canonical, SECONDARY_SET_WEIGHT);
        }
      }
      for (const [muscle, weight] of weightByCanonical) {
        add(muscle, sets * weight);
      }
    }
  }

  return CANONICAL_MUSCLE_ORDER.filter((m) => (tally.get(m) ?? 0) > 0).map(
    (m) => ({ muscle: m, sets: Math.round((tally.get(m) ?? 0) * 2) / 2 })
  );
}

export interface VolumeLandmark {
  /**
   * Maintenance volume — the least that RETAINS the muscle. Below it the
   * muscle is being lost, which is a different failure from "not growing" and
   * the reason 13a added it.
   *
   * Without MV, "redistribute volume" is unimplementable: specialisation works
   * by dropping non-target muscles to MV, *not* to MEV. RP Ch7 P155 — "an
   * advanced lifter might have a weekly back MEV of 10 sets, but a weekly back
   * MV of four … that difference grows across the adaptive window." Park a
   * deprioritised muscle between the two and you get "more fatigue than four
   * sets by a long shot, but no additional benefit" (Ch8 P30 / Ch7 P159).
   */
  mv: number;
  /** Below this = under-dosed (under MEV). */
  low: number;
  /** Above this = high (approaching MRV). */
  high: number;
}

/**
 * Goal-driven weekly set landmarks per muscle (simplified RP MV–MEV–MAV bands).
 * `primaryGoal` is the training intent. Hypertrophy carries the highest target;
 * strength is lower-volume/higher-intensity; fat-loss/running lean lower.
 *
 * ── Where the MV numbers come from ───────────────────────────────────────
 *
 * The corpus gives two worked MV↔MEV pairs and no table: back MEV 10 / MV 4
 * (Ch7 P155, 0.40) and the hypocaloric example's MV/MEV/MRV 2/4/7 (Ch7
 * P147–149, 0.50). So MV sits at roughly 0.4–0.5 of MEV, and the values below
 * are each written out rather than computed so they can be argued with
 * individually. `volumeModel.test.ts` pins the ratio inside that range, which
 * is the part the sources actually support.
 *
 * They scale with the goal because `low` does. In the sources MV is a property
 * of the muscle and the athlete, not of what you are training for — but our
 * `low` is a goal-scaled proxy for a per-muscle MEV we do not have, so an
 * MV that did NOT scale with it would sit at a different fraction of the band
 * for every goal and the ladder would stop meaning the same thing. Per-muscle
 * landmarks (§3.8's displaceable priors) are the real fix, and they need the
 * response data 13b is waiting on.
 */
export function volumeLandmark(
  primaryGoal: string | undefined
): VolumeLandmark {
  switch (primaryGoal) {
    case "hypertrophy":
      return { mv: 5, low: 12, high: 20 };
    case "strength":
      return { mv: 4, low: 8, high: 14 };
    case "fat_loss":
    case "running":
      return { mv: 3, low: 6, high: 14 };
    case "general":
    default:
      return { mv: 4, low: 8, high: 16 };
  }
}

/**
 * The four-band ladder, MV included.
 *
 * `junk` is RP's term and it is the DEFAULT reading of the MV–MEV band: enough
 * work to cost recovery, not enough to grow. The one legitimate occupant of
 * that band is a muscle deliberately parked at MV during a specialisation
 * block — and telling those two apart needs a per-muscle priority the model
 * has no input for yet, so a caller that has one must override rather than
 * trust the label.
 *
 * `high` is a separate failure, not more junk: above the ceiling the volume is
 * unrecoverable rather than merely unproductive.
 */
export type VolumeDose = "below_maintenance" | "junk" | "optimal" | "high";

export function classifyVolumeDose(
  sets: number,
  landmark: VolumeLandmark
): VolumeDose {
  if (sets < landmark.mv) return "below_maintenance";
  if (sets < landmark.low) return "junk";
  if (sets > landmark.high) return "high";
  return "optimal";
}

export type VolumeStatus = "low" | "optimal" | "high";

/**
 * The three-band view every existing consumer reads. Derived from the ladder
 * above rather than reimplementing the comparisons, so the two cannot disagree
 * about where a boundary sits — the sub-MEV bands both fold back to `low`,
 * which is exactly what they were before MV existed.
 */
export function classifyVolume(
  sets: number,
  landmark: VolumeLandmark
): VolumeStatus {
  const dose = classifyVolumeDose(sets, landmark);
  return dose === "below_maintenance" || dose === "junk" ? "low" : dose;
}

/** Don't push any single accessory beyond this many sets. */
const ACCESSORY_SET_CAP = 5;
/** Safety bound on auto-added sets per muscle per week. */
const MAX_ADDED_SETS_PER_MUSCLE = 6;

/**
 * Floors the landmark reconciler may cut a slot down to. Accessories share
 * the balancers' 2-set floor; a MAIN keeps at least 3 working sets — the
 * progression anchor still needs enough exposures to progress on, and 3 is
 * the lowest main-set prescription anywhere in the corpus's worked examples.
 */
const RECONCILE_ACCESSORY_FLOOR = 2;
const RECONCILE_MAIN_FLOOR = 3;

/** The slot's PRIMARY canonical muscle as the TALLY sees it — delegates to
 *  `primaryCanonicalForExercise` plus the tally's Cardio exclusion, so the
 *  reconciler can never cut a slot the tally attributes differently (a
 *  treadmill naming "Legs" must not be cut to fix Quads). */
function primaryCanonicalMuscle(ex: ProgramExercise): CanonicalMuscle | null {
  const dbEx: Exercise | undefined = getExerciseById(ex.exerciseId);
  if (dbEx?.category === "Cardio") return null;
  return primaryCanonicalForExercise(ex);
}

/**
 * Landmark reconciliation (ADR-0010's staged condition): shrink the authored
 * week until no muscle the builders can reach sits above its volume ceiling.
 *
 * Why this exists: the day builders hard-code slot counts, the balancers are
 * ADD-only, and at the literature's 1:1 counting the authored weeks run to
 * 230% of a ceiling (measured: Back 46 vs 20 at 6d hypertrophy). Over-MRV
 * volume is the unrecoverable failure — RP Ch3: above MRV the added work
 * costs recovery and returns nothing — so the generator must not author it.
 *
 * Contract, chosen for the smallest defensible blast radius:
 *   - SHRINK-ONLY, sets only. Never deletes a slot, never reorders, never
 *     touches identity — positional accessory carry and findExisting stay
 *     valid, and no user-visible exercise disappears.
 *   - Only slots whose PRIMARY muscle is over the ceiling are cut. A slot is
 *     never punished for its secondary credit (cutting bench because
 *     Shoulders read high would starve Chest); secondaries drain anyway as
 *     their over-authored primaries shrink, which at 1:1 is exactly the
 *     cascade that does most of the work.
 *   - Accessories cut before mains (floor 2 before a main drops below its
 *     authored count; mains floor 3), largest slot first, then day/slot
 *     order — fully deterministic, one set per step, tally recomputed every
 *     step so cross-muscle cascades are always current.
 *   - Muscles whose overage the builders cannot reach (all primary slots at
 *     floor) are left over the ceiling and REPORTED by the D-VOL ratchet —
 *     an honest residual, not a silent one. Session budget only ever frees
 *     up, and the add-only balancer runs after this pass, so under-floor
 *     muscles are topped back up from the freed budget within the ceilings.
 */
export function reconcileToLandmarks(
  workouts: WorkoutDay[],
  landmark: VolumeLandmark
): WorkoutDay[] {
  const days = workouts.map((d) => ({
    ...d,
    exercises: d.exercises.map((e) => ({ ...e })),
  }));
  const floorFor = (ex: ProgramExercise) =>
    ex.isAccessory === true ? RECONCILE_ACCESSORY_FLOOR : RECONCILE_MAIN_FLOOR;

  // One set moves per iteration; the bound is generous (a week tops out
  // around 120 authored sets) and exists so a logic bug can't spin forever.
  for (let guard = 0; guard < 500; guard += 1) {
    const tally = new Map(
      weeklyVolumeByMuscle(days).map((v) => [v.muscle, v.sets])
    );
    const over = [...tally.entries()]
      .filter(([, sets]) => sets > landmark.high)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

    let cutMade = false;
    for (const [muscle] of over) {
      const candidates: Array<{ di: number; ei: number; ex: ProgramExercise }> =
        [];
      days.forEach((d, di) => {
        if (d.skipped) return; // fineTally skips these — stay consistent
        d.exercises.forEach((ex, ei) => {
          if ((ex.sets ?? 0) <= floorFor(ex)) return;
          if (primaryCanonicalMuscle(ex) !== muscle) return;
          candidates.push({ di, ei, ex });
        });
      });
      if (candidates.length === 0) continue; // unreachable overage — next muscle
      candidates.sort(
        (a, b) =>
          Number(b.ex.isAccessory === true) -
            Number(a.ex.isAccessory === true) ||
          (b.ex.sets ?? 0) - (a.ex.sets ?? 0) ||
          a.di - b.di ||
          a.ei - b.ei
      );
      const target = candidates[0];
      days[target.di].exercises[target.ei].sets = (target.ex.sets ?? 0) - 1;
      cutMade = true;
      break; // recompute the tally before choosing the next cut
    }
    if (!cutMade) break; // in-band, or every remaining overage is floor-bound
  }
  return days;
}

/**
 * Working sets one session may contain before the balancers stop adding to it.
 *
 * At roughly 2.5–3 minutes per working set including rest, 18 sets is an hour
 * of work plus warm-up — the session length both Helms and Meadows treat as
 * the practical ceiling, and past which the last exercises are performed
 * tired rather than well.
 *
 * This is the budget backlog #15 was originally DEFERRED on ("needs a
 * volume-budget decision first — a full-body day is already long"). Its STATUS
 * later dismissed that worry as unfounded, and a 2026-07-28 audit measured the
 * dismissal to be wrong in exactly the way the deferral predicted: marking the
 * full-body builder's slots as accessories made them growable for the first
 * time, and a 3-day full-body week went 42 → 54 weekly sets, 14 → 20 in a
 * single session. The volume balancing is CORRECT — it had simply never run
 * for full-body users before — but it needs the bound it was always missing.
 *
 * The builders are not policed by this. A session the builders author over
 * budget stays as authored; the balancers just don't add to it.
 */
const MAX_SETS_PER_SESSION = 18;

function sessionSets(day: WorkoutDay): number {
  return day.exercises.reduce((n, e) => n + (e.sets ?? 0), 0);
}

/** The day this exercise sits in, or null if it isn't in the week. */
function dayOf(
  days: WorkoutDay[],
  exercise: ProgramExercise
): WorkoutDay | null {
  return days.find((d) => d.exercises.includes(exercise)) ?? null;
}

/** Would growing this exercise take its session past the length budget? */
function overshootsSession(
  days: WorkoutDay[],
  exercise: ProgramExercise
): boolean {
  const day = dayOf(days, exercise);
  if (!day) return false;
  return sessionSets(day) + 1 > MAX_SETS_PER_SESSION;
}

/**
 * Would growing this exercise by a set take a muscle that is currently AT OR
 * BELOW its landmark high above it?
 *
 * The balancers are add-only, which was reasoned about as the safe direction
 * ("trimming wanted work is the riskier direction") but had no ceiling at all
 * — so chasing one under-dosed muscle up to MEV freely pushed the muscles that
 * SHARE the exercise past MRV. A 2026-07-28 audit measured generated weeks
 * violating the app's own landmarks in both directions at once: hypertrophy
 * 6-day came out Back=39 / Shoulders=29 against a high of 20, while
 * hamstrings sat at 11 against a low of 12.
 *
 * This does not trim anything — the add-only stance is unchanged. It only
 * declines an ADD whose cost lands on a muscle that is at or over its
 * ceiling. Adds elsewhere are unaffected, so this is a targeted veto rather
 * than a freeze: in a week where the back is over MRV, hamstring and quad
 * top-ups still happen; only the pull accessories stop growing.
 */
function overshootsCeiling(
  days: WorkoutDay[],
  exercise: ProgramExercise,
  landmark: VolumeLandmark
): boolean {
  const before = new Map(
    weeklyVolumeByMuscle(days).map((v) => [v.muscle, v.sets])
  );
  exercise.sets += 1;
  const after = weeklyVolumeByMuscle(days);
  exercise.sets -= 1;
  return after.some(
    (v) => v.sets > landmark.high && v.sets > (before.get(v.muscle) ?? 0)
  );
}

/**
 * Make the volume model active (D-LIFT-1) — nudge UNDER-dosed muscles up toward
 * the landmark low (MEV) by adding sets to their existing ACCESSORIES. Pure;
 * returns a new workouts array (inputs untouched).
 *
 * Deliberately conservative + add-only:
 *   - mains are never touched (they're the progression anchor);
 *   - only accessories whose PRIMARY muscle is under-dosed gain sets;
 *   - each accessory is capped (`ACCESSORY_SET_CAP`) and total adds per muscle
 *     are bounded (`MAX_ADDED_SETS_PER_MUSCLE`);
 *   - over-MRV trimming is intentionally NOT done here — auto-generated programs
 *     rarely exceed MRV and trimming wanted work is the riskier direction;
 *   - a muscle with no accessory to grow is left as-is (adding a brand-new
 *     exercise is out of scope for "gate accessory volume").
 *
 * Legacy programs whose exercises predate the `isAccessory` flag have no
 * eligible accessories and pass through unchanged (balanced on next regen).
 */
export function balanceWeeklyVolume(
  workouts: WorkoutDay[],
  landmark: VolumeLandmark
): WorkoutDay[] {
  const days = workouts.map((d) => ({
    ...d,
    exercises: d.exercises.map((e) => ({ ...e })),
  }));

  const volumeOf = (muscle: CanonicalMuscle): number =>
    weeklyVolumeByMuscle(days).find((v) => v.muscle === muscle)?.sets ?? 0;

  for (const muscle of CANONICAL_MUSCLE_ORDER) {
    if (volumeOf(muscle) >= landmark.low) continue;

    // Accessories (on non-skipped days) whose primary is this muscle.
    const candidates = days
      .filter((d) => !d.skipped)
      .flatMap((d) => d.exercises)
      .filter(
        (e) => e.isAccessory && primaryCanonicalForExercise(e) === muscle
      );
    if (candidates.length === 0) continue;

    let added = 0;
    while (
      volumeOf(muscle) < landmark.low &&
      added < MAX_ADDED_SETS_PER_MUSCLE
    ) {
      // Grow the lowest-set addable accessory first (keeps volume even), and
      // skip any whose growth would tip a different muscle over its ceiling.
      const target = candidates
        .filter((e) => e.sets < ACCESSORY_SET_CAP)
        .sort((a, b) => a.sets - b.sets)
        .find(
          (e) =>
            !overshootsCeiling(days, e, landmark) && !overshootsSession(days, e)
        );
      if (!target) break; // all capped, or every add overshoots elsewhere
      target.sets += 1;
      added += 1;
    }
  }

  return days;
}

// Movement categories grouped by push vs pull (knee/hip/core are neither).
// Push:pull balance is computed at the MOVEMENT level (robust + unambiguous)
// rather than the muscle level — the canonical "Shoulders" group lumps the
// push-y front delt with the pull-y rear delt, so a muscle-level ratio would
// be misleading.
const PUSH_CATEGORIES = new Set([
  "horizontal_push",
  "vertical_push",
  "arms_triceps",
]);
const PULL_CATEGORIES = new Set([
  "horizontal_pull",
  "vertical_pull",
  "arms_biceps",
]);

/** Safety bound on auto-added pull sets per week. */
const MAX_ADDED_PULL_SETS = 8;

function categorySetTotals(workouts: WorkoutDay[]): {
  push: number;
  pull: number;
} {
  let push = 0;
  let pull = 0;
  for (const day of workouts) {
    if (day.skipped) continue;
    for (const ex of day.exercises) {
      const sets = ex.sets ?? 0;
      if (sets <= 0) continue;
      if (PUSH_CATEGORIES.has(ex.movementCategory)) push += sets;
      else if (PULL_CATEGORIES.has(ex.movementCategory)) pull += sets;
    }
  }
  return { push, pull };
}

/**
 * Push/pull balance (D-LIFT-3) — keep weekly PULL volume at least equal to PUSH.
 * Pull-dominant programming protects the shoulders (the most-cited balance
 * principle) and the procedural builders skew slightly push-heavy. When push >
 * pull, grow PULL accessories until pull ≥ push. Pure; conservative + add-only,
 * same rails as the volume balancer (accessories only, mains untouched, each
 * capped, total bounded). Uses movement category (not muscle) so it's immune to
 * the front/rear-delt lumping. Add-only — never trims push.
 */
export function balancePushPull(
  workouts: WorkoutDay[],
  landmark?: VolumeLandmark
): WorkoutDay[] {
  const days = workouts.map((d) => ({
    ...d,
    exercises: d.exercises.map((e) => ({ ...e })),
  }));

  const pullAccessories = days
    .filter((d) => !d.skipped)
    .flatMap((d) => d.exercises)
    .filter((e) => e.isAccessory && PULL_CATEGORIES.has(e.movementCategory));
  if (pullAccessories.length === 0) return days; // nothing to grow

  let added = 0;
  while (added < MAX_ADDED_PULL_SETS) {
    const { push, pull } = categorySetTotals(days);
    if (pull >= push) break;
    const target = pullAccessories
      .filter((e) => e.sets < ACCESSORY_SET_CAP)
      .sort((a, b) => a.sets - b.sets)
      .find(
        (e) =>
          (!landmark || !overshootsCeiling(days, e, landmark)) &&
          !overshootsSession(days, e)
      );
    if (!target) break; // all capped, or every add overshoots a ceiling
    target.sets += 1;
    added += 1;
  }

  return days;
}
