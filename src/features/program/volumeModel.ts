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
 *   - and 0.5 toward each SECONDARY group it trains
 * Exercises with no muscle attribution (Cardio / "Full Body" conditioning, or
 * too-coarse labels) are excluded — this is a *resistance* volume view.
 *
 * It both SURFACES the tally (WeeklyVolumeCard) and DRIVES selection:
 * `balanceWeeklyVolume` nudges under-dosed muscles toward the landmark low by
 * growing their accessories (add-only, mains untouched).
 */
import { getExerciseById, type Exercise } from "@/lib/exercises";
import type { ProgramExercise, WorkoutDay } from "./programTypes";

export type CanonicalMuscle =
  | "Chest"
  | "Back"
  | "Shoulders"
  | "Biceps"
  | "Triceps"
  | "Quads"
  | "Hamstrings"
  | "Glutes"
  | "Calves"
  | "Core";

/** Display order (push → pull → legs → core), used by the summary UI. */
export const CANONICAL_MUSCLE_ORDER: CanonicalMuscle[] = [
  "Chest",
  "Shoulders",
  "Triceps",
  "Back",
  "Biceps",
  "Quads",
  "Hamstrings",
  "Glutes",
  "Calves",
  "Core",
];

// Map every muscleGroup / secondaryMuscle string in the exercise DB to a
// canonical group, or null to EXCLUDE from the resistance-volume tally
// (cardio, whole-body conditioning, or labels too coarse to attribute).
const MUSCLE_TO_CANONICAL: Record<string, CanonicalMuscle | null> = {
  // Chest
  pectorals: "Chest",
  chest: "Chest",
  "upper chest": "Chest",
  "lower chest": "Chest",
  // Back
  lats: "Back",
  "mid back": "Back",
  "middle back": "Back",
  "full back": "Back",
  "lower back": "Back",
  rhomboids: "Back",
  "teres major": "Back",
  traps: "Back",
  back: "Back",
  // Shoulders
  deltoids: "Shoulders",
  shoulders: "Shoulders",
  "front delts": "Shoulders",
  "side delts": "Shoulders",
  "rear delts": "Shoulders",
  "rotator cuff": "Shoulders",
  // Arms
  biceps: "Biceps",
  triceps: "Triceps",
  // Legs
  quads: "Quads",
  "hip flexors": "Quads",
  adductors: "Quads",
  hamstrings: "Hamstrings",
  "posterior chain": "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  soleus: "Calves",
  // Core
  core: "Core",
  abs: "Core",
  "lower abs": "Core",
  obliques: "Core",
  // Excluded — not attributable resistance volume
  "full body": null,
  cardio: null,
  legs: null,
  arms: null,
  forearms: null,
  brachioradialis: null,
  "hip flexors ": null,
};

// Fallback when an exercise isn't in the DB (custom exercise): attribute by its
// movement category so custom lifts still count.
const CATEGORY_TO_CANONICAL: Record<string, CanonicalMuscle> = {
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

function toCanonical(name: string | undefined): CanonicalMuscle | null {
  if (!name) return null;
  return MUSCLE_TO_CANONICAL[name.toLowerCase().trim()] ?? null;
}

/** The canonical PRIMARY muscle an exercise trains (DB primary, else movement
 *  category for custom lifts), or null when unattributable (cardio/whole-body). */
export function primaryCanonicalForExercise(
  ex: ProgramExercise
): CanonicalMuscle | null {
  const dbEx = getExerciseById(ex.exerciseId);
  if (dbEx) return toCanonical(dbEx.muscleGroup);
  return CATEGORY_TO_CANONICAL[ex.movementCategory] ?? null;
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

/**
 * Weekly sets per canonical muscle group across a week's workouts. Skipped days
 * are excluded (no stimulus); completed/planned days count. Returns only
 * muscles with non-zero volume, in CANONICAL_MUSCLE_ORDER.
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
      if (dbEx) {
        const primary = toCanonical(dbEx.muscleGroup);
        // Unattributable primary (e.g. Cardio/Full Body) → skip the whole lift.
        if (!primary) continue;
        add(primary, sets);
        for (const sec of dbEx.secondaryMuscles ?? []) {
          add(toCanonical(sec), sets * 0.5);
        }
      } else {
        // Custom exercise not in the DB — attribute by movement category.
        add(CATEGORY_TO_CANONICAL[ex.movementCategory] ?? null, sets);
      }
    }
  }

  return CANONICAL_MUSCLE_ORDER.filter((m) => (tally.get(m) ?? 0) > 0).map(
    (m) => ({ muscle: m, sets: Math.round((tally.get(m) ?? 0) * 2) / 2 })
  );
}

export interface VolumeLandmark {
  /** Below this = under-dosed (under MEV). */
  low: number;
  /** Above this = high (approaching MRV). */
  high: number;
}

/**
 * Goal-driven weekly set landmarks per muscle (simplified RP MEV–MAV bands).
 * `primaryGoal` is the training intent. Hypertrophy carries the highest target;
 * strength is lower-volume/higher-intensity; fat-loss/running lean lower.
 */
export function volumeLandmark(
  primaryGoal: string | undefined
): VolumeLandmark {
  switch (primaryGoal) {
    case "hypertrophy":
      return { low: 12, high: 20 };
    case "strength":
      return { low: 8, high: 14 };
    case "fat_loss":
    case "running":
      return { low: 6, high: 14 };
    case "general":
    default:
      return { low: 8, high: 16 };
  }
}

export type VolumeStatus = "low" | "optimal" | "high";

export function classifyVolume(
  sets: number,
  landmark: VolumeLandmark
): VolumeStatus {
  if (sets < landmark.low) return "low";
  if (sets > landmark.high) return "high";
  return "optimal";
}

/** Don't push any single accessory beyond this many sets. */
const ACCESSORY_SET_CAP = 5;
/** Safety bound on auto-added sets per muscle per week. */
const MAX_ADDED_SETS_PER_MUSCLE = 6;

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
      // Grow the lowest-set addable accessory first (keeps volume even).
      const target = candidates
        .filter((e) => e.sets < ACCESSORY_SET_CAP)
        .sort((a, b) => a.sets - b.sets)[0];
      if (!target) break; // all capped
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
export function balancePushPull(workouts: WorkoutDay[]): WorkoutDay[] {
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
      .sort((a, b) => a.sets - b.sets)[0];
    if (!target) break; // all capped
    target.sets += 1;
    added += 1;
  }

  return days;
}
