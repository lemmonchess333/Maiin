/**
 * Run27 (5) on the synthetic GPS bench (src/test/gpsBench.ts): a phone that
 * reads still, fixed to a buggy or a wheelchair pushed at a walk, and the
 * same phone standing at a crossing while GPS drifts at 1 to 2 m/s, played
 * through the real step (`stepAutoPause`, its trail kept by `gpsTrail`, as
 * Run.tsx keeps it) once a fix.
 *
 * SYNTHETIC, as the bench's own header says: its two error models bracket
 * a phone's (smooth, as a filtered fix stream moves; rough, as a raw
 * receiver's does) and nothing here was fitted to an iPhone. These numbers
 * are what chose `GPS_STEADY_STRAIGHTNESS` and `GPS_STEADY_ACCURACY_M`;
 * the phone checks in docs/qa/pre-launch-backlog.md are the real test.
 *
 * What it measured, at 0.7 and 15 m (seeded, so these are exact): for a
 * push, the slowest first restart of its 12 runs and the share of the push
 * held after that restart; for a stand, the share of it the clock ran.
 *
 * | case                  | smooth ±5 / ±10 / ±16 | rough ±5 / ±10 / ±16 |
 * | --------------------- | --------------------- | -------------------- |
 * | push 1.2 m/s, restart | 11 s / 21 s / rarely  | 11 s / 17 s / rarely |
 * | push 1.2 m/s, held    | 0.7% / 7.3% / 94%     | 2.1% / 8.2% / 95%    |
 * | push 1.4 m/s, held    | 0% / 4.5% / 94%       | 1.0% / 8.2% / 94%    |
 * | push 2 m/s, held      | 0% / 1.5% / 89%       | 0.3% / 4.1% / 88%    |
 * | stand in drift, ran   | 0% / 0.13% / 0.13%    | 0% / 3.5% / 0.17%    |
 *
 * Standing under the rough ±10 m error, the clock restarted at least once
 * in 13 of 20 two-minute stands, briefly; under the smooth error in 1.
 *
 * At ±16 m a walking push waits for 2.5 m/s or a step, as it did before
 * Run27 (5): fixes that rough wander by about the 10 m the hold covers.
 * Without the accuracy floor (`GPS_STEADY_ACCURACY_M`) drift there ran the
 * clock for 6.4% of a stand under the smooth error and 29% under the rough.
 */
import { describe, expect, it } from "vitest";
import {
  COURSES,
  STANDING,
  STILL,
  scenarios,
  simulate,
  type Course,
  type Fix,
  type NoiseModel,
  type Pace,
} from "@/test/gpsBench";
import { mulberry32 } from "@/test/prng";
import {
  AUTO_PAUSE_IDLE,
  EMPTY_MOTION,
  gpsTrail,
  stepAutoPause,
  type AutoPauseState,
  type MotionReading,
} from "../runAutoPause";
import type { GPSPoint } from "../gps";

const toPoint = (f: Fix): GPSPoint => ({
  lat: f.lat,
  lon: f.lon,
  rawLat: f.lat,
  rawLon: f.lon,
  altitude: null,
  accuracy: f.accuracy,
  speed: f.speed,
  timestamp: f.t,
});

interface Played {
  heldMs: number;
  runningMs: number;
  /** Held after the first restart: the clock stopping under a push. */
  heldAfterMs: number;
  /** All time after the first restart. */
  afterMs: number;
  /** Seconds from the first fix to the first restart; null for none. */
  firstRestart: number | null;
  restarts: number;
}

/** The fixes through the step, the phone reading still throughout and the
 *  clock paused at the first fix, as after a stop. */
function play(fixes: Fix[]): Played {
  const t0 = fixes[0].t;
  const motion: MotionReading = {
    ...EMPTY_MOTION,
    stepEvent: { at: t0 - 30_000, moving: false },
    activity: { at: t0 - 30_000, kind: "stationary" },
  };
  let state: AutoPauseState = {
    ...AUTO_PAUSE_IDLE,
    paused: true,
    armedAt: t0 - 60_000,
  };
  let trail: GPSPoint[] = [];
  let latest: GPSPoint | null = null;
  let recheckAt: number | null = null;
  const out: Played = {
    heldMs: 0,
    runningMs: 0,
    heldAfterMs: 0,
    afterMs: 0,
    firstRestart: null,
    restarts: 0,
  };
  let at = t0;
  const step = (now: number) => {
    if (state.paused) out.heldMs += now - at;
    else out.runningMs += now - at;
    if (out.firstRestart !== null) {
      out.afterMs += now - at;
      if (state.paused) out.heldAfterMs += now - at;
    }
    at = now;
    trail = gpsTrail(trail, latest, now);
    const result = stepAutoPause(state, {
      now,
      gps: latest,
      trail,
      motion,
      inRecovery: false,
    });
    state = result.state;
    recheckAt = result.recheckAt;
    if (result.change === "resume") {
      out.restarts++;
      out.firstRestart ??= (now - t0) / 1000;
    }
  };
  for (const fix of fixes) {
    while (recheckAt !== null && recheckAt <= fix.t) step(recheckAt);
    latest = toPoint(fix);
    step(fix.t);
  }
  return out;
}

const walk = (v: number): Pace => ({ name: `${v} m/s`, speedAt: () => v });
/** The first stretch of a bench course: a push is minutes, not a 5 km. */
const firstOf = (course: Course, metres: number): Course => ({
  name: course.name,
  length: metres,
  at: course.at,
});
const PUSH_COURSES = [
  firstOf(COURSES[0], 150), // straight
  firstOf(COURSES[1], 150), // park loop
  firstOf(COURSES[2], 360), // city grid: two corners
];

function pushes(v: number, noise: NoiseModel, accuracy: number) {
  const played: Played[] = [];
  for (const s of scenarios(4, {
    courses: PUSH_COURSES,
    paces: [walk(v)],
    noises: [noise],
    accuracies: [accuracy],
    schedules: ["1 Hz"],
  }))
    played.push(play(simulate(s).fixes));
  const heldAfter = played.reduce((a, p) => a + p.heldAfterMs, 0);
  const after = played.reduce((a, p) => a + p.afterMs, 0);
  const held = played.reduce((a, p) => a + p.heldMs, 0);
  const all = played.reduce((a, p) => a + p.heldMs + p.runningMs, 0);
  return {
    heldShare: held / all,
    heldAfterShare: after > 0 ? heldAfter / after : 1,
    restarts: played.reduce((a, p) => a + p.restarts, 0),
    slowestFirstRestart: Math.max(...played.map((p) => p.firstRestart ?? 1e9)),
  };
}

/** Two minutes standing, GPS reporting 1 to 2 m/s from fixes that wander
 *  by the bench's error model: the lights row's drift, with positions. */
function stands(noise: NoiseModel, accuracy: number) {
  const played: Played[] = [];
  for (const s of scenarios(20, {
    courses: [STANDING],
    paces: [STILL],
    noises: [noise],
    accuracies: [accuracy],
    schedules: ["1 Hz"],
  })) {
    const r = mulberry32(s.seed + 1);
    played.push(play(simulate(s).fixes.map((f) => ({ ...f, speed: 1 + r() }))));
  }
  const running = played.reduce((a, p) => a + p.runningMs, 0);
  const all = played.reduce((a, p) => a + p.heldMs + p.runningMs, 0);
  return { runningShare: running / all };
}

describe("Run27 (5) on the synthetic GPS bench", () => {
  describe.each(["smooth", "rough"] as const)("%s error", (noise) => {
    it.each([1.2, 1.4, 2])(
      "a push at %s m/s with ±5 m fixes restarts the clock 10 s in and keeps it running",
      (v) => {
        const r = pushes(v, noise, 5);
        expect(r.slowestFirstRestart).toBeLessThan(12);
        expect(r.heldAfterShare).toBeLessThan(0.025);
      }
    );

    it.each([1.2, 1.4, 2])(
      "a push at %s m/s with ±10 m fixes restarts it within 21 s and holds it under a tenth of the push after",
      (v) => {
        const r = pushes(v, noise, 10);
        expect(r.slowestFirstRestart).toBeLessThan(21);
        expect(r.heldAfterShare).toBeLessThan(0.09);
      }
    );

    it("a push with ±16 m fixes mostly waits, as before: too rough to show a heading", () => {
      expect(pushes(1.4, noise, 16).heldShare).toBeGreaterThan(0.95);
    });

    it("standing in 1 to 2 m/s drift barely runs the clock", () => {
      expect(stands(noise, 5).runningShare).toBe(0);
      expect(stands(noise, 10).runningShare).toBeLessThan(
        noise === "smooth" ? 0.002 : 0.04
      );
      expect(stands(noise, 16).runningShare).toBeLessThan(0.002);
    });
  });
});
