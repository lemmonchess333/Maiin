/**
 * The colours a run's route is drawn in on the post-run maps (the finish
 * screen and a saved run), and the key under the map that names them.
 *
 * Each stretch of the route is coloured by how its pace compares with the
 * run's OWN average pace: the ratio is the stretch's seconds per km over
 * the average's. There is no target in it, so the key names none ("On
 * pace" would claim one).
 *
 * One table, read by both `RunMap` (to colour) and `PaceLegend` (to draw
 * the key), so the key cannot describe a different set of colours from
 * the one on the route: a step added here appears in both.
 *
 * Three steps, green to amber to coral, so the colours read as one scale
 * from faster to slower. A brand-purple step around the average sat
 * between green and amber until 2026-10-04: purple is the lifting colour,
 * and in the middle of a fast-to-slow scale it read as a fourth thing
 * rather than a step between two others.
 */
import { THEME } from "@/lib/theme";
import {
  movingClockMs,
  pausedMsOf,
  segmentMetres,
  type GPSPoint,
} from "@/lib/gps";

export interface RoutePaceStep {
  /** The step covers stretches whose pace ratio is below this. */
  below: number;
  color: string;
}

/** Fastest first: the order the key reads, "Faster" to "Slower". */
export const ROUTE_PACE_STEPS: readonly RoutePaceStep[] = [
  // More than 8% quicker than the run's average.
  { below: 0.92, color: THEME.paceFast },
  // Around the average: from 8% quicker to 10% slower.
  { below: 1.1, color: THEME.warning },
  // Slower than that.
  { below: Infinity, color: THEME.paceSlow },
];

/** The colour of a stretch whose pace is `ratio` times the average. A
 *  ratio that is not a number reads as the slowest step, as it did before
 *  the steps were a table. */
export function routePaceColor(ratio: number): string {
  for (const step of ROUTE_PACE_STEPS) {
    if (ratio < step.below) return step.color;
  }
  return ROUTE_PACE_STEPS[ROUTE_PACE_STEPS.length - 1].color;
}

/**
 * Half the length of route each stretch's pace is measured over, in
 * metres: 100 m each way, 200 m in all.
 *
 * Measured over the few metres between two fixes, GPS wobble alone moved
 * the colour. Run through the app's own filter, a perfectly steady run
 * changed colour 26 to 210 times a kilometre at 1 to 3 m of GPS error,
 * and up to half of it read faster or slower than the run. Over 200 m the
 * same wobble moves the pace by a percent or two, while a surge, a hill or
 * a walk still shows, with its edges blurred by at most 100 m.
 */
export const ROUTE_PACE_HALF_WINDOW_M = 100;

/**
 * Each stretch's pace against the run's average, as the ratio
 * `routePaceColor` takes, measured over the route around it
 * (`ROUTE_PACE_HALF_WINDOW_M` each way, on the moving clock, with the
 * splits' distance rule).
 *
 * `ratios[i]` is for the stretch from point `i - 1` to point `i`. It is
 * null where a stretch has no pace of its own: the first point, the jump
 * into a new piece of route after a gap (`breakBefore`), and the line
 * across a pause, which was not run. The window never reaches across a
 * gap; near either end of a piece it slides inward so it still covers
 * 200 m where the piece is that long.
 */
export function routePaceRatios(
  points: readonly GPSPoint[],
  avgPaceSecPerKm: number,
  halfWindowM: number = ROUTE_PACE_HALF_WINDOW_M
): (number | null)[] {
  const ratios: (number | null)[] = new Array(points.length).fill(null);
  if (points.length < 2 || !(avgPaceSecPerKm > 0)) return ratios;
  let start = 0;
  while (start < points.length) {
    let end = start + 1;
    while (end < points.length && !points[end].breakBefore) end++;
    measurePiece(points, start, end, avgPaceSecPerKm, halfWindowM, ratios);
    start = end;
  }
  return ratios;
}

/** One continuous piece, points `start` to `end - 1`. */
function measurePiece(
  points: readonly GPSPoint[],
  start: number,
  end: number,
  avgPaceSecPerKm: number,
  halfWindowM: number,
  ratios: (number | null)[]
) {
  const count = end - start;
  if (count < 2) return;
  // Distance along the piece and the moving clock at each point. The clock
  // never steps back, as in the splits.
  const along = new Array<number>(count);
  const clock = new Array<number>(count);
  along[0] = 0;
  clock[0] = movingClockMs(points[start]);
  for (let k = 1; k < count; k++) {
    along[k] =
      along[k - 1] + segmentMetres(points[start + k - 1], points[start + k]);
    clock[k] = Math.max(clock[k - 1], movingClockMs(points[start + k]));
  }
  const length = along[count - 1];

  /** The moving clock where the piece reaches `metres`. */
  const clockAt = (metres: number): number => {
    let lo = 0;
    let hi = count - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (along[mid] <= metres) lo = mid;
      else hi = mid;
    }
    const span = along[hi] - along[lo];
    const share = span > 0 ? (metres - along[lo]) / span : 0;
    return clock[lo] + share * (clock[hi] - clock[lo]);
  };

  for (let k = 1; k < count; k++) {
    const i = start + k;
    if (pausedMsOf(points[i]) > pausedMsOf(points[i - 1])) continue;
    const centre = (along[k - 1] + along[k]) / 2;
    const from = Math.max(
      0,
      Math.min(centre - halfWindowM, length - 2 * halfWindowM)
    );
    const to = Math.min(length, from + 2 * halfWindowM);
    const seconds = (clockAt(to) - clockAt(from)) / 1000;
    // No distance or no time to measure: the stretch reads as the run's
    // average, as it did when it was measured on its own.
    ratios[i] =
      to > from && seconds > 0
        ? ((seconds / (to - from)) * 1000) / avgPaceSecPerKm
        : 1;
  }
}
