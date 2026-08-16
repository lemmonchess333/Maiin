import { METRES_PER_MILE, type DistanceUnit } from "./distanceUnits";
import { estimateRunBurn } from "./workoutBurn";

export function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Initial great-circle bearing point 1 → point 2, in degrees clockwise from
 * north (0–360). Used for the back-to-start direction arrow and heading.
 */

export function bearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export interface RouteProgress {
  /** Perpendicular distance (m) from the position to the nearest route point. */
  offRouteMeters: number;
  /** Distance (m) along the route to the nearest point (how far you've got). */
  coveredMeters: number;
  /** Route distance (m) still ahead. */
  remainingMeters: number;
  /** Total route length (m). */
  totalMeters: number;
  /** coveredMeters / totalMeters, 0..1. */
  fraction: number;
}

/** Total length of a route polyline in metres. */
export function routeTotalDistance(route: GPSPoint[]): number {
  let total = 0;
  for (let i = 1; i < route.length; i++) {
    total += haversine(
      route[i - 1].lat,
      route[i - 1].lon,
      route[i].lat,
      route[i].lon
    );
  }
  return total;
}

/**
 * Progress of a position against a target route: how far off the line you are,
 * how much you've covered, and how much remains. Used by the follow-a-route
 * guidance (off-route alert + distance remaining).
 *
 * Uses a local equirectangular projection (metres) anchored at the route's
 * first point for the point-to-segment maths — accurate at running scale
 * (sub-metre over a few km), and far cheaper than per-segment haversine.
 * Returns null for a degenerate route (<2 points).
 */
export function routeProgress(
  route: GPSPoint[],
  lat: number,
  lon: number
): RouteProgress | null {
  if (route.length < 2) return null;

  const lat0 = (route[0].lat * Math.PI) / 180;
  const mPerLat = 110540;
  const mPerLon = 111320 * Math.cos(lat0);
  const px = lon * mPerLon;
  const py = lat * mPerLat;

  let best = Infinity;
  let bestCovered = 0;
  let cum = 0;
  for (let i = 1; i < route.length; i++) {
    const ax = route[i - 1].lon * mPerLon;
    const ay = route[i - 1].lat * mPerLat;
    const bx = route[i].lon * mPerLon;
    const by = route[i].lat * mPerLat;
    const dx = bx - ax;
    const dy = by - ay;
    const segLen2 = dx * dx + dy * dy;
    const t =
      segLen2 > 0
        ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / segLen2))
        : 0;
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const d = Math.hypot(px - cx, py - cy);
    const segLen = Math.sqrt(segLen2);
    if (d < best) {
      best = d;
      bestCovered = cum + t * segLen;
    }
    cum += segLen;
  }

  const totalMeters = cum;
  return {
    offRouteMeters: best,
    coveredMeters: bestCovered,
    remainingMeters: Math.max(0, totalMeters - bestCovered),
    totalMeters,
    fraction: totalMeters > 0 ? bestCovered / totalMeters : 0,
  };
}

/**
 * Elapsed time (seconds) the route's original recording took to reach a given
 * distance along it — the "ghost" lookup for vs-last-time pacing when
 * re-running a past run. Interpolates between the bracketing fixes' timestamps.
 *
 * Returns null when the route carries no real timestamps (e.g. a GPX import
 * without <time>, where every timestamp is 0), so callers hide the ghost rather
 * than show a bogus delta. Beyond the route end, returns the full original time.
 */
export function routeTimeAtDistance(
  route: GPSPoint[],
  meters: number
): number | null {
  if (route.length < 2) return null;
  const t0 = route[0].timestamp;
  if (!t0) return null;

  let cum = 0;
  for (let i = 1; i < route.length; i++) {
    const seg = haversine(
      route[i - 1].lat,
      route[i - 1].lon,
      route[i].lat,
      route[i].lon
    );
    if (cum + seg >= meters) {
      const tA = route[i - 1].timestamp;
      const tB = route[i].timestamp;
      if (!tA || !tB) return null;
      const frac = seg > 0 ? (meters - cum) / seg : 0;
      const interp = tA + (tB - tA) * frac;
      return Math.max(0, (interp - t0) / 1000);
    }
    cum += seg;
  }

  const tLast = route[route.length - 1].timestamp;
  if (!tLast) return null;
  return Math.max(0, (tLast - t0) / 1000);
}

export class KalmanFilter {
  private lat = 0;
  private lon = 0;
  private variance = -1;
  private processNoise: number;

  constructor(processNoise = 3) {
    this.processNoise = processNoise;
  }

  process(
    lat: number,
    lon: number,
    accuracy: number
  ): { lat: number; lon: number } {
    if (this.variance < 0) {
      this.lat = lat;
      this.lon = lon;
      this.variance = accuracy * accuracy;
    } else {
      this.variance += this.processNoise;
      const k = this.variance / (this.variance + accuracy * accuracy);
      this.lat += k * (lat - this.lat);
      this.lon += k * (lon - this.lon);
      this.variance *= 1 - k;
    }
    return { lat: this.lat, lon: this.lon };
  }

  reset() {
    this.variance = -1;
  }
}

export interface GPSPoint {
  lat: number;
  lon: number;
  altitude: number | null;
  accuracy: number;
  speed: number | null;
  timestamp: number;
  rawLat: number;
  rawLon: number;
}

export interface Split {
  km: number;
  time: number;
  pace: string;
  paceSeconds: number;
  elevationGain: number;
  elevationLoss: number;
}

export function isValidReading(
  coords: GeolocationCoordinates,
  lastPoint: GPSPoint | null,
  elapsedSeconds?: number
): boolean {
  // First point (no lastPoint): accept up to 150m accuracy to avoid stuck acquiring phase
  if (!lastPoint) {
    return coords.accuracy <= 150;
  }

  const maxAccuracy =
    elapsedSeconds !== undefined && elapsedSeconds < 15 ? 50 : 35;
  if (coords.accuracy > maxAccuracy) return false;

  /* Compare RAW to RAW. `lastPoint.lat/lon` are the Kalman OUTPUT (see
     useGPS.makePoint, which keeps the unfiltered pair in rawLat/rawLon), and
     the filter lags a moving runner — so measuring against it put the filter's
     lag inside a check that is supposed to be about the athlete:

         lag          ≈ (1 − k)/k × step
         impliedSpeed = (lag + step) / dt = trueSpeed / k

     which made the 12 m/s limit an effective cap of 12 × k. Because k falls as
     `accuracy` worsens, the gate tightened exactly when fixes got noisier, and
     a rejection is self-perpetuating (`lastPoint` only advances on an accepted
     fix, so the frozen reference falls further behind). Measured on a
     NOISE-FREE 3 m/s runner: 99% of distance recorded at 6 m accuracy, 2% at
     7 m — a one-metre cliff, and rate-invariant, so a slower fix rate did not
     help. `gpsSpeedGateLag.test.ts` has the full derivation and table.

     Raw-to-raw measures the step the device actually moved. A genuine teleport
     still trips the limit (12 m/s is 43 km/h, faster than any sprint); normal
     running no longer does, at any accuracy the outer gate admits.

     The `dist < 1` duplicate check moves with it deliberately: "has the device
     moved since the last fix" is a question about physical positions, and the
     smoothed point is not a place the device was ever at. */
  const dist = haversine(
    lastPoint.rawLat,
    lastPoint.rawLon,
    coords.latitude,
    coords.longitude
  );
  const timeDiff = (Date.now() - lastPoint.timestamp) / 1000;
  if (timeDiff <= 0) return false;
  const impliedSpeed = dist / timeDiff;
  if (impliedSpeed > 12) return false;
  if (dist < 1) return false;
  return true;
}

export function calculatePace(
  distanceMeters: number,
  timeSeconds: number
): string {
  if (distanceMeters < 10) return "--:--";
  const paceSecsPerKm = (timeSeconds / distanceMeters) * 1000;
  const mins = Math.floor(paceSecsPerKm / 60);
  const secs = Math.floor(paceSecsPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * The slowest a segment is allowed to COUNT AS, in seconds per kilometre.
 *
 * 20:00/km is slower than a stroll, so it never touches real running or
 * even a walk break — but it caps what a stop can contribute. Pausing calls
 * `gps.stop()` (Run.tsx), so a pause leaves a genuine hole in the
 * timestamps, and a red light leaves a long silence with no displacement.
 * Integrating either at face value would put five minutes of standing into
 * a window meant to describe running.
 *
 * A clamp rather than an exclusion. A slow shuffle still drags the number
 * down in proportion to how slow it was; only time with no ground under it
 * is discounted, and a dead stop contributes almost nothing because the
 * cap scales with the distance covered. The effect is that the window
 * reports MOVING pace over the last kilometre — which is what a runner
 * means by "what am I running", and what the auto-pause feature already
 * assumes elsewhere on this screen.
 *
 * This is also why the alternative — comparing against the run timer's
 * `elapsed`, which already excludes paused time — was not used: it is a
 * scalar for the whole run and cannot say which part of a WINDOW was spent
 * moving.
 */
const STOPPED_PACE_FLOOR_SEC_PER_KM = 1200;

/**
 * Pace over the last `windowMetres` of GROUND COVERED, in seconds per
 * kilometre — a window anchored to distance rather than to time.
 *
 * REPLACES `rollingPaceSeconds`, a 30-SECOND window, which is deleted
 * rather than kept beside this — an unused export of the noisier of two
 * near-identical functions is an invitation to pick the wrong one.
 *
 * A 30-second window is short enough that a single stop dominates it.
 * Owner, on a real run: the live slot read 13:14/km beside an average of
 * 7:05. That reading was arithmetically correct — 37.8 m covered in those
 * 30 seconds — and behaviourally useless; a moment later the same window
 * fell under its `dist < 10` guard and returned `--:--`. The spike and the
 * blank were the same defect seen twice.
 *
 * The old window's stated purpose survives unchanged and is worth keeping
 * here: the all-time average `calculatePace(distance, elapsed)` lags badly
 * mid-run — once you've banked 3 km at 5:00/km, a 4:00/km fourth km only
 * nudges it — so a live screen needs a recent-pace reading, and the audio
 * pace alert needs one even more (judged against the whole-run average, a
 * warm-up drags it permanently slow, the ±15s/km threshold stays crossed,
 * and the app tells a runner they are behind target every 30 seconds for
 * the rest of the session). Only the WINDOW changes; the full-run average
 * still drives the saved record.
 *
 * A distance-anchored window cannot do either. Over the last kilometre you
 * cannot move from 7:05 to 13:14 at running speed, and once ~10 m have been
 * covered the window always holds enough to divide by — including through a
 * GPS dropout, where it simply keeps describing the last kilometre that WAS
 * recorded instead of blanking. Degrading beats dashing out: a dead
 * placeholder in a 46px slot reads as a crash, not as poor conditions.
 *
 * Before `windowMetres` has been banked the window is the whole run so far,
 * so the value starts life equal to the run average and slides away from it
 * — continuous from the first fix, with no boundary to jump at. That is the
 * one thing it has over a per-split average (Strava's model), which resets
 * every kilometre and is jumpy for the first ~100 m of each.
 *
 * Precedent: Apple's "Rolling Mile" is on the DEFAULT Outdoor Run view and
 * is this exact quantity. Garmin ships no native equivalent, which is why
 * its users install a Connect IQ "Rolling Average Pace" field.
 *
 * The cost is honest and worth stating: a window this wide cannot resolve
 * anything shorter than itself, so it is the wrong instrument for 400 m
 * reps. An interval session should scope the window to the current rep
 * instead.
 *
 * Returns `null` only when under 10 m has been covered in total — i.e. the
 * run has not started moving. `null` rather than 0 so a caller can stay
 * silent instead of speaking a fiction.
 */
export function slidingPaceSeconds(
  points: GPSPoint[],
  windowMetres: number = 1000
): number | null {
  if (points.length < 2) return null;

  let dist = 0;
  let secs = 0;
  // Walk backwards from the latest fix until the window is full or the
  // track runs out.
  for (let i = points.length - 1; i > 0; i--) {
    const segM = haversine(
      points[i - 1].lat,
      points[i - 1].lon,
      points[i].lat,
      points[i].lon
    );
    let segS = (points[i].timestamp - points[i - 1].timestamp) / 1000;
    if (segS <= 0) continue;
    // A stop cannot count for more than a very slow walk (see the constant).
    segS = Math.min(segS, (segM / 1000) * STOPPED_PACE_FLOOR_SEC_PER_KM);

    const remaining = windowMetres - dist;
    if (segM >= remaining && segM > 0) {
      // Partial segment at the window edge — take the fraction needed, so
      // the value slides continuously instead of stepping as whole fixes
      // fall out of the back.
      const frac = remaining / segM;
      dist += segM * frac;
      secs += segS * frac;
      break;
    }
    dist += segM;
    secs += segS;
  }

  if (dist < 10 || secs <= 0) return null;
  return (secs / dist) * 1000;
}

export function paceAsNumber(
  distanceMeters: number,
  timeSeconds: number
): number {
  if (distanceMeters < 10) return 0;
  return (timeSeconds / distanceMeters) * 1000;
}

/**
 * Per-lap splits from a GPS trace.
 *
 * `lapMetres` is the boundary the run is cut on — 1000 for a metric
 * reader, `METRES_PER_MILE` for an imperial one. Splits are the one run
 * surface where the unit is not a formatting choice: the ROWS themselves
 * are a different length, so a label swap cannot serve both readers.
 *
 * `paceSeconds` stays SECONDS PER KILOMETRE whichever lap is used, because
 * `paceAsNumber` normalises to 1000 m. That is what keeps the storage
 * convention intact and lets `paceMinSec` convert at display: a lap's pace
 * is a rate, so it converts independently of how long the lap was. Only
 * `km` — the lap ORDINAL, named for the metric case it was written in —
 * counts in laps.
 */
export function calculateSplits(
  points: GPSPoint[],
  lapMetres: number = 1000
): Split[] {
  if (points.length < 2) return [];
  const splits: Split[] = [];
  let accDistance = 0;
  let splitStartTime = points[0].timestamp;
  let splitStartIdx = 0;
  let currentKm = 1; // lap ordinal, not necessarily a kilometre

  for (let i = 1; i < points.length; i++) {
    const segStart = accDistance;
    const segDist = haversine(
      points[i - 1].lat,
      points[i - 1].lon,
      points[i].lat,
      points[i].lon
    );
    accDistance += segDist;
    const segStartTime = points[i - 1].timestamp;
    const segEndTime = points[i].timestamp;
    // A single GPS segment can cross multiple lap thresholds (signal drop +
    // reappear with a multi-km jump). Distribute THIS segment's time
    // proportionally across each km boundary it crosses — interpolate the
    // timestamp at which each boundary was reached. The previous code credited
    // the whole segment time to the first km and then set splitStartTime to
    // points[i].timestamp, so the 2nd+ boundaries in the same segment computed
    // splitTime = 0 → bogus "1km in 0:00" (0:00/km pace) splits.
    while (accDistance >= currentKm * lapMetres) {
      const boundary = currentKm * lapMetres;
      const frac =
        segDist > 0
          ? Math.min(1, Math.max(0, (boundary - segStart) / segDist))
          : 1;
      const boundaryTime = segStartTime + frac * (segEndTime - segStartTime);
      const splitTime = (boundaryTime - splitStartTime) / 1000;
      let elevGain = 0;
      let elevLoss = 0;
      for (let j = splitStartIdx + 1; j <= i; j++) {
        if (points[j].altitude != null && points[j - 1].altitude != null) {
          const diff = points[j].altitude! - points[j - 1].altitude!;
          if (diff > 2) elevGain += diff;
          if (diff < -2) elevLoss += Math.abs(diff);
        }
      }
      splits.push({
        km: currentKm,
        time: splitTime,
        pace: calculatePace(lapMetres, splitTime),
        paceSeconds: paceAsNumber(lapMetres, splitTime),
        elevationGain: Math.round(elevGain),
        elevationLoss: Math.round(elevLoss),
      });
      splitStartTime = boundaryTime;
      splitStartIdx = i;
      currentKm++;
    }
  }

  return splits;
}

/**
 * The splits to SHOW, and which unit their rows are actually in.
 *
 * Two callers need this and must agree, because the interesting case is the
 * fallback rather than the happy path. A metric reader reads the stored
 * kilometre rows. An imperial reader gets mile rows recomputed from the
 * trace — but a run with no trace (treadmill, manual, an old record) has
 * only the stored kilometre rows to offer, and there is no honest way to
 * turn those into miles. So it returns the rows AND their unit, and the
 * chart says "per km" when the two differ instead of relabelling rows it
 * did not recut.
 *
 * Recomputing rather than converting is the whole point: a mile split is a
 * different CUT of the run, not the same number in another unit.
 */
export function splitsForDisplay(
  unit: DistanceUnit,
  points: GPSPoint[] | null | undefined,
  storedSplits: Split[] | null | undefined
): { splits: Split[]; lapUnit: DistanceUnit } {
  const stored = storedSplits ?? [];
  if (unit !== "mi") return { splits: stored, lapUnit: "km" };
  const trace = points ?? [];
  if (trace.length < 2) return { splits: stored, lapUnit: "km" };
  return { splits: calculateSplits(trace, METRES_PER_MILE), lapUnit: "mi" };
}

export function totalElevationGain(points: GPSPoint[]): number {
  let gain = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].altitude != null && points[i - 1].altitude != null) {
      const diff = points[i].altitude! - points[i - 1].altitude!;
      if (diff > 2) gain += diff;
    }
  }
  return Math.round(gain);
}

export function totalDistance(points: GPSPoint[]): number {
  let dist = 0;
  for (let i = 1; i < points.length; i++) {
    dist += haversine(
      points[i - 1].lat,
      points[i - 1].lon,
      points[i].lat,
      points[i].lon
    );
  }
  return dist;
}

export function detectBestEfforts(
  points: GPSPoint[],
  totalDistance: number
): { distance: number; time: number; label: string }[] {
  const efforts = [
    { target: 1000, label: "1K" },
    { target: 5000, label: "5K" },
    { target: 10000, label: "10K" },
  ];
  const results: { distance: number; time: number; label: string }[] = [];

  for (const effort of efforts) {
    if (totalDistance < effort.target) continue;
    let bestTime = Infinity;
    let startIdx = 0;
    let accDist = 0;

    for (let endIdx = 1; endIdx < points.length; endIdx++) {
      accDist += haversine(
        points[endIdx - 1].lat,
        points[endIdx - 1].lon,
        points[endIdx].lat,
        points[endIdx].lon
      );
      while (startIdx < endIdx) {
        const frontDist = haversine(
          points[startIdx].lat,
          points[startIdx].lon,
          points[startIdx + 1].lat,
          points[startIdx + 1].lon
        );
        if (accDist - frontDist >= effort.target) {
          accDist -= frontDist;
          startIdx++;
        } else break;
      }
      if (accDist >= effort.target) {
        const segTime =
          (points[endIdx].timestamp - points[startIdx].timestamp) / 1000;
        if (segTime < bestTime) bestTime = segTime;
      }
    }

    if (bestTime < Infinity)
      results.push({
        distance: effort.target,
        time: bestTime,
        label: effort.label,
      });
  }

  return results;
}

/** Escape XML metacharacters so a user-supplied run name can't produce
 *  invalid GPX (e.g. a name containing `&`, `<`, `"`). */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function toGPX(points: GPSPoint[], name: string): string {
  const trkpts = points
    .map((p) => {
      const time = new Date(p.timestamp).toISOString();
      const ele =
        p.altitude != null ? `<ele>${p.altitude.toFixed(1)}</ele>` : "";
      return `      <trkpt lat="${p.lat}" lon="${p.lon}">${ele}<time>${time}</time></trkpt>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Tropos">
  <trk><name>${escapeXml(name)}</name><trkseg>
${trkpts}
  </trkseg></trk>
</gpx>`;
}

/**
 * Run calorie burn for a distance in METRES — the shape every run surface
 * has. Delegates to the canonical formula in `workoutBurn.ts` rather than
 * repeating the constant; see that module for why it lives there.
 */
export function estimateRunCalories(
  distanceMeters: number,
  weightKg: number
): number {
  return estimateRunBurn({
    distanceKm: distanceMeters / 1000,
    bodyweightKg: weightKg,
  });
}
