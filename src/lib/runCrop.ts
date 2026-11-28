/**
 * Post-run GPS start/end crop helper.
 *
 * Trims leading or trailing GPS points (for example, forgetting to stop the
 * watch after getting in a car, or walking around before GPS locked) and
 * recomputes distance, moving duration, average pace, splits, elevation gain,
 * calories, best efforts, and route preview using the canonical GPS helpers,
 * and the laps and work portion when the run kept them (`cropLapSplits`).
 *
 * The heart-rate summary is the one derived figure a crop cannot redo: the
 * readings it was made from never leave the phone (`heartRateSession.ts`),
 * so a cropped run's summary would describe the run before the crop. The
 * save removes it (`runCropSave.ts`).
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
import { lapPaceSecondsPerKm, type RunLapSplit } from "./runLaps";

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
  /** The run's laps over the kept stretch; empty when it kept none. */
  lapSplits: RunLapSplit[];
  /** The work segments' time and distance over the kept stretch, read from
   *  its work laps; undefined when the run kept no laps to read it from. */
  workPortion?: { seconds: number; meters: number } | null;
}

/** What else of the saved run a crop recomputes. */
export interface CropRunExtras {
  /** The laps the run saved (`lapSplits`). */
  lapSplits?: readonly RunLapSplit[];
  /** When the run's clock started, ms (`recordingStartedAt`): the laps'
   *  elapsed times count from it. */
  recordingStartedAtMs?: number | null;
}

/** The shortest piece of a lap a crop keeps, in ms: under it, the lap is
 *  gone with the part cropped off. */
const MIN_CROPPED_LAP_MS = 1000;

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
  weightKg: number,
  extras: CropRunExtras = {}
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
  const savedLaps = extras.lapSplits ?? [];
  const lapSplits = cropLapSplits(
    savedLaps,
    points,
    sliced,
    extras.recordingStartedAtMs
  );
  const hadWork = savedLaps.some((lap) => lap.kind === "work");

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
      lapSplits,
      ...(hadWork ? { workPortion: workPortionOf(lapSplits) } : {}),
    },
  };
}

/**
 * The metres the crop counts for each kept step, and the moving clock at
 * each point: the rule `cropRunTrace`'s distance and duration use, so the
 * laps add up to the run.
 */
function keptSteps(sliced: readonly GPSPoint[]): {
  clock: number[];
  metres: number[];
} {
  const clock: number[] = [movingClockMs(sliced[0])];
  const metres: number[] = [0];
  for (let i = 1; i < sliced.length; i += 1) {
    const prev = sliced[i - 1];
    const curr = sliced[i];
    let stepM = 0;
    if (!curr.breakBefore) {
      const m = haversine(prev.lat, prev.lon, curr.lat, curr.lon);
      const dtSec =
        Math.max(0, movingClockMs(curr) - movingClockMs(prev)) / 1000;
      if (!(dtSec > 0 && isImpossibleStep(m, dtSec))) stepM = m;
    }
    clock.push(Math.max(clock[i - 1], movingClockMs(curr)));
    metres.push(metres[i - 1] + stepM);
  }
  return { clock, metres };
}

/** Metres covered by moving-clock time `at`, between the fixes either side. */
function metresAt(
  steps: { clock: number[]; metres: number[] },
  at: number
): number {
  const { clock, metres } = steps;
  if (at <= clock[0]) return 0;
  const last = clock.length - 1;
  if (at >= clock[last]) return metres[last];
  let i = 1;
  while (clock[i] < at) i += 1;
  const span = clock[i] - clock[i - 1];
  const share = span > 0 ? (at - clock[i - 1]) / span : 1;
  return metres[i - 1] + (metres[i] - metres[i - 1]) * share;
}

/**
 * The run's laps over the kept stretch. Each lap's elapsed time counts on
 * the run's moving clock from its start, so it is placed on the trace by
 * time: a lap wholly cropped off goes, a lap the crop cuts keeps the part
 * left, and every lap's distance is measured on the kept trace, so they
 * add up to the cropped run. A manual lap is renumbered; a planned
 * segment keeps its name.
 */
export function cropLapSplits(
  laps: readonly RunLapSplit[],
  points: readonly GPSPoint[],
  sliced: readonly GPSPoint[],
  recordingStartedAtMs?: number | null
): RunLapSplit[] {
  if (laps.length === 0 || points.length === 0 || sliced.length < 2) return [];
  const firstFix = movingClockMs(points[0]);
  const origin =
    typeof recordingStartedAtMs === "number" &&
    Number.isFinite(recordingStartedAtMs) &&
    recordingStartedAtMs <= firstFix
      ? recordingStartedAtMs
      : firstFix;
  const steps = keptSteps(sliced);
  const keptFrom = steps.clock[0];
  const keptTo = steps.clock[steps.clock.length - 1];
  const out: RunLapSplit[] = [];
  let lapStart = origin;
  for (const lap of laps) {
    const lapEnd = lapStart + lap.durationSeconds * 1000;
    const from = Math.max(lapStart, keptFrom);
    const to = Math.min(lapEnd, keptTo);
    lapStart = lapEnd;
    if (to - from < MIN_CROPPED_LAP_MS) continue;
    const durationSeconds = Math.round((to - from) / 1000);
    const distanceMeters = Math.round(
      metresAt(steps, to) - metresAt(steps, from)
    );
    const index = out.length + 1;
    out.push({
      index,
      label: lap.kind === "manual" ? `Lap ${index}` : lap.label,
      kind: lap.kind,
      distanceMeters,
      durationSeconds,
      paceSecondsPerKm: lapPaceSecondsPerKm(distanceMeters, durationSeconds),
    });
  }
  return out;
}

/** The work laps' time and distance, or null when none are left. */
function workPortionOf(
  laps: readonly RunLapSplit[]
): { seconds: number; meters: number } | null {
  const work = laps.filter((lap) => lap.kind === "work");
  if (work.length === 0) return null;
  return {
    seconds: work.reduce((sum, lap) => sum + lap.durationSeconds, 0),
    meters: work.reduce((sum, lap) => sum + lap.distanceMeters, 0),
  };
}
