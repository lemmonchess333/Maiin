/**
 * Routine blueprints (ROUTINE-EXCHANGE-01) — curated library + model.
 *
 * A blueprint is a routine with INTENT: purpose, equipment, exercise
 * order and set/rep prescription — more useful than a generic "Push
 * Day" post. v1 ships the Tropos-curated library only (GsPb1 lock:
 * "curated plus invite-only sharing first; no creator marketplace"),
 * authored from the existing exercise database so every id resolves.
 *
 * Contract:
 *   - Blueprints carry NO personal working weights — saving one
 *     creates a PRIVATE SavedRoutine copy with weights blank (0);
 *     the member's own history drives loads from there.
 *   - Saving never touches the programme (savedRoutines are an extra
 *     session; explicit day replacement is a separate, later flow).
 *   - Circle sharing announces the blueprint via the existing
 *     `routine_shared` event kind (title text only — the allowlist
 *     carries nothing else).
 */

import { getExerciseById } from "@/lib/exercises";
import type { SaveRoutineInput } from "@/lib/savedRoutines";

export type BlueprintPurpose =
  | "strength"
  | "hypertrophy"
  | "short_session"
  | "home"
  | "travel"
  | "hybrid";

export const PURPOSE_LABELS: Record<BlueprintPurpose, string> = {
  strength: "Strength",
  hypertrophy: "Muscle",
  short_session: "Short session",
  home: "Home",
  travel: "Travel",
  hybrid: "Hybrid",
};

export interface BlueprintExercise {
  exerciseId: string;
  /** Display name — denormalised so the UI never depends on lookup. */
  name: string;
  sets: number;
  /** Rep prescription; for timed holds the summary carries the cue. */
  reps: number;
  /** Optional per-exercise cue ("45s holds", "each leg"). */
  cue?: string;
}

export interface RoutineBlueprint {
  id: string;
  title: string;
  purpose: BlueprintPurpose;
  equipment: string;
  /** One-line intent, shown on the card. */
  description: string;
  exercises: BlueprintExercise[];
  /** Attribution is fixed at authorship — immutable by contract. */
  source: "tropos";
}

const bp = (
  id: string,
  title: string,
  purpose: BlueprintPurpose,
  equipment: string,
  description: string,
  exercises: Array<[string, string, number, number, string?]>
): RoutineBlueprint => ({
  id,
  title,
  purpose,
  equipment,
  description,
  source: "tropos",
  exercises: exercises.map(([exerciseId, name, sets, reps, cue]) => ({
    exerciseId,
    name,
    sets,
    reps,
    ...(cue ? { cue } : {}),
  })),
});

/** The launch library — 10 blueprints, every exerciseId resolves
 *  against src/lib/exercises (pinned in tests). */
export const CURATED_BLUEPRINTS: RoutineBlueprint[] = [
  bp(
    "hotel-upper",
    "Hotel Upper Body",
    "travel",
    "Dumbbells only",
    "A full upper session from one pair of dumbbells.",
    [
      ["db-bench", "Dumbbell Bench Press", 3, 10],
      ["db-row", "Dumbbell Row", 3, 10, "each side"],
      ["db-shoulder-press", "Dumbbell Shoulder Press", 3, 10],
      ["hammer-curl", "Hammer Curl", 2, 12],
      ["tricep-kickback", "Tricep Kickback", 2, 12],
    ]
  ),
  bp(
    "bodyweight-reset",
    "Bodyweight Reset",
    "home",
    "No equipment",
    "Nothing but floor space — consistency over intensity.",
    [
      ["bodyweight-squat", "Bodyweight Squat", 3, 15],
      ["push-ups", "Push-Ups", 3, 12],
      ["bodyweight-lunge", "Bodyweight Lunge", 3, 12, "each leg"],
      ["glute-bridge", "Glute Bridge", 3, 15],
      ["plank", "Plank", 3, 1, "45s holds"],
    ]
  ),
  bp(
    "thirty-min-full-body",
    "30-Minute Full Body",
    "short_session",
    "Dumbbells or gym",
    "The most valuable hour, in half the time.",
    [
      ["goblet-squat", "Goblet Squat", 3, 10],
      ["db-bench", "Dumbbell Bench Press", 3, 10],
      ["db-row", "Dumbbell Row", 3, 10, "each side"],
      ["plank", "Plank", 2, 1, "45s holds"],
    ]
  ),
  bp(
    "strength-foundation-a",
    "Strength Foundation A",
    "strength",
    "Barbell + rack",
    "The classic A-day: squat, press, pull.",
    [
      ["squat", "Barbell Squat", 5, 5],
      ["bench-press", "Bench Press", 5, 5],
      ["barbell-row", "Barbell Row", 3, 8],
    ]
  ),
  bp(
    "strength-foundation-b",
    "Strength Foundation B",
    "strength",
    "Barbell + rack",
    "The B-day pair: hinge, press overhead, hang on.",
    [
      ["deadlift", "Deadlift", 3, 5],
      ["overhead-press", "Overhead Press", 5, 5],
      ["pull-ups", "Pull-Ups", 3, 6],
    ]
  ),
  bp(
    "hypertrophy-push",
    "Hypertrophy Push",
    "hypertrophy",
    "Full gym",
    "Chest, shoulders and triceps with enough volume to grow.",
    [
      ["bench-press", "Bench Press", 4, 8],
      ["incline-db-press", "Incline Dumbbell Press", 3, 10],
      ["db-shoulder-press", "Dumbbell Shoulder Press", 3, 10],
      ["lateral-raise", "Lateral Raise", 3, 15],
      ["rope-tricep-pushdown", "Rope Tricep Pushdown", 3, 12],
    ]
  ),
  bp(
    "hypertrophy-pull",
    "Hypertrophy Pull",
    "hypertrophy",
    "Full gym",
    "Back width, back thickness, and arms to finish.",
    [
      ["barbell-row", "Barbell Row", 4, 8],
      ["lat-pulldown", "Lat Pulldown", 3, 10],
      ["seated-row", "Seated Row", 3, 10],
      ["face-pulls", "Face Pulls", 3, 15],
      ["db-curl", "Dumbbell Curl", 3, 12],
    ]
  ),
  bp(
    "hypertrophy-legs",
    "Hypertrophy Legs",
    "hypertrophy",
    "Full gym",
    "Quads, hamstrings and calves — the whole lower half.",
    [
      ["squat", "Barbell Squat", 4, 8],
      ["romanian-deadlift", "Romanian Deadlift", 3, 10],
      ["leg-press", "Leg Press", 3, 12],
      ["seated-leg-curl", "Seated Leg Curl", 3, 12],
      ["standing-calf-raise", "Standing Calf Raise", 4, 12],
    ]
  ),
  bp(
    "hybrid-support",
    "Hybrid Support",
    "hybrid",
    "Dumbbells + rack",
    "Lifting that supports your running, not competes with it.",
    [
      ["goblet-squat", "Goblet Squat", 3, 8],
      ["hip-thrust", "Hip Thrust", 3, 10],
      ["bulgarian-split", "Bulgarian Split Squat", 3, 8, "each leg"],
      ["chin-ups", "Chin-Ups", 3, 6],
      ["plank", "Plank", 3, 1, "45s holds"],
    ]
  ),
  bp(
    "travel-conditioning",
    "Travel Conditioning",
    "travel",
    "No equipment",
    "Heart rate up, core switched on, done in 25 minutes.",
    [
      ["burpees", "Burpees", 3, 12],
      ["mountain-climbers", "Mountain Climbers", 3, 20],
      ["russian-twist", "Russian Twist", 3, 20],
      ["dead-bug", "Dead Bug", 3, 10, "each side"],
      ["side-plank", "Side Plank", 3, 1, "30s each side"],
    ]
  ),
];

/** Validation guard — used by tests to pin the library and by any
 *  future user-authored path before a blueprint is accepted. */
export function validateBlueprint(b: RoutineBlueprint): string[] {
  const problems: string[] = [];
  if (!b.title || b.title.length > 60) problems.push("title bound");
  if (b.exercises.length === 0 || b.exercises.length > 12)
    problems.push("exercise count bound");
  for (const ex of b.exercises) {
    if (!getExerciseById(ex.exerciseId))
      problems.push(`unknown exercise: ${ex.exerciseId}`);
    if (ex.sets < 1 || ex.sets > 10) problems.push(`sets bound: ${ex.name}`);
    if (ex.reps < 1 || ex.reps > 100) problems.push(`reps bound: ${ex.name}`);
  }
  return problems;
}

/**
 * Convert to a SavedRoutine input — a PRIVATE copy with personal
 * weights BLANK (0): the recipient's own history drives loads.
 */
export function blueprintToRoutineInput(b: RoutineBlueprint): SaveRoutineInput {
  return {
    name: b.title,
    sourceActivityId: `blueprint:${b.id}`,
    sourceAuthorId: "tropos",
    sourceAuthorName: "Tropos",
    exercises: b.exercises.map((ex) => ({
      name: ex.name,
      exerciseId: ex.exerciseId,
      summary: `${ex.sets}×${ex.reps}${ex.cue ? ` (${ex.cue})` : ""}`,
      setCount: ex.sets,
      targetReps: ex.reps,
      targetWeightKg: 0,
    })),
  };
}
