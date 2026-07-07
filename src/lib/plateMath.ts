/**
 * Plate calculator maths (#985 — the last missing in-session logging
 * primitive vs Hevy/Strong). Standard Olympic bar + metric plate set;
 * greedy decomposition is exact for this denomination set because every
 * plate is a multiple of the smallest (1.25): whatever remains after the
 * larger plates is still a multiple of 1.25 and gets finished by 1.25s,
 * so greedy can't strand remainder a different combo would have covered.
 * (It is NOT the "each plate ≥ 2× the next" coin property — 25 vs 20
 * breaks that — so if the plate set ever changes, keep the smallest
 * plate a common divisor of all the others or exactness is lost.)
 */

export const DEFAULT_BAR_KG = 20;
/** Per-side plate denominations, descending (standard metric gym set). */
export const DEFAULT_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];

export interface PlateBreakdown {
  barKg: number;
  /** e.g. [{ plateKg: 20, count: 1 }, { plateKg: 2.5, count: 1 }] per side. */
  perSide: { plateKg: number; count: number }[];
  /** Weight that couldn't be plated with the denomination set (0 = exact). */
  remainderKg: number;
  /** The exactly-loadable weight (targetKg − remainderKg). */
  loadableKg: number;
}

/**
 * Decompose a target barbell weight into per-side plates. Returns null
 * when the target doesn't reach the bar (nothing to plate — the UI shows
 * "just the bar" copy for exact-bar weights via an empty perSide).
 */
export function platesPerSide(
  targetKg: number,
  barKg: number = DEFAULT_BAR_KG,
  plates: number[] = DEFAULT_PLATES_KG
): PlateBreakdown | null {
  if (!Number.isFinite(targetKg) || targetKg < barKg) return null;

  let perSideRemaining = (targetKg - barKg) / 2;
  const perSide: { plateKg: number; count: number }[] = [];
  for (const plate of [...plates].sort((a, b) => b - a)) {
    if (plate <= 0) continue;
    const count = Math.floor((perSideRemaining + 1e-9) / plate);
    if (count > 0) {
      perSide.push({ plateKg: plate, count });
      perSideRemaining -= count * plate;
    }
  }
  const remainderKg = Math.round(perSideRemaining * 2 * 100) / 100;
  return {
    barKg,
    perSide,
    remainderKg,
    loadableKg: Math.round((targetKg - remainderKg) * 100) / 100,
  };
}
