/**
 * Pure detection helpers for the Food hero card's streak completion celebration.
 *
 * "Hit" is defined as consumed ≥ target (≥, not within ±5%).
 * "Just completed all" fires when prev was NOT all hit AND next IS all hit.
 */

export interface MacroTotals {
  protein: number;
  carbs: number;
  fat: number;
}

export interface MacroTargets {
  protein: number;
  carbs: number;
  fat: number;
}

export function allMacrosHit(totals: MacroTotals, targets: MacroTargets): boolean {
  return (
    totals.protein >= targets.protein &&
    totals.carbs >= targets.carbs &&
    totals.fat >= targets.fat
  );
}

/**
 * Returns true only if `prev` did NOT have all macros hit
 * AND `next` does. I.e. the log that just landed completed the set.
 */
export function didJustCompleteAll(
  prev: MacroTotals,
  next: MacroTotals,
  targets: MacroTargets,
): boolean {
  return !allMacrosHit(prev, targets) && allMacrosHit(next, targets);
}

/**
 * ISO date (YYYY-MM-DD) in local time. Used as the localStorage flag
 * so the celebration only fires once per calendar day.
 */
export function todayIsoDate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
