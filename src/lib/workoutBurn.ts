/**
 * Canonical workout-burn formula used by every save path.
 *
 * Hybrid-accurate: duration × bodyweight × MET / 60. MET is selected by
 * work density (tonnage / duration) so heavy low-rep sessions, moderate
 * hypertrophy work, and bodyweight / conditioning all land sensibly
 * without needing HR data.
 *
 * METs are deliberately conservative — rest periods are included in
 * wall-clock duration, and published MET tables assume continuous effort.
 * Burns will read 10–20% below some commercial trackers. That's correct
 * for this app's audience.
 */

/**
 * Select MET value for a lift session based on work density.
 *
 *  tonnage == 0                 → MET 4.5  (bodyweight / conditioning)
 *  density < 80 kg/min          → MET 3.5  (low density)
 *  80 ≤ density < 200 kg/min    → MET 4.5  (moderate density)
 *  density ≥ 200 kg/min         → MET 5.5  (high density, heavy low-rep)
 */
export function selectLiftMET(tonnageKg: number, durationMinutes: number): number {
  if (tonnageKg === 0) return 4.5;
  if (durationMinutes <= 0) return 4.5;
  const density = tonnageKg / durationMinutes;
  if (density < 80) return 3.5;
  if (density < 200) return 4.5;
  return 5.5;
}

export interface LiftBurnInput {
  durationMinutes: number;
  tonnageKg: number;
  bodyweightKg: number;
  completedSetCount: number;
}

/**
 * Estimate lift workout calorie burn. Returns a rounded integer kcal.
 *
 * When duration is unavailable (timer didn't start, workout logged after
 * the fact), falls back to ~3 min per completed set. Never falls back to
 * the old `exercises.length × 5` placeholder.
 */
export function estimateLiftBurn(params: LiftBurnInput): number {
  const { durationMinutes, tonnageKg, bodyweightKg, completedSetCount } = params;

  const effectiveDuration = durationMinutes > 0
    ? durationMinutes
    : completedSetCount * 3;

  if (effectiveDuration === 0 || bodyweightKg <= 0) return 0;

  const met = selectLiftMET(tonnageKg, effectiveDuration);
  return Math.round((effectiveDuration * bodyweightKg * met) / 60);
}

export interface RunBurnInput {
  distanceKm: number;
  bodyweightKg: number;
}

/**
 * Estimate run calorie burn. Distance-based, duration-independent.
 * Parallels the existing estimateRunCalories in src/lib/gps.ts but accepts
 * distanceKm directly for backfill / helper symmetry.
 */
export function estimateRunBurn(params: RunBurnInput): number {
  const { distanceKm, bodyweightKg } = params;
  if (distanceKm <= 0 || bodyweightKg <= 0) return 0;
  return Math.round(distanceKm * bodyweightKg * 1.036);
}
