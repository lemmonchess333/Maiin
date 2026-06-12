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
 * v1 is read-only: it surfaces the tally; it does NOT yet drive selection
 * (that's the follow-up once the landmark bands are validated).
 */
import { getExerciseById, type Exercise } from "@/lib/exercises";
import type { WorkoutDay } from "./programTypes";

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
