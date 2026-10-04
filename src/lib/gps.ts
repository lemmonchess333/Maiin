import { splitRouteSegments } from "./routeSegments";
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
    if (route[i].breakBefore) continue;
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
    if (route[i].breakBefore) continue;
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
  if (!route[0].timestamp) return null;
  /* MOVING time, on the run's own clock: the live side of this comparison
     is `timer.elapsed`, which stops for every pause, so a ghost that kept
     the original run's stops in would fall a whole stop behind at the
     first crossing it waited at. */
  const c0 = movingClockMs(route[0]);

  let cum = 0;
  for (let i = 1; i < route.length; i++) {
    if (route[i].breakBefore) continue;
    const seg = haversine(
      route[i - 1].lat,
      route[i - 1].lon,
      route[i].lat,
      route[i].lon
    );
    if (cum + seg >= meters) {
      if (!route[i - 1].timestamp || !route[i].timestamp) return null;
      const cA = movingClockMs(route[i - 1]);
      const cB = movingClockMs(route[i]);
      const frac = seg > 0 ? (meters - cum) / seg : 0;
      const interp = cA + (cB - cA) * frac;
      return Math.max(0, (interp - c0) / 1000);
    }
    cum += seg;
  }

  const last = route[route.length - 1];
  if (!last.timestamp) return null;
  return Math.max(0, (movingClockMs(last) - c0) / 1000);
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
  /** Begins a disconnected segment after a privacy cut or GPX track break. */
  breakBefore?: boolean;
  lat: number;
  lon: number;
  altitude: number | null;
  accuracy: number;
  speed: number | null;
  /** When the fix was taken, in epoch ms: the fix's own time when the
   *  location source gave a sane one, else when it arrived (`fixTimestamp`). */
  timestamp: number;
  rawLat: number;
  rawLon: number;
  /**
   * Milliseconds the run's clock had been HELD before this fix — the 3-2-1
   * countdown, a pause, an auto-pause — counted from the start of the
   * recording. Nothing is recorded while the clock is held (useGPS), so
   * only differences mean anything: the MOVING time between two points is
   * their timestamp difference less their `pausedMs` difference
   * (`movingClockMs`). That is how a split, a best effort and the live pace
   * leave out ten minutes at a crossing, as Strava's do.
   *
   * Cumulative rather than per-gap so it survives `sampleRoute` thinning
   * the saved trace: any two surviving points still subtract correctly.
   * Absent until the first hold, and on every trace recorded before holds
   * were tracked, and read as 0 — those runs compute exactly as before.
   */
  pausedMs?: number;
}

/**
 * The fastest a recorded position may plausibly move, in metres a second —
 * 43 km/h, faster than any sprint. `isValidReading` rejects a fix that
 * implies more; `segmentMetres` caps the line drawn across a pause by it.
 */
export const MAX_PLAUSIBLE_SPEED_MPS = 12;

/** A point's `pausedMs`, or 0 when it has none. A saved trace is stored
 *  data, so anything that is not a positive finite number reads as 0. */
export function pausedMsOf(p: GPSPoint): number {
  const v = p.pausedMs;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * Where a point sits on the run's MOVING clock, in ms: its timestamp with
 * every hold before it taken out. Only differences between points of one
 * trace mean anything. For a trace without `pausedMs` this is the
 * timestamp, so old runs read as they always did.
 */
export function movingClockMs(p: GPSPoint): number {
  return p.timestamp - pausedMsOf(p);
}

/** Seconds of moving time between two points of one trace, never negative.
 *  Use this, not a timestamp difference, for any pace between two points. */
export function movingSecondsBetween(a: GPSPoint, b: GPSPoint): number {
  return Math.max(0, (movingClockMs(b) - movingClockMs(a)) / 1000);
}

/**
 * Metres a trace credits between two consecutive points: the straight line
 * between them, except across a hold.
 *
 * Nothing is recorded while the clock is held, so the first point after a
 * resume joins the last one before it with a straight line. If the runner
 * walked to a fountain or took a lift while paused, that line is distance
 * covered with the clock stopped. It is credited only as far as the part
 * of the gap with the clock RUNNING could have carried them at
 * `MAX_PLAUSIBLE_SPEED_MPS` — which keeps the few metres either side of a
 * stop at a crossing and drops the rest. Without the cap, taking the paused
 * time out of the clock would turn that line into a "1K" run in seconds.
 *
 * The live distance (useGPS), the splits and the best efforts all count
 * through this one rule, so the run's distance and its splits agree.
 */
export function segmentMetres(a: GPSPoint, b: GPSPoint): number {
  const d = haversine(a.lat, a.lon, b.lat, b.lon);
  if (pausedMsOf(b) <= pausedMsOf(a)) return d;
  return Math.min(d, MAX_PLAUSIBLE_SPEED_MPS * movingSecondsBetween(a, b));
}

/** The oldest a fix's own time may be, against its arrival, and still be
 *  believed. A batch the OS held back is seconds to a few minutes old; a
 *  time older than this is a broken clock or a unit mix-up (seconds read as
 *  milliseconds is 1970), and would date the whole run by it. */
export const FIX_TIME_MAX_AGE_MS = 5 * 60_000;

/**
 * The timestamp a fix's point gets: when the fix was TAKEN, where that can
 * be trusted.
 *
 * Stamping on arrival is wrong whenever delivery is late or bunched. When
 * the OS hands over fixes in a batch (iOS does for a backgrounded app),
 * ten fixes taken a second apart arrive in the same millisecond: the speed
 * gate reads the second one as a teleport and the rest of the batch goes
 * with it, and the time the batch covered reads as a stop before it.
 *
 * The fix's own time is used when it is a finite number, no older than
 * `FIX_TIME_MAX_AGE_MS`, and not before the previous point's — a stale
 * cached fix, or a clock that stepped back. Anything else falls back to the
 * arrival time, which is what every fix used before. A time AHEAD of
 * arrival (a receiver clock running ahead of the phone's, by a little or a
 * lot) becomes the arrival time: a fix cannot have been taken after it got
 * here, and no point is ever stamped later than now — which the holds in
 * useGPS rely on when they compare a point's time with the clock.
 */
export function fixTimestamp(
  fixTime: unknown,
  arrivedAt: number,
  previous: number | null
): number {
  if (typeof fixTime !== "number" || !Number.isFinite(fixTime)) {
    return arrivedAt;
  }
  if (fixTime < arrivedAt - FIX_TIME_MAX_AGE_MS) return arrivedAt;
  if (previous !== null && fixTime < previous) return arrivedAt;
  return Math.min(fixTime, arrivedAt);
}

export interface Split {
  km: number;
  time: number;
  pace: string;
  paceSeconds: number;
  elevationGain: number;
  elevationLoss: number;
}

/**
 * What becomes of a fix. "ok" joins the trace. "still" is a good fix that
 * has not moved a metre from the last one: nothing to add, and nothing
 * wrong with the signal, so it is not counted against the route's quality
 * (standing at a crossing with auto-pause off read as a "poor" route).
 * The rest are fixes the trace cannot believe: too vague, out of order,
 * or a jump no runner makes.
 */
export type ReadingVerdict =
  | "ok"
  | "still"
  | "inaccurate"
  | "out-of-order"
  | "teleport";

export function readingVerdict(
  coords: GeolocationCoordinates,
  lastPoint: GPSPoint | null,
  elapsedSeconds?: number,
  /** When this fix was taken (`fixTimestamp`). Defaults to now. The step is
   *  measured against the previous POINT's time, so a batch of fixes
   *  arriving together is judged on the seconds between them, not on the
   *  millisecond between their arrivals. */
  fixTimeMs: number = Date.now()
): ReadingVerdict {
  // First point (no lastPoint): accept up to 150m accuracy to avoid stuck acquiring phase
  if (!lastPoint) {
    return coords.accuracy <= 150 ? "ok" : "inaccurate";
  }

  const maxAccuracy =
    elapsedSeconds !== undefined && elapsedSeconds < 15 ? 50 : 35;
  if (coords.accuracy > maxAccuracy) return "inaccurate";

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
  // Not moved: the same place again, or the same fix delivered twice.
  if (dist < 1) return "still";
  const timeDiff = (fixTimeMs - lastPoint.timestamp) / 1000;
  if (timeDiff <= 0) return "out-of-order";
  const impliedSpeed = dist / timeDiff;
  if (impliedSpeed > MAX_PLAUSIBLE_SPEED_MPS) return "teleport";
  return "ok";
}

/** Whether a fix joins the trace (`readingVerdict` says why not). */
export function isValidReading(
  coords: GeolocationCoordinates,
  lastPoint: GPSPoint | null,
  elapsedSeconds?: number,
  fixTimeMs: number = Date.now()
): boolean {
  return readingVerdict(coords, lastPoint, elapsedSeconds, fixTimeMs) === "ok";
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
 * Pace over the last `windowSeconds` of GPS points, in seconds per
 * kilometre, or `null` when the window holds too little data (needs
 * ≥10 m AND ≥5 s inside the window).
 *
 * WHY A WINDOW. The all-time average `calculatePace(distance, elapsed)`
 * lags badly mid-run — once you've banked 3 km at 5:00/km, a 4:00/km
 * fourth km only nudges it. The rolling window answers "what am I doing
 * right now", which is what runners want on the live screen. The full-run
 * average still drives the saved record.
 *
 * There was a `rollingPace` beside this that returned a preformatted
 * "M:SS" string. It was deleted when the live screen started converting
 * pace to the reader's unit: a formatter that bakes in per-KILOMETRE has
 * nothing to offer a caller that needs per-mile, and it had exactly one
 * consumer. Callers now take the number and pass it to `paceMinSec` with
 * a unit.
 *
 * The number form exists because the audio pace alert needs it, and was
 * computing `(elapsed / distance) * 1000` at its call site instead — the
 * WHOLE-RUN average, the exact quantity the comment above says "lags
 * badly mid-run". On any session with a warm-up that average is dragged
 * permanently slow, so once the alert's ±15s/km threshold is crossed it
 * stays crossed: the app tells the runner they are behind target every
 * 30 seconds for the rest of the session, from a two-line pool, while
 * the live display beside it shows them on pace. That is the loudest
 * possible place to be wrong, and it is a large part of what "the same
 * sentence over and over" sounds like on a tempo run.
 *
 * `null` rather than 0 is deliberate: the caller must be able to tell
 * "no reading yet" from "a real reading", and stay silent for the
 * former. Returning the misleading average as a fallback would put the
 * bug straight back.
 *
 * The window is measured on the MOVING clock (`movingClockMs`). On the wall
 * clock, the first fixes after a 20-second wait at a crossing shared a
 * window with the wait, so the pace read near-walking and the pace alert
 * told the runner they were behind just as they set off again.
 */
export function rollingPaceSeconds(
  points: GPSPoint[],
  windowSeconds: number = 30
): number | null {
  if (points.length < 2) return null;
  const now = movingClockMs(points[points.length - 1]);
  const windowMs = windowSeconds * 1000;
  /* Find the first point within the rolling window. Points are kept
     in chronological order by useGPS so a linear scan from the start
     is fine; the array is also bounded by the run duration. */
  const startIdx = points.findIndex((p) => now - movingClockMs(p) <= windowMs);
  if (startIdx === -1 || startIdx === points.length - 1) return null;

  let dist = 0;
  for (let i = startIdx + 1; i < points.length; i++) {
    dist += segmentMetres(points[i - 1], points[i]);
  }
  const elapsedSec = (now - movingClockMs(points[startIdx])) / 1000;

  if (dist < 10 || elapsedSec < 5) return null;

  return (elapsedSec / dist) * 1000;
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
 *
 * A split's `time` is MOVING time (`movingClockMs`): ten minutes stopped
 * at a crossing inside the second kilometre are not in that kilometre's
 * time, as they are not in the run's duration. Its distance counts through
 * `segmentMetres`, the rule the live distance uses, so a line drawn across
 * a pause cannot bank distance at no time. Its elevation is the run's
 * smoothed climb (`climbBySegment`) that fell inside the split.
 */
export function calculateSplits(
  points: GPSPoint[],
  lapMetres: number = 1000
): Split[] {
  if (points.length < 2) return [];
  const climb = climbBySegment(points);
  const splits: Split[] = [];
  let accDistance = 0;
  /* The moving clock never steps back inside one computation: a trace
     whose clock did (a phone clock corrected mid-run) would otherwise
     produce a negative split. */
  let clock = movingClockMs(points[0]);
  let splitStartTime = clock;
  let elevGain = 0;
  let elevLoss = 0;
  let currentKm = 1; // lap ordinal, not necessarily a kilometre

  for (let i = 1; i < points.length; i++) {
    const segStart = accDistance;
    const segDist = segmentMetres(points[i - 1], points[i]);
    accDistance += segDist;
    const segStartTime = clock;
    clock = Math.max(clock, movingClockMs(points[i]));
    const segEndTime = clock;
    elevGain += climb.gain[i];
    elevLoss += climb.loss[i];
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
      // A segment's climb goes to the split whose boundary it crosses; a
      // second boundary inside the same segment gets none of it.
      splits.push({
        km: currentKm,
        time: splitTime,
        pace: calculatePace(lapMetres, splitTime),
        paceSeconds: paceAsNumber(lapMetres, splitTime),
        elevationGain: Math.round(elevGain),
        elevationLoss: Math.round(elevLoss),
      });
      elevGain = 0;
      elevLoss = 0;
      splitStartTime = boundaryTime;
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

/**
 * Altitude samples averaged either side of each one before climbing is
 * counted: 7 each way, a 15-fix window — about fifteen seconds at the usual
 * one fix a second, forty-odd metres of running.
 *
 * Chosen by simulation (200 seeds each, 3 m threshold). Ten flat minutes
 * with uniform ±4 m fix-to-fix jitter read 2.4 m of climb on average at
 * radius 7, 7.9 m at radius 5, 58 m at radius 2 — and 670 m under the old
 * per-fix rule. What it costs: a 6 m bridge with 40 m ramps reads 4.3 m
 * (4.7 m at radius 5). A hill with level ground either side keeps its full
 * height at any radius; only bumps narrower than the window shrink.
 */
export const ALTITUDE_SMOOTHING_RADIUS = 7;

/**
 * How far the smoothed altitude must move from its last low (or high)
 * point before the move counts as a climb (or a descent). Once it does,
 * the whole move from that turning point counts, so nothing below the
 * threshold is shaved off a real hill.
 */
export const CLIMB_THRESHOLD_M = 3;

/**
 * The run's climb and descent, attributed to the segment each happened in:
 * `gain[i]` and `loss[i]` are for the segment from point `i - 1` to point
 * `i` (both 0 at index 0), all non-negative, and they sum to the run's
 * totals — which is what lets a split's elevation be the climb that fell
 * inside it, and the splits add up to the run.
 *
 * Two steps, the standard ones for a GPS altitude track:
 *
 *  1. SMOOTH. A centred moving average over the fixes that have an
 *     altitude (`ALTITUDE_SMOOTHING_RADIUS`), cut short at the ends of the
 *     track. Fixes without one are skipped, not treated as breaks.
 *  2. HYSTERESIS. Walk the smoothed track keeping the extreme of the
 *     current leg; a leg ends when the altitude comes back
 *     `CLIMB_THRESHOLD_M` from that extreme. A climb is counted from its
 *     low point to its high point; a wobble that never moves the threshold
 *     from where it started is not a climb at all.
 *
 * It replaced a per-fix rule — count any rise over 2 m between two
 * consecutive fixes — that was wrong in both directions. A real climb comes
 * in small steps: a runner on a 2% grade rises about 6 cm a fix, so a whole
 * hill on a smooth (barometric) altitude track counted as nothing. And on a
 * jittery track every fix-to-fix rise over 2 m counted in full, so ten flat
 * minutes with ±3 m noise read as hundreds of metres of climbing.
 *
 * One honest limit: slow wander in GPS-only altitude (no barometer) is
 * indistinguishable from terrain without a map of the ground, and moves
 * the threshold like a hill does. This counts it; nothing short of a
 * terrain model would not.
 */
export function climbBySegment(points: GPSPoint[]): {
  gain: number[];
  loss: number[];
} {
  const n = points.length;
  const gain = new Array<number>(n).fill(0);
  const loss = new Array<number>(n).fill(0);
  const at: number[] = []; // indices of points with a usable altitude
  for (let i = 0; i < n; i++) {
    const a = points[i].altitude;
    if (typeof a === "number" && Number.isFinite(a)) at.push(i);
  }
  const m = at.length;
  if (m < 2) return { gain, loss };

  // 1. Smooth.
  const s = new Array<number>(m);
  for (let k = 0; k < m; k++) {
    const lo = Math.max(0, k - ALTITUDE_SMOOTHING_RADIUS);
    const hi = Math.min(m - 1, k + ALTITUDE_SMOOTHING_RADIUS);
    let sum = 0;
    for (let j = lo; j <= hi; j++) sum += points[at[j]].altitude as number;
    s[k] = sum / (hi - lo + 1);
  }

  // 2. Hysteresis: the turning points that end each confirmed leg.
  const turns: number[] = [];
  let dir = 0; // +1 climbing, -1 descending, 0 not yet decided
  let low = 0;
  let high = 0;
  let extreme = 0;
  for (let k = 1; k < m; k++) {
    if (dir === 0) {
      if (s[k] < s[low]) low = k;
      if (s[k] > s[high]) high = k;
      if (s[k] - s[low] >= CLIMB_THRESHOLD_M) {
        turns.push(low);
        dir = 1;
        extreme = k;
      } else if (s[high] - s[k] >= CLIMB_THRESHOLD_M) {
        turns.push(high);
        dir = -1;
        extreme = k;
      }
    } else if (dir === 1) {
      if (s[k] >= s[extreme]) extreme = k;
      else if (s[extreme] - s[k] >= CLIMB_THRESHOLD_M) {
        turns.push(extreme);
        dir = -1;
        extreme = k;
      }
    } else {
      if (s[k] <= s[extreme]) extreme = k;
      else if (s[k] - s[extreme] >= CLIMB_THRESHOLD_M) {
        turns.push(extreme);
        dir = 1;
        extreme = k;
      }
    }
  }
  if (dir === 0) return { gain, loss }; // nothing ever moved the threshold
  turns.push(extreme);

  /* The counted profile: flat before the first turn and after the last,
     and between two turns the running high (on a climb) or low (on a
     descent) — monotone, so each step is all climb or all descent, and the
     steps of a leg add up to exactly its turn-to-turn change. Sub-threshold
     wobbles inside a leg are flattened rather than counted twice. */
  const y = new Array<number>(m);
  for (let k = 0; k <= turns[0]; k++) y[k] = s[turns[0]];
  for (let t = 0; t + 1 < turns.length; t++) {
    const from = turns[t];
    const to = turns[t + 1];
    const up = s[to] > s[from];
    let run = s[from];
    for (let k = from + 1; k <= to; k++) {
      run = up ? Math.max(run, s[k]) : Math.min(run, s[k]);
      y[k] = run;
    }
  }
  const last = turns[turns.length - 1];
  for (let k = last + 1; k < m; k++) y[k] = s[last];

  for (let k = 1; k < m; k++) {
    const d = y[k] - y[k - 1];
    if (d > 0) gain[at[k]] += d;
    else if (d < 0) loss[at[k]] -= d;
  }
  return { gain, loss };
}

/** Total climb in whole metres — see `climbBySegment` for how it is read
 *  from a noisy altitude track. */
export function totalElevationGain(points: GPSPoint[]): number {
  let gain = 0;
  for (const g of climbBySegment(points).gain) gain += g;
  return Math.round(gain);
}

export function totalDistance(points: GPSPoint[]): number {
  let dist = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].breakBefore) continue;
    dist += segmentMetres(points[i - 1], points[i]);
  }
  return dist;
}

/**
 * The fastest 1K / 5K / 10K inside one run: for every point, the shortest
 * stretch ending there that covers the distance, timed on the MOVING clock
 * (`movingClockMs`) and measured through `segmentMetres` — so a stretch
 * that waited at a crossing is timed without the wait, and a line drawn
 * across a pause cannot carry a stretch past the distance in no time.
 */
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
  const n = points.length;
  if (n < 2) return results;

  // Credited distance and moving clock at each point. The clock never steps
  // back, so no stretch can time out negative on a corrected phone clock.
  const cum = new Array<number>(n);
  const clock = new Array<number>(n);
  cum[0] = 0;
  clock[0] = movingClockMs(points[0]);
  for (let i = 1; i < n; i++) {
    cum[i] = cum[i - 1] + segmentMetres(points[i - 1], points[i]);
    clock[i] = Math.max(clock[i - 1], movingClockMs(points[i]));
  }

  for (const effort of efforts) {
    if (totalDistance < effort.target) continue;
    let bestTime = Infinity;
    let startIdx = 0;

    for (let endIdx = 1; endIdx < n; endIdx++) {
      // Move the start up while the stretch would still cover the distance.
      while (
        startIdx < endIdx &&
        cum[endIdx] - cum[startIdx + 1] >= effort.target
      ) {
        startIdx++;
      }
      if (cum[endIdx] - cum[startIdx] >= effort.target) {
        const segTime = (clock[endIdx] - clock[startIdx]) / 1000;
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
  const segments = splitRouteSegments(points)
    .map((segment) => {
      const trkpts = segment
        .map((p) => {
          const time = new Date(p.timestamp).toISOString();
          const ele =
            p.altitude != null ? `<ele>${p.altitude.toFixed(1)}</ele>` : "";
          return `      <trkpt lat="${p.lat}" lon="${p.lon}">${ele}<time>${time}</time></trkpt>`;
        })
        .join("\n");
      return `    <trkseg>\n${trkpts}\n    </trkseg>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Tropos">
  <trk><name>${escapeXml(name)}</name>
${segments}
  </trk>
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
