/**
 * Warm-up ramp (training-book backlog #12 — P5, spec N7, pattern N11).
 *
 * Tropos prescribes zero lifting warm-up. Runs get a warmup/cooldown, and
 * `WorkoutSession` has a `"warmup"` SetType — but only as a tag a user can
 * apply to a set they already logged. Every author in the review warms into
 * top sets, and every reference lifting app (Hevy, Strong, Fitbod) computes
 * the ramp for you.
 *
 * Two specifics make this shippable rather than bloating every session:
 *
 * - **N7's scoping rule**: ramp before the FIRST heavy exercise per body
 *   part, not before every exercise. That's the detail the other sources
 *   lacked. So bench gets a ramp and the incline press after it doesn't.
 * - **N11's shape**: warm-up sets are ordinary prescription rows with a
 *   flag, not a parallel structure. `SetType` already exists, so the display
 *   side is largely there.
 *
 * The ramp is deliberately shorter than N7's five steps (bar×15, 50%×8,
 * 60%×4, 70%×3, 75%×2). That spec is written for a lifter under a heavy bar;
 * three rows is the useful version for a general audience, and the count
 * self-scales — a 30 kg bench gets one bar set, a 140 kg squat gets three.
 * Presentation policy: QUIETLY VISIBLE — pre-filled rows labelled "Warm-up",
 * which reduce novice anxiety rather than adding a concept to learn.
 *
 * Warm-up rows are NOT logged work. They carry the `warmup` type so the
 * session's volume, PR and calorie paths already exclude them, and
 * `WorkoutSession` strips them from the payload it sends to the completion
 * command — otherwise the server, which sees only `{weight, reps, completed}`,
 * would count them as real sets and inflate tonnage, set count and calories
 * straight into the performance baselines.
 */

import type { ProgramExercise } from "./programTypes";
import { primaryCanonicalForExercise } from "./volumeModel";
import { getExerciseById } from "@/lib/exercises";

export interface WarmupSet {
  weight: number;
  reps: number;
}

/** An empty barbell. Also the floor — there is nothing to ramp up from below it. */
export const BAR_KG = 20;

/** Load at or above which the bar itself is worth a dedicated first set. */
const BAR_SET_MIN_WORKING_KG = 50;

/** Percentage steps of the working weight, heaviest last. */
const RAMP_STEPS: ReadonlyArray<{ pct: number; reps: number }> = [
  { pct: 0.5, reps: 5 },
  { pct: 0.7, reps: 3 },
];

const roundToIncrement = (kg: number, increment: number) =>
  Math.round(kg / increment) * increment;

/**
 * The ramp for one lift, from its working weight. Empty when there is
 * nothing sensible to ramp: bodyweight and uncalibrated lifts (weight 0),
 * and anything at or below the bar.
 */
export function warmupRamp(
  workingWeight: number,
  equipment = "Barbell"
): WarmupSet[] {
  if (!Number.isFinite(workingWeight) || workingWeight <= 0) return [];
  if (equipment === "Bodyweight") return [];

  const isBarbell = equipment === "Barbell";
  if (isBarbell && workingWeight <= BAR_KG) return [];

  const out: WarmupSet[] = [];
  if (isBarbell && workingWeight >= BAR_SET_MIN_WORKING_KG) {
    out.push({ weight: BAR_KG, reps: 10 });
  }
  for (const { pct, reps } of RAMP_STEPS) {
    // Barbell work stays on the existing 2.5 kg plate grid. Dumbbells,
    // machines and cables use the same conservative grid, but crucially have
    // no imaginary 20 kg bar floor.
    const weight = roundToIncrement(workingWeight * pct, 2.5);
    const aboveFloor = isBarbell ? weight > BAR_KG : weight > 0;
    if (
      aboveFloor &&
      weight < workingWeight &&
      !out.some((set) => set.weight === weight)
    ) {
      out.push({ weight, reps });
    }
  }
  // A light barbell lift can end up with nothing above the bar; give it the
  // empty bar. Non-barbell movements keep their percentage ramp instead.
  if (out.length === 0 && isBarbell) {
    out.push({ weight: BAR_KG, reps: 10 });
  }
  return out;
}

export interface InitialSessionSet {
  reps: number;
  weight: number;
  completed: boolean;
  type: "warmup" | "working";
}

/**
 * One canonical constructor for a fresh session. Resume-reset and first mount
 * must produce the same rows; keeping this here also makes the boundary
 * testable without rendering the full workout screen.
 */
export function buildInitialSetLogs(
  exercises: ProgramExercise[]
): InitialSessionSet[][] {
  const ramps = warmupTargets(exercises);
  return exercises.map((ex, i) => [
    ...(ramps[i]
      ? warmupRamp(ex.weight, getExerciseById(ex.exerciseId)?.equipment).map(
          (set) => ({
            ...set,
            completed: false,
            type: "warmup" as const,
          })
        )
      : []),
    ...Array.from({ length: ex.sets }, () => ({
      reps: ex.reps,
      weight: ex.weight,
      completed: false,
      type: "working" as const,
    })),
  ]);
}

/**
 * The set logs as the completion command should see them — warm-ups removed.
 *
 * Extracted so this boundary is testable: `WorkoutSession` itself has no test
 * coverage, and this is the one place where getting it wrong is silent and
 * consequential. The command payload carries only `{weight, reps, completed}`,
 * and the server builds the saved workout from `logs.filter(l => l.completed)`
 * — so a completed warm-up row that reached it would be indistinguishable
 * from a working set and would inflate tonnage, set count and calories, which
 * feed the performance baselines the adjustment rule (#9) then reads.
 *
 * Filtering happens WITHIN each exercise's array, so the outer index still
 * lines up with `day.exercises` — the server maps them positionally.
 */
export function toCompletionSetLogs<
  T extends { weight: number; reps: number; completed: boolean; type: string },
>(
  setLogs: T[][]
): Array<Array<{ weight: number; reps: number; completed: boolean }>> {
  return setLogs.map((exSets) =>
    exSets
      .filter((s) => s.type !== "warmup")
      .map((s) => ({ weight: s.weight, reps: s.reps, completed: s.completed }))
  );
}

/**
 * N7's scoping rule, per day: the first LOADED exercise for each body part
 * gets a ramp; later exercises for the same body part are already warm.
 *
 * Body part is the canonical muscle the volume model attributes the lift to,
 * so the two copies speak the same language — the alternative (movement
 * category) would warm up a horizontal AND a vertical press for the same
 * shoulders. Unattributable lifts (cardio/whole-body) never ramp.
 */
export function warmupTargets(exercises: ProgramExercise[]): boolean[] {
  const seen = new Set<string>();
  return exercises.map((ex) => {
    if (
      warmupRamp(ex.weight, getExerciseById(ex.exerciseId)?.equipment)
        .length === 0
    ) {
      return false;
    }
    const muscle = primaryCanonicalForExercise(ex);
    if (!muscle || seen.has(muscle)) return false;
    seen.add(muscle);
    return true;
  });
}
