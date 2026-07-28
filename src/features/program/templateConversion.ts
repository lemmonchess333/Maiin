/**
 * Template → program-state exercise conversion (training-book backlog P1).
 *
 * Extracted from Onboarding.tsx so the boundary is unit-testable. This seam
 * used to be lossy in four ways (documented in
 * docs/proposals/training-book-reviews.md, section 1 P1 / section 3 B3 /
 * section 5 N2): authored rep ranges collapsed to their bottom number via
 * parseInt, per-exercise restSeconds was dropped, progressionType was
 * hardcoded "linear" regardless of the template's goal, and isAccessory was
 * never set (so volume balancing treated template accessories as mains).
 */

import type { TemplateExercise } from "@/features/program/templates";
import type {
  PrimaryGoal,
  ProgramExercise,
  ProgressionType,
} from "@/features/program/programTypes";
import { goalProfileFor } from "@/features/program/programEngine";
import { inferMovementCategory } from "@/lib/exerciseMovementCategory";

/**
 * Parse an authored template rep string.
 *
 * - `"8-12"` → reps 8 (the working floor / double-progression start) with
 *   repRangeMax 12 (the climb ceiling).
 * - `"10"` → reps 10, no range.
 * - Duration/format strings (`"30-45s"`, `"10/leg"`, holds) keep the legacy
 *   parseInt-or-8 behaviour and get NO range — time-based progression is a
 *   separate backlog item (N2's time axis, tier-3 #7); until it exists,
 *   fabricating a rep range from a seconds range would make the progression
 *   engine "climb" a duration as if it were reps.
 */
export function parseTemplateReps(reps: string): {
  reps: number;
  repRangeMax?: number;
} {
  const range = /^(\d+)\s*-\s*(\d+)$/.exec(reps.trim());
  if (range) {
    const lo = parseInt(range[1], 10);
    const hi = parseInt(range[2], 10);
    if (hi > lo) return { reps: lo, repRangeMax: hi };
    return { reps: lo };
  }
  return { reps: parseInt(reps, 10) || 8 };
}

/**
 * Progression scheme for a template's MAIN lifts, derived from the template's
 * own training goal (templates are only adopted on a goal match, so this is
 * also the user's goal). Accessories no longer consult this at all — backlog
 * #7 (H3) moved isolations to double progression on both paths, since
 * `isAccessory` IS the compound/isolation discriminator Helms's rule keys on.
 */
export function templateProgressionFor(templateGoal: string): ProgressionType {
  // goalProfileFor only defaults on undefined, not on unknown strings — an
  // unrecognised template goal would return undefined and crash on
  // .mainProgression. Guard to the general profile instead.
  const known: PrimaryGoal[] = [
    "strength",
    "hypertrophy",
    "fat_loss",
    "general",
    "running",
  ];
  const goal = known.includes(templateGoal as PrimaryGoal)
    ? (templateGoal as PrimaryGoal)
    : undefined;
  return goalProfileFor(goal).mainProgression;
}

export function templateExToProgEx(
  te: TemplateExercise,
  mainProgression: ProgressionType
): ProgramExercise {
  const { reps, repRangeMax } = parseTemplateReps(te.reps);
  const isAccessory = te.isAccessory === true;
  return {
    name: te.name,
    exerciseId: te.exerciseId,
    /* Was hardcoded "horizontal_push" — caused every template-derived
       day to mis-tag muscle groups on the social activity card (Pull A
       showed "horizontal_push" because every exercise inherited the
       default). Inference is name-based: see lib/exerciseMovementCategory. */
    movementCategory: inferMovementCategory(te.name, te.exerciseId),
    sets: te.sets,
    // Volume-ramp anchor (backlog #5) — advanceWeek derives weekly sets
    // from this; without it a template-derived plan would lazily anchor
    // on whatever week it first advanced from.
    baseSets: te.sets,
    reps,
    // Reset anchor for the progression engine: on a load increase the rep
    // target returns here (the bottom of the authored range), not to
    // whatever the target had climbed to.
    baseReps: reps,
    ...(repRangeMax !== undefined ? { repRangeMax } : {}),
    weight: 0,
    // Backlog #7 (H3): the scheme belongs to the exercise, not the goal —
    // isolations climb reps within their authored range, mains follow the
    // goal profile. Templates already author accessory ranges ("12-15"), so
    // the range-aware branch has something to climb from day one.
    progressionType: isAccessory ? "double" : mainProgression,
    // Per-exercise rest authored in the template; WorkoutSession prefers it
    // over profile.defaultRestSeconds unless the user overrides mid-session.
    restSeconds: te.restSeconds,
    isAccessory,
    lastSuccessfulWeight: 0,
    lastAttemptedWeight: 0,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    // Carry `notes` from the template through to program state so the
    // injury-substitution rationale written by `applyInjuryFilters`
    // survives the conversion — previously dropped, so users saw their
    // swapped exercises with no context for why.
    ...(te.notes !== undefined ? { notes: te.notes } : {}),
  };
}
