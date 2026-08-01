/**
 * Cold-start starting loads (D-LIFT-5).
 *
 * The procedural builders hardcode absolute starting weights (bench 60kg, squat
 * 80kg, …) for EVERY user, so a 55kg beginner and a 95kg advanced lifter both
 * start identically — unrealistic for the most-seen state (every new user).
 * This derives a bodyweight-relative starting WORKING weight per movement
 * pattern from data onboarding already captures: bodyweight, experience, sex.
 * No new persisted field — the bodyweight-relative option from the audit.
 *
 * The multiples are deliberately CONSERVATIVE working weights for the goal rep
 * range (~8 reps), not 1RMs — a slightly-light start is self-correcting (the
 * progression engine ramps load fast), whereas too-heavy risks failed first
 * sessions. Pure + mirror-ready.
 */
import { EXERCISES, getExerciseById } from "@/lib/exercises";
import { inferMovementCategory } from "@/lib/exerciseMovementCategory";

import type {
  Experience,
  MovementCategory,
  ProgramExercise,
  WorkoutDay,
} from "./programTypes";
import {
  loadFactorFor,
  movementCategoryForExerciseId,
  rescaleForSwap,
} from "./variationBank";

// Re-exported, not redeclared. This was a hand-written duplicate of the union
// `programTypes.VALID_EXPERIENCE` already derives — a second copy of one
// vocabulary, which is the drift hazard the repo's own rules call out, and it
// is what made the import cycle look reasonable in the first place.
export type { Experience };

export interface StartingLoadContext {
  bodyweightKg: number;
  experience: Experience;
  /** Lowers the estimate for female lifters (relative strength differs most on
   *  upper-body pressing); anything non-female is treated as the male/default. */
  sex?: string;
}

// Working-weight as a fraction of bodyweight, by movement pattern × experience.
// Every pattern seeds a LOADED figure; whether a given lift is bodyweight is
// decided per exercise in `startingWeightForExercise`, never per category.
const BW_MULTIPLE: Record<MovementCategory, Record<Experience, number>> = {
  horizontal_push: { beginner: 0.45, intermediate: 0.7, advanced: 0.95 },
  vertical_push: { beginner: 0.3, intermediate: 0.45, advanced: 0.6 },
  horizontal_pull: { beginner: 0.45, intermediate: 0.65, advanced: 0.85 },
  // Both of these read 0 until 2026-08-01, on the reasoning that the category
  // PRIMARY is bodyweight (pull-ups) or near enough (core). That confused the
  // primary with the category: `startingWeightForExercise` short-circuits on
  // `base <= 0`, so a zero here made EVERY member unseedable — including the
  // loaded ones, whose `loadFactor` in the bank (lat-pulldown 0.6,
  // single-arm 0.25, pallof-press 0.5) was dead code it could never reach.
  // A beginner with a shoulder injury was substituted off pull-ups onto
  // "Lat Pulldown 4×8 @ 0 kg" in 12 of the 216 audited configs.
  // The per-EXERCISE guards already zero what should be zero — `BODYWEIGHT_IDS`
  // catches pull-ups / chin-ups / leg-raise / russian-twist by catalog
  // equipment, and `loadFactor: 0` catches ab-wheel — so the category seed is
  // free to describe the loaded members. It is the notional full-range pull
  // (lat-pulldown lands at 0.6× of it), not a pull-up's load.
  vertical_pull: { beginner: 0.75, intermediate: 0.95, advanced: 1.15 },
  knee_dominant: { beginner: 0.7, intermediate: 1.05, advanced: 1.4 },
  hip_dominant: { beginner: 0.85, intermediate: 1.25, advanced: 1.65 },
  arms_biceps: { beginner: 0.12, intermediate: 0.18, advanced: 0.24 },
  arms_triceps: { beginner: 0.12, intermediate: 0.18, advanced: 0.24 },
  // Anchored on the category primary, cable crunch, which IS loaded.
  core: { beginner: 0.35, intermediate: 0.45, advanced: 0.55 },
};

function sexFactor(sex: string | undefined): number {
  return sex === "female" ? 0.75 : 1;
}

/**
 * Build a StartingLoadContext from a profile-like object, or `undefined` when
 * there's no usable bodyweight (→ generateProgram skips seeding and keeps the
 * hardcoded fallbacks). Centralises the experience coercion + the bodyweight
 * guard for every call site.
 */
export function loadContextFrom(
  p: { weightKg?: number; experience?: string; sex?: string } | null | undefined
): StartingLoadContext | undefined {
  if (!p || !p.weightKg || p.weightKg <= 0) return undefined;
  const experience: Experience =
    p.experience === "intermediate" || p.experience === "advanced"
      ? p.experience
      : "beginner";
  return { bodyweightKg: p.weightKg, experience, sex: p.sex };
}

/**
 * Conservative starting WORKING weight (kg, rounded to 2.5) for a movement
 * pattern given the user's bodyweight / experience / sex. This is the
 * category's notional LOADED figure — bodyweight lifts are excluded by
 * identity in `startingWeightForExercise`, not by zeroing a whole pattern.
 */
export function startingWeightForCategory(
  category: MovementCategory,
  ctx: StartingLoadContext
): number {
  const bw = ctx.bodyweightKg;
  if (!Number.isFinite(bw) || bw <= 0) return 0;
  const mult = BW_MULTIPLE[category]?.[ctx.experience] ?? 0;
  if (mult <= 0) return 0;
  const raw = bw * mult * sexFactor(ctx.sex);
  return Math.max(0, Math.round(raw / 2.5) * 2.5);
}

const BODYWEIGHT_IDS: ReadonlySet<string> = new Set(
  EXERCISES.filter((e) => e.equipment === "Bodyweight").map((e) => e.id)
);

/**
 * Starting working weight for a SPECIFIC lift — the category seed scaled by
 * the variation's `loadFactor`, and 0 for anything the catalog calls
 * bodyweight.
 *
 * The category seed alone was only ever right for the category's primary
 * compound. Everything else in the bank inherited it: a beginner's Romanian
 * deadlift, hip thrust and leg curl were all handed the deadlift's 68 kg.
 */
export function startingWeightForExercise(
  exerciseId: string | undefined,
  category: MovementCategory,
  ctx: StartingLoadContext
): number {
  if (exerciseId && BODYWEIGHT_IDS.has(exerciseId)) return 0;
  const base = startingWeightForCategory(category, ctx);
  if (base <= 0) return 0;
  const raw = base * loadFactorFor(exerciseId, category);
  if (raw <= 0) return 0;
  return Math.max(2.5, Math.round(raw / 2.5) * 2.5);
}

/**
 * Safe working load when an exercise identity changes.
 *
 * Same-category loaded swaps preserve earned strength through the variation
 * ratio. Bodyweight boundaries and cross-category substitutions have no valid
 * ratio, so they are freshly seeded when profile context exists and otherwise
 * remain explicitly uncalibrated at 0 kg.
 */
export function weightAfterExerciseSwap(
  ex: Pick<ProgramExercise, "weight" | "exerciseId" | "movementCategory">,
  toExerciseId: string,
  ctx?: StartingLoadContext
): { weight: number; movementCategory: MovementCategory } {
  const catalogTarget = getExerciseById(toExerciseId);
  const targetCategory =
    movementCategoryForExerciseId(toExerciseId) ??
    (catalogTarget
      ? inferMovementCategory(catalogTarget.name, catalogTarget.id)
      : ex.movementCategory);
  const sameCategory = targetCategory === ex.movementCategory;
  const scaled = sameCategory
    ? rescaleForSwap(
        ex.weight ?? 0,
        ex.exerciseId,
        toExerciseId,
        ex.movementCategory
      )
    : 0;
  const weight =
    scaled > 0 || !ctx
      ? scaled
      : startingWeightForExercise(toExerciseId, targetCategory, ctx);
  return { weight, movementCategory: targetCategory };
}

/**
 * Seed cold-start starting weights on a generated week. Reweights every lift
 * that has NEVER been trained (`performanceHistory` empty) and resolves to a
 * loaded exercise — including template rows that arrive uncalibrated at 0 kg
 * — so a fresh program reflects the user's size/level,
 * while any lift with logged history keeps its progressed weight. Pure;
 * returns a new workouts array.
 *
 * CORRECTED 2026-07-28 — this used to skip `isAccessory` slots, which sounded
 * conservative and was not. The flag says what ROLE a slot plays in the
 * session, not whether its hardcoded weight is right for this user, and an
 * audit measured what that conflation cost:
 *
 *   - backlog #15 marked the full-body builder's slots 2-4 as accessories
 *     (correct metadata), and silently switched cold-start seeding OFF for
 *     the entire full-body segment as a side effect. A 80 kg beginner was
 *     then prescribed `Bench Press 35 kg` as the day-0 main and
 *     `Bench Press 60 kg` as a day-2 accessory — the same lift, twice, with
 *     the accessory copy heavier;
 *   - `Barbell Row` sat at its hardcoded 50 kg where the bodyweight-relative
 *     seed is 36 kg.
 *
 * Seeding accessories is only safe now that the weight is derived per
 * EXERCISE (`startingWeightForExercise`) rather than per category — that is
 * what stops a leg curl being seeded like a deadlift.
 *
 * Back-compat: callers without a context don't invoke this, so existing
 * behaviour (hardcoded weights) is unchanged where no profile data exists.
 */
export function seedStartingLoads(
  workouts: WorkoutDay[],
  ctx: StartingLoadContext
): WorkoutDay[] {
  return workouts.map((day) => ({
    ...day,
    exercises: day.exercises.map((ex: ProgramExercise) => {
      const untrained = (ex.performanceHistory?.length ?? 0) === 0;
      if (!untrained) return ex;
      const seed = startingWeightForExercise(
        ex.exerciseId,
        ex.movementCategory,
        ctx
      );
      if (seed <= 0) return ex; // bodyweight pattern — leave as-is
      return {
        ...ex,
        weight: seed,
        lastSuccessfulWeight: seed,
        lastAttemptedWeight: seed,
      };
    }),
  }));
}
