/**
 * A synthetic bench for run recording: a runner on a known course, GPS
 * fixes with a modelled error, through the recording rules useGPS applies,
 * and the distance and kilometre splits read against the truth.
 *
 * SYNTHETIC. Every number it produces depends on the error model below,
 * which is an assumption: iOS (CoreLocation) filters its fixes before any
 * app sees them, and nothing here was fitted to a phone's fixes. Two models
 * bracket it, a smooth one ("smooth", what a filtered fix stream looks
 * like) and a rough one ("rough", the error a raw receiver shows), so a
 * method chosen here has to hold under both. The only real check is a
 * phone on a measured course beside another app (docs/qa/pre-launch-backlog.md).
 *
 * Deterministic: every draw comes from `mulberry32` seeded by the scenario.
 */
import { mulberry32 } from "./prng";
import {
  VelocityKalmanFilter,
  calculateSplits,
  isTraceStep,
  readingVerdict,
  totalDistance,
  type GPSPoint,
} from "@/lib/gps";

// ── Geometry ────────────────────────────────────────────────────────────

const LAT0 = 51.45;
const LON0 = -0.15;
/** Metres in a degree of latitude by gps.ts's haversine (R = 6,371 km). */
const M_PER_DEG_LAT = (6_371_000 * Math.PI) / 180;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((LAT0 * Math.PI) / 180);

function toLatLon(x: number, y: number) {
  return { lat: LAT0 + y / M_PER_DEG_LAT, lon: LON0 + x / M_PER_DEG_LON };
}

type XY = { x: number; y: number };

/** A course: its length and the position at any distance along it. */
export interface Course {
  name: string;
  length: number;
  at(metres: number): XY;
}

/** A dense polyline, looked up by distance along it. */
function polyline(name: string, pts: XY[]): Course {
  const cum = [0];
  for (let i = 1; i < pts.length; i++)
    cum.push(
      cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    );
  const length = cum[cum.length - 1];
  return {
    name,
    length,
    at(d) {
      const m = Math.min(length, Math.max(0, d));
      let lo = 0;
      let hi = cum.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] <= m) lo = mid;
        else hi = mid;
      }
      const seg = cum[hi] - cum[lo];
      const f = seg > 0 ? (m - cum[lo]) / seg : 0;
      return {
        x: pts[lo].x + f * (pts[hi].x - pts[lo].x),
        y: pts[lo].y + f * (pts[hi].y - pts[lo].y),
      };
    },
  };
}

/**
 * Waypoints joined by straight legs, each corner rounded to `radius`
 * metres: a runner turns on an arc, not a point. Arcs are drawn in 0.25 m
 * steps, so the course length is the length run.
 */
function rounded(name: string, way: XY[], radius: number): Course {
  const out: XY[] = [way[0]];
  for (let i = 1; i < way.length - 1; i++) {
    const a = way[i - 1];
    const b = way[i];
    const c = way[i + 1];
    const inLen = Math.hypot(b.x - a.x, b.y - a.y);
    const outLen = Math.hypot(c.x - b.x, c.y - b.y);
    const ux = (b.x - a.x) / inLen;
    const uy = (b.y - a.y) / inLen;
    const vx = (c.x - b.x) / outLen;
    const vy = (c.y - b.y) / outLen;
    const turn = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    if (Math.abs(turn) < 1e-6) {
      out.push(b);
      continue;
    }
    // Tangent points either side of the corner, then the arc between them.
    const back = Math.min(
      radius * Math.tan(Math.abs(turn) / 2),
      inLen / 2,
      outLen / 2
    );
    const r = back / Math.tan(Math.abs(turn) / 2);
    const p = { x: b.x - ux * back, y: b.y - uy * back };
    const side = Math.sign(turn);
    const cx = p.x - side * uy * r;
    const cy = p.y + side * ux * r;
    const a0 = Math.atan2(p.y - cy, p.x - cx);
    const steps = Math.max(2, Math.ceil((Math.abs(turn) * r) / 0.25));
    for (let k = 0; k <= steps; k++) {
      const ang = a0 + (turn * k) / steps;
      out.push({ x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) });
    }
  }
  out.push(way[way.length - 1]);
  return polyline(name, out);
}

/** Out 2.5 km along a road and back, turning on a 2 m hairpin. */
function straight(): Course {
  return rounded(
    "straight",
    [
      { x: 0, y: 0 },
      { x: 2500, y: 0 },
      { x: 2500, y: 4 },
      { x: 0, y: 4 },
    ],
    2
  );
}

/** Two laps of a 2.5 km park path whose curves are gentle (radius of
 *  curvature mostly 150 m and up). */
function park(): Course {
  const pts: XY[] = [];
  for (let lap = 0; lap < 2; lap++)
    for (let k = 0; k <= 4000; k++) {
      const t = (2 * Math.PI * k) / 4000;
      const r = 390 + 40 * Math.sin(3 * t);
      pts.push({ x: r * Math.cos(t), y: r * Math.sin(t) });
    }
  return polyline("park loop", pts);
}

/** City blocks: legs of 90 to 220 m and a 90° turn at every corner, taken
 *  on a 3 m radius. About 5 km. */
function grid(): Course {
  const way: XY[] = [{ x: 0, y: 0 }];
  let x = 0;
  let y = 0;
  for (let i = 0; i < 34; i++) {
    const leg = 90 + ((i * 37) % 130);
    if (i % 2 === 0) x += i % 4 === 0 ? leg : -leg * 0.6;
    else y += i % 8 < 4 ? leg : -leg;
    way.push({ x, y });
  }
  return rounded("city grid", way, 3);
}

/** A 400 m track, lane 1: straights of 84.39 m, bends of radius 36.5 m.
 *  Twelve and a half laps. */
function track(): Course {
  const R = 36.5;
  const S = 84.39;
  const pts: XY[] = [];
  const lap = (withBack: boolean) => {
    pts.push({ x: 0, y: 0 }, { x: S, y: 0 });
    for (let k = 1; k <= 200; k++) {
      const t = -Math.PI / 2 + (Math.PI * k) / 200;
      pts.push({ x: S + R * Math.cos(t), y: R + R * Math.sin(t) });
    }
    pts.push({ x: 0, y: 2 * R });
    if (!withBack) return;
    for (let k = 1; k < 200; k++) {
      const t = Math.PI / 2 + (Math.PI * k) / 200;
      pts.push({ x: R * Math.cos(t), y: R + R * Math.sin(t) });
    }
  };
  for (let l = 0; l < 12; l++) lap(true);
  lap(false);
  return polyline("400 m track", pts);
}

/** Switchbacks: 80 m legs joined by 180° hairpins on a 3 m radius, the
 *  tightest course a runner keeps running round. */
function switchbacks(): Course {
  const way: XY[] = [{ x: 0, y: 0 }];
  for (let i = 0; i < 61; i++) {
    const x = i % 2 === 0 ? 80 : 0;
    way.push({ x, y: i * 6 });
    way.push({ x, y: (i + 1) * 6 });
  }
  return rounded("switchbacks", way, 3);
}

export const COURSES: Course[] = [
  straight(),
  park(),
  grid(),
  track(),
  switchbacks(),
];

/** Standing on one spot for two minutes, for the drift a recording with
 *  auto-pause off picks up: with `STILL`, 0.12 m covered in 120 s. */
export const STANDING: Course = {
  name: "standing",
  length: 0.12,
  at: () => ({ x: 0, y: 0 }),
};

// ── The runner ──────────────────────────────────────────────────────────

/** Speed in m/s at a distance along the course. */
export interface Pace {
  name: string;
  speedAt(metres: number): number;
}

const steady = (v: number): Pace => ({
  name: `${v} m/s`,
  speedAt: () => v,
});

/** Not running: a millimetre a second, so the bench's clock still runs. */
export const STILL: Pace = { name: "standing", speedAt: () => 0.001 };

export const PACES: Pace[] = [
  steady(2.5),
  steady(3.5),
  steady(4.5),
  {
    // Fartlek: 400 m at 4.5 m/s, 400 m at 3 m/s, over and over.
    name: "fartlek",
    speedAt: (m) => (Math.floor(m / 400) % 2 === 0 ? 4.5 : 3),
  },
];

/** The runner's distance at every 0.1 s, from the start. */
function truthTable(course: Course, pace: Pace): Float64Array {
  const out: number[] = [0];
  let d = 0;
  while (d < course.length) {
    d += pace.speedAt(d) * 0.1;
    out.push(Math.min(d, course.length));
  }
  return Float64Array.from(out);
}

function distanceAt(table: Float64Array, seconds: number): number {
  const i = seconds * 10;
  const lo = Math.floor(i);
  if (lo >= table.length - 1) return table[table.length - 1];
  return table[lo] + (i - lo) * (table[lo + 1] - table[lo]);
}

function secondsAt(table: Float64Array, metres: number): number {
  let lo = 0;
  let hi = table.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid] <= metres) lo = mid;
    else hi = mid;
  }
  const seg = table[hi] - table[lo];
  return (lo + (seg > 0 ? (metres - table[lo]) / seg : 0)) / 10;
}

// ── The fixes ───────────────────────────────────────────────────────────

/**
 * The error on each fix, per axis, in metres: a slowly wandering offset
 * (first-order Gauss–Markov, 30 s correlation, standard deviation half
 * the reported accuracy) plus a little independent noise.
 *
 * "rough" is that offset as it is. "smooth" passes it through a further
 * 6 s low-pass and rescales it to the same size: the same error, but it
 * changes gently from one fix to the next, as a filtered fix stream's
 * does. Reported accuracy is iOS-like: the nominal figure, ±15% fix to fix.
 */
export type NoiseModel = "smooth" | "rough";
export const NOISE_MODELS: NoiseModel[] = ["smooth", "rough"];
export const ACCURACIES = [5, 10, 16] as const;

const TAU_S = 30;
const SMOOTH_TAU_S = 6;

export type FixSchedule = "1 Hz" | "irregular" | "dropouts";
export const SCHEDULES: FixSchedule[] = ["1 Hz", "irregular", "dropouts"];

export interface Fix {
  /** Epoch ms the fix was taken. */
  t: number;
  lat: number;
  lon: number;
  accuracy: number;
  /** Doppler speed, as the device reports it. */
  speed: number;
}

export interface Scenario {
  course: Course;
  pace: Pace;
  noise: NoiseModel;
  accuracy: number;
  schedule: FixSchedule;
  seed: number;
}

export const T0 = 1_700_000_000_000;

function gauss(r: () => number) {
  const u = Math.max(1e-12, r());
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** The seconds after the start at which fixes are taken. */
function fixTimes(
  schedule: FixSchedule,
  duration: number,
  r: () => number
): number[] {
  const out: number[] = [];
  const gaps: [number, number][] = [];
  if (schedule === "dropouts")
    for (let g = 0; g < 3; g++) {
      const from = 60 + r() * (duration - 120);
      gaps.push([from, from + 20 + r() * 20]);
    }
  let t = 0;
  while (t <= duration) {
    if (!gaps.some(([a, b]) => t > a && t < b)) out.push(t);
    if (schedule === "irregular") {
      const u = r();
      t += u < 0.65 ? 1 : u < 0.85 ? 2 : u < 0.95 ? 3 : 4 + Math.floor(r() * 3);
    } else t += 1;
    t = Math.round((t + (r() - 0.5) * 0.06) * 1000) / 1000;
  }
  return out;
}

export interface Simulated {
  fixes: Fix[];
  /** The runner's distance at a time after the start, in metres. */
  truthAt(seconds: number): number;
  /** When the runner reached a distance, in seconds after the start. */
  truthSecondsAt(metres: number): number;
}

export function simulate(s: Scenario): Simulated {
  const r = mulberry32(s.seed);
  const table = truthTable(s.course, s.pace);
  const duration = (table.length - 1) / 10;
  const sigma = s.accuracy / 2;
  const white = s.noise === "smooth" ? 0.3 : 0.5;
  // Each axis: the wandering offset, and its low-passed copy.
  const ou = [gauss(r) * sigma, gauss(r) * sigma];
  const lp = [ou[0], ou[1]];
  const smoothScale = Math.sqrt((TAU_S + SMOOTH_TAU_S) / TAU_S);
  let last = 0;
  const fixes: Fix[] = [];
  for (const sec of fixTimes(s.schedule, duration, r)) {
    // Advance the error in 0.25 s steps to this fix's time.
    while (last < sec) {
      const dt = Math.min(0.25, sec - last);
      const a = Math.exp(-dt / TAU_S);
      const b = Math.sqrt(1 - a * a);
      const c = Math.exp(-dt / SMOOTH_TAU_S);
      for (let k = 0; k < 2; k++) {
        ou[k] = a * ou[k] + b * sigma * gauss(r);
        lp[k] = c * lp[k] + (1 - c) * ou[k];
      }
      last += dt;
    }
    const err =
      s.noise === "smooth"
        ? [lp[0] * smoothScale, lp[1] * smoothScale]
        : [ou[0], ou[1]];
    const p = s.course.at(distanceAt(table, sec));
    const ll = toLatLon(
      p.x + err[0] + gauss(r) * white,
      p.y + err[1] + gauss(r) * white
    );
    const speed = s.pace.speedAt(distanceAt(table, sec));
    fixes.push({
      t: T0 + Math.round(sec * 1000),
      lat: ll.lat,
      lon: ll.lon,
      accuracy: Math.round(s.accuracy * (0.85 + 0.3 * r()) * 10) / 10,
      speed: Math.max(0, speed + gauss(r) * 0.15),
    });
  }
  return {
    fixes,
    truthAt: (sec) => distanceAt(table, sec),
    truthSecondsAt: (m) => secondsAt(table, m),
  };
}

// ── Recording ───────────────────────────────────────────────────────────

/**
 * How a recording turns fixes into a trace, as useGPS runs it: every fix
 * the trace's rules accept ("ok") or that has not moved a metre ("still")
 * is offered, and the recorder answers with the position to record, or
 * null for none. A "still" fix is never recorded, whatever it answers.
 */
export interface Recorder {
  name: string;
  take(
    fix: Fix,
    verdict: "ok" | "still",
    last: GPSPoint | null
  ): { lat: number; lon: number } | null;
}

/**
 * The trace as Tropos records it now: `VelocityKalmanFilter` takes every
 * accepted fix, and a point is recorded once the smoothed position has
 * moved `traceStepMetres` from the last one (`isTraceStep`). The same
 * calls useGPS makes.
 */
export function troposRecorder(): Recorder {
  const filter = new VelocityKalmanFilter();
  return {
    name: "velocity filter",
    take(fix, verdict, last) {
      const smoothed = filter.process(fix.lat, fix.lon, fix.accuracy, fix.t);
      if (verdict !== "ok") return null;
      if (last && !isTraceStep(last, smoothed, fix.accuracy)) return null;
      return smoothed;
    },
  };
}

/**
 * The position-only filter the trace was recorded with before
 * `VelocityKalmanFilter`, copied here verbatim so the bench and the tests
 * that derive its lag can always show it beside the filter that replaced
 * it: a position and no velocity, its uncertainty growing by
 * `processNoise` m² a second since the last fix it took, a step never
 * counted as less than a second.
 */
export class PositionOnlyFilter {
  private lat = 0;
  private lon = 0;
  private variance = -1;
  private readonly processNoise: number;
  constructor(processNoise = 3) {
    this.processNoise = processNoise;
  }
  process(
    lat: number,
    lon: number,
    accuracy: number,
    secondsSinceLast = 1
  ): { lat: number; lon: number } {
    if (this.variance < 0) {
      this.lat = lat;
      this.lon = lon;
      this.variance = accuracy * accuracy;
    } else {
      const seconds = Number.isFinite(secondsSinceLast)
        ? Math.max(1, secondsSinceLast)
        : 1;
      this.variance += this.processNoise * seconds;
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

/** The trace as it was recorded with `PositionOnlyFilter`: it took only
 *  the fixes that became points, and every accepted fix became one. */
export function positionOnlyRecorder(): Recorder {
  const filter = new PositionOnlyFilter();
  return {
    name: "position-only filter",
    take(fix, verdict, last) {
      if (verdict !== "ok") return null;
      return filter.process(
        fix.lat,
        fix.lon,
        fix.accuracy,
        last ? (fix.t - last.timestamp) / 1000 : 1
      );
    },
  };
}

/**
 * The fixes through useGPS's normal-tracking rules: `readingVerdict`
 * decides which fixes are offered, the recorder places them, and the trace
 * is the points. Distance and splits are then read from the trace by
 * gps.ts, as everything in the app reads them.
 */
export function record(fixes: Fix[], recorder: Recorder): GPSPoint[] {
  const points: GPSPoint[] = [];
  for (const f of fixes) {
    const last = points[points.length - 1] ?? null;
    const coords = {
      latitude: f.lat,
      longitude: f.lon,
      accuracy: f.accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: f.speed,
    } as unknown as GeolocationCoordinates;
    const elapsed = last ? (f.t - points[0].timestamp) / 1000 : 0;
    const verdict = last ? readingVerdict(coords, last, elapsed, f.t) : "ok";
    if (verdict !== "ok" && verdict !== "still") continue;
    const placed = recorder.take(f, verdict, last);
    if (!placed || verdict !== "ok") continue;
    points.push({
      lat: placed.lat,
      lon: placed.lon,
      rawLat: f.lat,
      rawLon: f.lon,
      altitude: null,
      accuracy: f.accuracy,
      speed: f.speed,
      timestamp: f.t,
    });
  }
  return points;
}

export interface Reading {
  /** (recorded − true) / true distance, as a fraction. */
  distanceError: number;
  /** Recorded minus true, seconds, for each kilometre both completed. */
  splitErrors: number[];
  /** The same, as a fraction of the true kilometre's time. */
  splitFractions: number[];
}

/** One scenario, one candidate: distance and splits against the truth. */
export function read(sim: Simulated, recorder: Recorder): Reading {
  const points = record(sim.fixes, recorder);
  const first = (points[0].timestamp - T0) / 1000;
  const lastSec = (points[points.length - 1].timestamp - T0) / 1000;
  const truth = sim.truthAt(lastSec) - sim.truthAt(first);
  const recorded = totalDistance(points);
  const splits = calculateSplits(points);
  const splitErrors: number[] = [];
  const splitFractions: number[] = [];
  const start = sim.truthAt(first);
  for (const split of splits) {
    const to = start + split.km * 1000;
    if (to > sim.truthAt(lastSec)) break;
    const trueSplit =
      sim.truthSecondsAt(to) - Math.max(first, sim.truthSecondsAt(to - 1000));
    splitErrors.push(split.time - trueSplit);
    splitFractions.push((split.time - trueSplit) / trueSplit);
  }
  return { distanceError: recorded / truth - 1, splitErrors, splitFractions };
}

/** Every scenario the bench runs: course × pace × noise × accuracy ×
 *  schedule, `seeds` seeds each. */
export function* scenarios(
  seeds: number,
  pick: {
    courses?: Course[];
    paces?: Pace[];
    noises?: NoiseModel[];
    accuracies?: readonly number[];
    schedules?: FixSchedule[];
  } = {}
): Generator<Scenario> {
  let n = 0;
  for (const course of pick.courses ?? COURSES)
    for (const pace of pick.paces ?? PACES)
      for (const noise of pick.noises ?? NOISE_MODELS)
        for (const accuracy of pick.accuracies ?? ACCURACIES)
          for (const schedule of pick.schedules ?? SCHEDULES)
            for (let s = 0; s < seeds; s++)
              yield {
                course,
                pace,
                noise,
                accuracy,
                schedule,
                seed: 1000 + 7919 * n++,
              };
}
