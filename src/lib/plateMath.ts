/**
 * Pure barbell-loading math for the plate calculator.
 *
 * Standard kit assumptions:
 *   - 20kg Olympic bar.
 *   - Plate set: 25, 20, 15, 10, 5, 2.5, 1.25 kg (the seven kg
 *     plates that ship with the canonical home/commercial racks).
 *   - Greedy descent — pick the heaviest plate that fits, repeat.
 *
 * Returns a per-side breakdown so the UI can mirror it onto both
 * ends of the bar.
 */

export const BAR_WEIGHT_KG = 20;
export const PLATE_SIZES_KG = [25, 20, 15, 10, 5, 2.5, 1.25] as const;

/**
 * For a target total bar weight, return the list of plates to load
 * on ONE side (largest first). Returns [] for bar-only weights
 * (≤ BAR_WEIGHT_KG).
 *
 * Floating-point tolerance: the loop tests `remaining >= plate -
 * 0.001` so 0.25kg of cumulative float error doesn't strand a
 * 1.25kg plate at the bottom of the descent.
 */
export function calculatePlates(targetWeight: number): number[] {
  let remaining = (targetWeight - BAR_WEIGHT_KG) / 2;
  if (remaining <= 0) return [];
  const plates: number[] = [];
  for (const plate of PLATE_SIZES_KG) {
    while (remaining >= plate - 0.001) {
      plates.push(plate);
      remaining -= plate;
    }
  }
  return plates;
}
