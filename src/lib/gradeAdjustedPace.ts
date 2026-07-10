/**
 * Grade-adjusted pace (GAP) — DISPLAY-ONLY (Run13 lock, item 4).
 *
 * Answers "what would this hilly run's pace have been on the flat?" as a
 * calm single line on Run Summary / Run Detail. It deliberately feeds
 * NOTHING else: `runFitness` auto-derive, `paceTrends`, and PR flags all
 * stay on raw pace until this model earns trust on device — the engine
 * feed is its own later decision (see the Run13 plan-file row).
 *
 * Model: Minetti et al. (2002) energy cost of gradient running,
 * C(i) = 155.4i⁵ − 30.4i⁴ − 43.3i³ + 46.3i² + 19.5i + 3.6 J/kg/m, applied
 * as a symmetric loop: saved runs carry total ascent only (no signed
 * profile), so we assume the gain is repaid — half the distance at average
 * uphill grade, half at the mirror downhill. The flat-equivalent factor is
 * (C(+g) + C(−g)) / 2·C(0); convexity of C makes it ≥ 1, so GAP is never
 * slower than raw pace under this model. That is the conservative choice
 * for a display-only estimate: a net-uphill point-to-point run is
 * under-credited, never over-credited.
 */

/**
 * Material-climb gate: the line only renders when the run averaged at
 * least this many metres of ascent per km. Below it the adjustment is
 * under ~1% — noise, not signal — and the calm line would just be clutter
 * on every run. Tune here, not at call sites.
 */
export const MATERIAL_CLIMB_GAIN_PER_KM = 8;

/** Under 1 km there is no meaningful average grade to speak of. */
export const MIN_DISTANCE_METERS = 1000;

/**
 * Average-grade clamp. Minetti's polynomial is fitted to ±45%; beyond
 * ~30% average over a whole run the input is almost certainly barometer /
 * GPS elevation noise, so the adjustment stops growing there instead of
 * chasing it.
 */
const MAX_ABS_GRADE = 0.3;

export interface GradeAdjustedPaceInput {
  distanceMeters: number;
  durationSeconds: number;
  elevationGainMeters: number;
}

export interface GradeAdjustedPaceResult {
  /** Flat-equivalent pace, seconds per km. Always ≤ rawSecondsPerKm. */
  gapSecondsPerKm: number;
  rawSecondsPerKm: number;
  /** Average ascent density that passed the material-climb gate, m/km. */
  gainPerKm: number;
}

/** Minetti (2002) metabolic cost of running at grade i, J/kg/m. */
function minettiCost(grade: number): number {
  const i = grade;
  return (
    155.4 * i ** 5 -
    30.4 * i ** 4 -
    43.3 * i ** 3 +
    46.3 * i ** 2 +
    19.5 * i +
    3.6
  );
}

/**
 * Returns the flat-equivalent pace for a materially hilly run, or null
 * when the gate isn't met or the inputs can't support an estimate
 * (short / flat / malformed runs). Callers gate platform semantics
 * themselves (outdoor-GPS only — treadmill and manual runs have no real
 * elevation signal).
 */
export function gradeAdjustedPace(
  input: GradeAdjustedPaceInput
): GradeAdjustedPaceResult | null {
  const { distanceMeters, durationSeconds, elevationGainMeters } = input;
  if (
    !Number.isFinite(distanceMeters) ||
    !Number.isFinite(durationSeconds) ||
    !Number.isFinite(elevationGainMeters)
  ) {
    return null;
  }
  if (distanceMeters < MIN_DISTANCE_METERS) return null;
  if (durationSeconds <= 0 || elevationGainMeters <= 0) return null;

  const km = distanceMeters / 1000;
  const gainPerKm = elevationGainMeters / km;
  if (gainPerKm < MATERIAL_CLIMB_GAIN_PER_KM) return null;

  const rawSecondsPerKm = durationSeconds / km;

  // Symmetric-loop average grade: the ascent happens over half the
  // distance, mirrored by an equal descent over the other half.
  const grade = Math.min(
    (2 * elevationGainMeters) / distanceMeters,
    MAX_ABS_GRADE
  );
  const factor =
    (minettiCost(grade) + minettiCost(-grade)) / (2 * minettiCost(0));

  return {
    gapSecondsPerKm: rawSecondsPerKm / factor,
    rawSecondsPerKm,
    gainPerKm,
  };
}

/**
 * "M:SS" per-km formatting, same floor convention as `calculatePace` in
 * lib/gps.ts so the GAP line reads like every other pace in the app.
 */
export function formatSecondsPerKm(secondsPerKm: number): string {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return "--:--";
  const mins = Math.floor(secondsPerKm / 60);
  const secs = Math.floor(secondsPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
