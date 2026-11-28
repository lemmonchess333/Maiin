/**
 * Post-run GPS start/end crop helper.
 *
 * Trims leading or trailing GPS points (for example, forgetting to stop the
 * watch after getting in a car, or walking around before GPS locked) and
 * recomputes distance, moving duration, average pace, splits, elevation gain,
 * calories, best efforts, and route preview using the canonical GPS helpers.
 */
import {
  calculateSplits,
  detectBestEfforts,
  estimateRunCalories,
  haversine,
  isImpossibleStep,
  movingClockMs,
  totalElevationGain,
  type GPSPoint,
  type Split,
} from "./gps";
import {
  KEPT_ROUTE_POINTS,
  sampleRoute,
  type RouteCoordinate,
} from "./routeSegments";

export const MIN_CROP_POINTS = 2;
export const MIN_CROP_DISTANCE_M = 50;

export interface CroppedRunStats {
  points: GPSPoint[];
  distance: number;
  duration: number;
  avgPace: number;
  splits: Split[];
  elevationGain: number;
  calories: number;
  bestEfforts: ReturnType<typeof detectBestEfforts>;
  routePreview: RouteCoordinate[];
}

export type CropRunResult =
  { ok: true; data: CroppedRunStats } | { ok: false; reason: string };

/**
 * Crop `points` to the inclusive range `[startIndex, endIndex]` and recompute
 * all derived run statistics. Returns `{ ok: false, reason }` if the selection
 * leaves fewer than 2 points, under 50 m of moving distance, or zero time.
 */
export function cropRunTrace(
  points: readonly GPSPoint[],
  startIndex: number,
  endIndex: number,
  weightKg: number
): CropRunResult {
  if (points.length < MIN_CROP_POINTS) {
    return {
      ok: false,
      reason: "This route does not have enough GPS points to crop.",
    };
  }
  const from = Math.max(0, Math.min(Math.floor(startIndex), points.length - 1));
  const to = Math.max(0, Math.min(Math.floor(endIndex), points.length - 1));
  if (to - from + 1 < MIN_CROP_POINTS) {
    return { ok: false, reason: "Keep at least two GPS points in the route." };
  }

  const sliced: GPSPoint[] = points
    .slice(from, to + 1)
    .map((pt, idx) =>
      idx === 0 && pt.breakBefore ? { ...pt, breakBefore: false } : { ...pt }
    );

  let distance = 0;
  let movingMs = 0;
  for (let i = 1; i < sliced.length; i += 1) {
    const prev = sliced[i - 1];
    const curr = sliced[i];
    if (curr.breakBefore) continue;
    const stepM = haversine(prev.lat, prev.lon, curr.lat, curr.lon);
    const dtMs = Math.max(0, movingClockMs(curr) - movingClockMs(prev));
    const dtSec = dtMs / 1000;
    if (dtSec > 0 && isImpossibleStep(stepM, dtSec)) continue;
    distance += stepM;
    movingMs += dtMs;
  }

  const roundedDistance = Math.round(distance);
  if (roundedDistance < MIN_CROP_DISTANCE_M) {
    return {
      ok: false,
      reason: "Cropped route must stay at least 50 m long.",
    };
  }

  const fallbackDuration =
    sliced[sliced.length - 1].timestamp > sliced[0].timestamp
      ? (sliced[sliced.length - 1].timestamp - sliced[0].timestamp) / 1000
      : 0;
  const duration = Math.max(
    1,
    Math.round(movingMs > 0 ? movingMs / 1000 : fallbackDuration)
  );
  if (duration <= 0) {
    return { ok: false, reason: "Cropped route has no elapsed time." };
  }

  const avgPace = Math.round(duration / (roundedDistance / 1000));
  const splits = calculateSplits(sliced);
  const elevationGain = totalElevationGain(sliced);
  const safeWeight = Number.isFinite(weightKg) && weightKg > 0 ? weightKg : 70;
  const calories = estimateRunCalories(roundedDistance, safeWeight);
  const bestEfforts = detectBestEfforts(sliced, roundedDistance);
  const storedPoints = sampleRoute(sliced, KEPT_ROUTE_POINTS);
  const routePreview = sampleRoute(sliced, 20).map((p) => ({
    lat: p.lat,
    lon: p.lon,
  }));

  return {
    ok: true,
    data: {
      points: storedPoints,
      distance: roundedDistance,
      duration,
      avgPace,
      splits,
      elevationGain,
      calories,
      bestEfforts,
      routePreview,
    },
  };
}
