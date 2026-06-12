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
import type { MovementCategory, WorkoutDay } from "./programTypes";

export type Experience = "beginner" | "intermediate" | "advanced";

export interface StartingLoadContext {
  bodyweightKg: number;
  experience: Experience;
  /** Lowers the estimate for female lifters (relative strength differs most on
   *  upper-body pressing); anything non-female is treated as the male/default. */
  sex?: string;
}

// Working-weight as a fraction of bodyweight, by movement pattern × experience.
// vertical_pull is bodyweight (0); arms/core get a small BW-relative seed.
const BW_MULTIPLE: Record<MovementCategory, Record<Experience, number>> = {
  horizontal_push: { beginner: 0.45, intermediate: 0.7, advanced: 0.95 },
  vertical_push: { beginner: 0.3, intermediate: 0.45, advanced: 0.6 },
  horizontal_pull: { beginner: 0.45, intermediate: 0.65, advanced: 0.85 },
  vertical_pull: { beginner: 0, intermediate: 0, advanced: 0 }, // bodyweight
  knee_dominant: { beginner: 0.7, intermediate: 1.05, advanced: 1.4 },
  hip_dominant: { beginner: 0.85, intermediate: 1.25, advanced: 1.65 },
  arms_biceps: { beginner: 0.12, intermediate: 0.18, advanced: 0.24 },
  arms_triceps: { beginner: 0.12, intermediate: 0.18, advanced: 0.24 },
  core: { beginner: 0, intermediate: 0, advanced: 0 }, // mostly bodyweight
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
 * pattern given the user's bodyweight / experience / sex. Returns 0 for
 * bodyweight patterns (the caller leaves those as bodyweight).
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

/**
 * Seed cold-start starting weights on a generated week. Reweights only the
 * MAIN lifts (not accessories) that have NEVER been trained
 * (`performanceHistory` empty) and carry a real (non-bodyweight) load — so a
 * fresh program reflects the user's size/level, while any lift with logged
 * history keeps its progressed weight. Pure; returns a new workouts array.
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
    exercises: day.exercises.map((ex) => {
      const untrained = (ex.performanceHistory?.length ?? 0) === 0;
      if (ex.isAccessory || !untrained || (ex.weight ?? 0) <= 0) return ex;
      const seed = startingWeightForCategory(ex.movementCategory, ctx);
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
