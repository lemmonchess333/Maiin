/**
 * Barbell plate calculator (#985, lifting arc).
 *
 * Given a target weight and a bar, returns the plates to load PER SIDE — the
 * "don't do per-side math mid-set" convenience Strong/Hevy have and Tropos
 * lacked. Greedy from the largest plate gives the heaviest loadable weight that
 * is ≤ target (standard gym plate denominations are canonical, so greedy is
 * optimal); when the exact target isn't makeable we report the nearest-below
 * plus the leftover, rather than failing.
 *
 * Weights are in the app's internal unit (kg — WorkoutSession logs in kg).
 * Unit-neutral by construction: pass a matching plate set for any unit. Micro
 * plates are included by the caller only when the `microloading` setting is on.
 *
 * Pure — table-tested like `raceGoalPlanner`.
 */

/** Standard kg plates, descending. */
export const STANDARD_PLATES_KG = [25, 20, 15, 10, 5, 2.5] as const;
/** Micro plates, added when microloading is enabled. */
export const MICRO_PLATES_KG = [1.25, 0.5] as const;
/** Default Olympic barbell. */
export const DEFAULT_BAR_KG = 20;

export interface PlateResult {
  /** Plates to load on EACH side, descending. Empty when target ≤ bar. */
  perSide: number[];
  /** Total weight actually loadable (bar + 2 × perSide), ≤ target. */
  achievable: number;
  /** True when `achievable` hits the target exactly. */
  exact: boolean;
  /** Target − achievable, ≥ 0 (how far short the nearest-below load is). */
  leftover: number;
}

const EPSILON = 1e-9;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * @param target   desired total weight (incl. bar)
 * @param bar      bar weight (default 20 kg)
 * @param plates   available plate denominations (unlimited supply), any order
 */
export function platesPerSide(
  target: number,
  bar: number = DEFAULT_BAR_KG,
  plates: readonly number[] = STANDARD_PLATES_KG
): PlateResult {
  // Below or at the bar → nothing to load.
  if (target <= bar + EPSILON) {
    return {
      perSide: [],
      achievable: bar,
      exact: Math.abs(target - bar) < EPSILON,
      leftover: Math.max(0, round2(target - bar)),
    };
  }

  const desc = [...plates].sort((a, b) => b - a);
  let perSideRemaining = (target - bar) / 2;
  const perSide: number[] = [];

  for (const plate of desc) {
    while (perSideRemaining >= plate - EPSILON) {
      perSide.push(plate);
      perSideRemaining = round2(perSideRemaining - plate);
    }
  }

  const perSideLoaded = perSide.reduce((s, p) => s + p, 0);
  const achievable = round2(bar + 2 * perSideLoaded);
  return {
    perSide,
    achievable,
    exact: Math.abs(achievable - target) < EPSILON,
    leftover: Math.max(0, round2(target - achievable)),
  };
}
