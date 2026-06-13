/**
 * Pure derivation of the per-day "did you hit it?" facts the target-dependent
 * nutrition badges need, by joining a day's intake TOTALS against the target
 * SNAPSHOT persisted for that day (src/lib/dailyNutritionSnapshot.ts) and the
 * per-day water doc (waterLog/{date}).
 *
 * Output is three date lists the badge engine consumes:
 *  - macroMasterDays — all of protein/carbs/fat within ±5% of target (the
 *    `macro_master` "perfect day", also the nutrition leg of `triple_threat`).
 *  - proteinHitDays  — protein total ≥ target (the `protein_pro` 7-in-a-row).
 *  - waterHitDays    — glasses ≥ target (the `hydration_hero` 7-in-a-row).
 *
 * A day with no target snapshot (pre-feature, or target not set up) contributes
 * to NOTHING — there is no honest target to judge it against. Kept pure + map-in
 * so it's unit-testable without Firestore.
 */

/** ±5% band for `macro_master` — "hit all macros within 5% for a day". */
export const MACRO_TARGET_BAND = 0.05;

export interface DayMacros {
  protein: number;
  carbs: number;
  fat: number;
}

export interface DayWater {
  glasses: number;
  target: number;
}

export interface NutritionBadgeDays {
  macroMasterDays: string[];
  proteinHitDays: string[];
  waterHitDays: string[];
}

/** total within ±band of a POSITIVE target. A non-positive target is never
 *  "hit within band" — there's no meaningful goal to land inside. */
function withinBand(total: number, target: number, band: number): boolean {
  if (!(target > 0)) return false;
  if (!Number.isFinite(total)) return false;
  return Math.abs(total - target) / target <= band;
}

/**
 * @param mealTotalsByDay date → intake macro totals (from the meals window)
 * @param macroTargetsByDay date → target macros (the per-day snapshot)
 * @param waterByDay date → { glasses, target } (waterLog/{date})
 */
export function computeNutritionBadgeDays(
  mealTotalsByDay: Map<string, DayMacros>,
  macroTargetsByDay: Map<string, DayMacros>,
  waterByDay: Map<string, DayWater>
): NutritionBadgeDays {
  const macroMasterDays: string[] = [];
  const proteinHitDays: string[] = [];

  for (const [date, totals] of mealTotalsByDay) {
    const target = macroTargetsByDay.get(date);
    if (!target) continue; // no snapshot for this day → not judgeable

    // Protein is a floor: hitting target means meeting OR exceeding it.
    if (target.protein > 0 && totals.protein >= target.protein) {
      proteinHitDays.push(date);
    }

    // macro_master: ALL three macros inside the ±5% band.
    if (
      withinBand(totals.protein, target.protein, MACRO_TARGET_BAND) &&
      withinBand(totals.carbs, target.carbs, MACRO_TARGET_BAND) &&
      withinBand(totals.fat, target.fat, MACRO_TARGET_BAND)
    ) {
      macroMasterDays.push(date);
    }
  }

  const waterHitDays: string[] = [];
  for (const [date, w] of waterByDay) {
    if (w.target > 0 && w.glasses >= w.target) waterHitDays.push(date);
  }

  return { macroMasterDays, proteinHitDays, waterHitDays };
}
