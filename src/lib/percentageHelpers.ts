/**
 * Tiny percentage helpers used across the macro / progress UI.
 *
 * Pulled out of HeroDrillDownSheet's inline copy so the same
 * implementation is used everywhere `(consumed / target) * 100`
 * needs to clamp to 0–100.
 */

/**
 * Compute a 0–100 integer percentage of consumed-vs-target.
 *
 * Contract:
 *   - target <= 0 → 0 (no ring to fill against).
 *   - Result clamped to 0–100.
 *   - Rounded to the nearest integer.
 */
export function clampPct(consumed: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((consumed / target) * 100)));
}
