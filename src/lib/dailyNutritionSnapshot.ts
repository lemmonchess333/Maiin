/**
 * Daily nutrition TARGET snapshot — the "snapshot target per day" half of the
 * nutrition-badge plan (macro_master / protein_pro / triple_threat).
 *
 * WHY this exists: those badges ask "did you hit your macro target on day X?".
 * The target for a past day is day-type-dependent (lift/run/rest carb↔fat split,
 * Pro-gated adaptive TDEE) and can't be faithfully RE-derived later from
 * history. So we persist the target as it stood ON that day, keyed by date, and
 * the badge engine reads the stored target rather than recomputing it. This is
 * inherently FORWARD-LOOKING: a day with no snapshot simply isn't badge-eligible
 * — there is no honest target to check it against.
 *
 * This module is the pure core (build + signature); the write lives in
 * `useDailyNutritionSnapshot`. Daily intake TOTALS are NOT stored here — they're
 * derived from the meals the badge engine already has in its window. Per-day
 * WATER (glasses + target) already lives on `waterLog/{date}`, so hydration_hero
 * needs no snapshot.
 */

export interface DailyTargetSnapshot {
  /** YYYY-MM-DD (local) — the doc id this snapshot is written under. */
  date: string;
  targetCalories: number;
  targetProtein: number;
  targetCarbs: number;
  targetFat: number;
}

/** The macro-target fields lifted off `EffectiveTargets`. */
export interface SnapshotTargetInput {
  finalTarget: number;
  protein: number;
  carbs: number;
  fat: number;
}

function roundNonNeg(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/**
 * Build the per-day macro-target snapshot payload, or `null` when the target
 * isn't usable yet (no/zero calorie target — e.g. profile not set up). Returning
 * null is the writer's skip signal, so we never persist an empty/garbage target
 * that the badge engine would later read as a real (unhittable) goal.
 */
export function buildTargetSnapshot(
  date: string,
  t: SnapshotTargetInput
): DailyTargetSnapshot | null {
  if (!date) return null;
  if (!Number.isFinite(t.finalTarget) || t.finalTarget <= 0) return null;
  return {
    date,
    targetCalories: roundNonNeg(t.finalTarget),
    targetProtein: roundNonNeg(t.protein),
    targetCarbs: roundNonNeg(t.carbs),
    targetFat: roundNonNeg(t.fat),
  };
}

/**
 * Stable change-detection signature. INCLUDES the date so a new day always
 * writes its own doc (one snapshot per calendar day), while an unchanged target
 * re-render within the same day is a no-op write.
 */
export function snapshotSignature(s: DailyTargetSnapshot): string {
  return `${s.date}:${s.targetCalories}:${s.targetProtein}:${s.targetCarbs}:${s.targetFat}`;
}
