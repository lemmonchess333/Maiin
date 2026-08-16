/**
 * Pace-band colouring for the route map — the ONE source of truth for both
 * the painted line and the legend printed beneath it.
 *
 * It exists because those two had drifted apart. `RunMap` painted four
 * colours (fast / on-target / `THEME.warning` / slow) and `PaceLegend`
 * printed three swatches, so any stretch 3–10% slower than the run average
 * rendered orange with no key entry at all. Read on a real summary screen it
 * looks like a defect in the line — "a break in the green section" — because
 * nothing on the page can explain it (owner, 2026-08-16). A legend and a
 * painter that each hold their own private copy of the band table is the
 * mirror-drift shape this repo keeps paying for; here the table is exported
 * once and both sides consume it, so a new band cannot appear un-keyed.
 *
 * Three further things were wrong and are fixed here:
 *
 * 1. THE BANDS WERE ASYMMETRIC. 0.92 / 1.03 meant you had to run 8% faster
 *    than your average to go green but only 3% slower to leave the middle.
 *    On an evenly-paced run that tips most of the line warm for no reason
 *    the runner did anything about. The tolerance is now one number applied
 *    in both directions.
 *
 * 2. "ON PACE" NAMED SOMETHING THAT DOES NOT EXIST. The comparison is
 *    against THIS RUN'S OWN AVERAGE — not a target, not the plan, not a
 *    goal. "On pace" invites the reader to ask "on pace for what?", and the
 *    honest answer is "nothing". The middle band is "Steady", and the legend
 *    now says what the comparison is against.
 *
 * 3. THE INPUT WAS NOISE. Pace was computed per GPS SAMPLE PAIR. At 1 Hz
 *    that is ~3 m of travel, against a consumer GPS error of about ±3 m — so
 *    the ratio was dominated by position error, not by running. That is why
 *    the line read as confetti rather than as blocks you could attribute to
 *    hills. `smoothedSegmentPaces` integrates over a ~100 m window instead,
 *    which is the same order as the 30 s window the live screen already uses
 *    for its rolling pace.
 *
 * Nothing here is persisted and no stored run is rewritten — this is a
 * display-layer read over `GPSPoint[]`, like `distanceUnits`.
 */

import { THEME } from "./theme";
import type { GPSPoint } from "./gps";

export type PaceBandId = "faster" | "steady" | "slower" | "gap";

export interface PaceBand {
  id: PaceBandId;
  /** Legend text. Also the accessible name for the swatch. */
  label: string;
  color: string;
  /**
   * Upper bound, EXCLUSIVE, on (segment pace ÷ run average pace). Pace is
   * seconds per kilometre, so a ratio below 1 is FASTER than average — the
   * inversion that makes this table read backwards at a glance and is worth
   * stating rather than rediscovering.
   */
  maxRatio: number;
}

/**
 * How far either side of the run's average still counts as "steady", as a
 * fraction. 6% of a 5:30/km average is ±20 s/km — comfortably wider than
 * what the 100 m smoothing leaves of GPS noise, and narrow enough that a
 * real hill still separates from the flat.
 */
export const BAND_TOLERANCE = 0.06;

/** Ordered fastest → slowest. The last entry must be unbounded. */
export const PACE_BANDS: readonly PaceBand[] = [
  {
    id: "faster",
    label: "Faster",
    color: THEME.paceFast,
    maxRatio: 1 - BAND_TOLERANCE,
  },
  {
    id: "steady",
    label: "Steady",
    color: THEME.paceOnTarget,
    maxRatio: 1 + BAND_TOLERANCE,
  },
  {
    id: "slower",
    label: "Slower",
    color: THEME.paceSlow,
    maxRatio: Infinity,
  },
] as const;

/**
 * Stretches where recording stopped and resumed somewhere else — a
 * backgrounded app, a tunnel, a lost fix. The map has to draw SOMETHING
 * between the two fixes, and what it drew before was a straight line
 * coloured by an invented pace, which claims you ran slowly along a road you
 * may never have been on. Grey says "no data" instead, which is true.
 */
export const GAP_BAND: PaceBand = {
  id: "gap",
  label: "No GPS",
  color: THEME.text.muted,
  maxRatio: Infinity,
};

/** Distance window the segment pace is integrated over, in metres. */
export const SMOOTHING_METRES = 100;

/**
 * A jump is a recording gap when BOTH hold: enough time passed that it
 * cannot be normal sampling, AND the runner is somewhere materially
 * different when recording resumes.
 *
 * Requiring both is what separates a lost fix from a red light. Standing
 * still at a crossing also produces a long gap between useful fixes, but it
 * produces no displacement — and that stretch IS honestly slow, so it should
 * stay coloured. Only a long gap that also teleports you is missing data.
 */
export const GAP_SECONDS = 20;
export const GAP_METRES = 50;

export function isRecordingGap(distanceM: number, elapsedS: number): boolean {
  return elapsedS >= GAP_SECONDS && distanceM >= GAP_METRES;
}

export function bandForRatio(ratio: number): PaceBand {
  for (const band of PACE_BANDS) if (ratio < band.maxRatio) return band;
  return PACE_BANDS[PACE_BANDS.length - 1];
}

/**
 * The band a smoothed segment pace falls in. `null` pace (a gap, or a
 * stretch too short to time) is the gap band; a non-positive average has no
 * comparison to make and is treated the same way.
 */
export function bandForPace(
  paceSecPerKm: number | null,
  avgPaceSecPerKm: number
): PaceBand {
  if (paceSecPerKm === null || !(avgPaceSecPerKm > 0)) return GAP_BAND;
  return bandForRatio(paceSecPerKm / avgPaceSecPerKm);
}

/** Metres between two fixes. Equirectangular — fine over a GPS sample. */
function segmentMetres(a: GPSPoint, b: GPSPoint): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const x = dLon * Math.cos(lat);
  return Math.sqrt(x * x + dLat * dLat) * R;
}

/**
 * Smooth one contiguous gap-free stretch of segments, writing into `out`.
 *
 * The window SLIDES at the ends rather than shrinking. A shrinking window
 * would leave the first and last segments computed over a few metres — which
 * is precisely the noise this function exists to remove, reintroduced at the
 * two places a reader looks first (the start marker and the finish).
 */
function smoothRange(
  out: (number | null)[],
  dist: number[],
  secs: number[],
  start: number,
  end: number,
  windowM: number
): void {
  const m = end - start;
  if (m <= 0) return;

  const cumD = new Float64Array(m + 1);
  const cumT = new Float64Array(m + 1);
  for (let j = 0; j < m; j++) {
    cumD[j + 1] = cumD[j] + dist[start + j];
    cumT[j + 1] = cumT[j] + secs[start + j];
  }
  const total = cumD[m];
  if (!(total > 0)) return; // leaves nulls — nothing honest to say

  /** Elapsed seconds at a cumulative distance, linear inside its segment. */
  const timeAt = (d: number): number => {
    if (d <= 0) return 0;
    if (d >= total) return cumT[m];
    let lo = 0;
    let hi = m - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumD[mid + 1] <= d) lo = mid + 1;
      else hi = mid;
    }
    const segD = cumD[lo + 1] - cumD[lo];
    const frac = segD > 0 ? (d - cumD[lo]) / segD : 0;
    return cumT[lo] + (cumT[lo + 1] - cumT[lo]) * frac;
  };

  const half = windowM / 2;
  for (let j = 0; j < m; j++) {
    const mid = (cumD[j] + cumD[j + 1]) / 2;
    let lo = mid - half;
    let hi = mid + half;
    if (lo < 0) {
      hi = Math.min(total, hi - lo);
      lo = 0;
    }
    if (hi > total) {
      lo = Math.max(0, lo - (hi - total));
      hi = total;
    }
    const d = hi - lo;
    const t = timeAt(hi) - timeAt(lo);
    out[start + j] = d > 0 && t > 0 ? (t / d) * 1000 : null;
  }
}

/**
 * Smoothed pace, in seconds per kilometre, for every segment of the track.
 *
 * Returns `points.length - 1` entries: index `j` is the segment from
 * `points[j]` to `points[j + 1]`. `null` means a recording gap, or a stretch
 * with no usable distance/time.
 *
 * Smoothing runs INSIDE each gap-free stretch, never across a gap. Letting
 * the window span one would spread its fictional pace into every real
 * segment within 50 m either side — turning a single wrong segment into a
 * wrong neighbourhood.
 */
export function smoothedSegmentPaces(
  points: GPSPoint[],
  windowM: number = SMOOTHING_METRES
): (number | null)[] {
  const n = points.length;
  if (n < 2) return [];

  const dist: number[] = new Array(n - 1);
  const secs: number[] = new Array(n - 1);
  const gap: boolean[] = new Array(n - 1);
  for (let j = 0; j < n - 1; j++) {
    dist[j] = segmentMetres(points[j], points[j + 1]);
    secs[j] = (points[j + 1].timestamp - points[j].timestamp) / 1000;
    gap[j] = isRecordingGap(dist[j], secs[j]);
  }

  const out: (number | null)[] = new Array(n - 1).fill(null);
  let start = 0;
  while (start < n - 1) {
    if (gap[start]) {
      start++;
      continue;
    }
    let end = start;
    while (end < n - 1 && !gap[end]) end++;
    smoothRange(out, dist, secs, start, end, windowM);
    start = end;
  }
  return out;
}

/**
 * Whether the track contains a recording gap — i.e. whether the legend needs
 * to explain a grey stretch. Kept here so the pages asking the question use
 * the same predicate the painter does.
 */
export function hasRecordingGap(points: GPSPoint[]): boolean {
  for (let j = 0; j < points.length - 1; j++) {
    const d = segmentMetres(points[j], points[j + 1]);
    const s = (points[j + 1].timestamp - points[j].timestamp) / 1000;
    if (isRecordingGap(d, s)) return true;
  }
  return false;
}
