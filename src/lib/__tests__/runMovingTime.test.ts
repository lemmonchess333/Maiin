/**
 * Run28 call 1: a run recorded with auto-pause off, no manual pause and a
 * GPS trace gets its moving time from the trace, the GPS-only auto-pause
 * rule replayed over the fixes the run screen saw. Every trace here is
 * built in code: one fix a second, running north at 3 m/s or standing.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_PLAUSIBLE_SPEED_MPS,
  calculateSplits,
  movingClockMs,
  pausedMsOf,
  segmentMetres,
  totalDistance,
  type GPSPoint,
} from "../gps";
import { GPS_STOP_WINDOW_MS } from "../runAutoPause";
import {
  movingTimeOf,
  replayAutoPause,
  withHolds,
  type MovingFix,
  type MovingTimeInput,
  type RecoveryWindow,
} from "../runMovingTime";

const T0 = 1_700_000_000_000;
const M_PER_DEG = (6_371_000 * Math.PI) / 180;
const RUN_MPS = 3;

/** A stretch of the run: running at 3 m/s, or standing. Standing with
 *  `driftEvery` records a point that often, a few metres off, as a phone
 *  standing among buildings does; without it, standing records no point
 *  (useGPS keeps no fix that has not moved a step). */
type Stretch =
  | { run: number }
  | { stand: number; driftEvery?: number; speed?: number }
  | { noFix: number };

interface Recorded {
  points: GPSPoint[];
  fixes: MovingFix[];
  /** Seconds from the clock's start to the finish: the timer, with
   *  auto-pause off and no pause. */
  seconds: number;
  finishedAt: number;
}

function record(stretches: Stretch[]): Recorded {
  const points: GPSPoint[] = [];
  const fixes: MovingFix[] = [];
  let t = 0;
  let metres = 0;
  const point = (offsetM: number, speed: number): GPSPoint => ({
    lat: (metres + offsetM) / M_PER_DEG,
    lon: 0,
    rawLat: (metres + offsetM) / M_PER_DEG,
    rawLon: 0,
    altitude: 10,
    accuracy: 5,
    speed,
    timestamp: T0 + t * 1000,
  });
  for (const stretch of stretches) {
    if ("run" in stretch) {
      for (let s = 0; s < stretch.run; s++) {
        const p = point(0, RUN_MPS);
        fixes.push({ timestamp: p.timestamp, speed: p.speed, accuracy: 5 });
        points.push(p);
        metres += RUN_MPS;
        t++;
      }
    } else if ("stand" in stretch) {
      const speed = stretch.speed ?? 0.2;
      for (let s = 0; s < stretch.stand; s++) {
        fixes.push({ timestamp: T0 + t * 1000, speed, accuracy: 5 });
        if (stretch.driftEvery && s > 0 && s % stretch.driftEvery === 0)
          points.push(point(s % (2 * stretch.driftEvery) === 0 ? -3 : 3, speed));
        t++;
      }
    } else {
      t += stretch.noFix;
      metres += RUN_MPS * stretch.noFix;
    }
  }
  // The finish, on the last fix's second.
  const last = point(0, RUN_MPS);
  points.push(last);
  fixes.push({ timestamp: last.timestamp, speed: RUN_MPS, accuracy: 5 });
  return { points, fixes, seconds: t, finishedAt: last.timestamp };
}

function input(
  rec: Recorded,
  overrides: Partial<MovingTimeInput> = {}
): MovingTimeInput {
  return {
    points: rec.points,
    fixes: rec.fixes,
    recoveries: [],
    startedAt: T0,
    finishedAt: rec.finishedAt,
    elapsedSeconds: rec.seconds,
    autoPause: false,
    outdoorGps: true,
    pausedByHand: false,
    ...overrides,
  };
}

/** Seconds a stop of `standS` takes out: all of it but the window that
 *  must pass before auto-pause stops the clock. */
const heldOf = (standS: number) => standS - GPS_STOP_WINDOW_MS / 1000;

describe("a run with auto-pause off gets its moving time from its trace", () => {
  it("leaves a stop at a crossing out of the time, and keeps the distance", () => {
    const rec = record([{ run: 600 }, { stand: 40 }, { run: 600 }]);
    const moving = movingTimeOf(input(rec));
    expect(moving.source).toBe("trace");
    expect(rec.seconds).toBe(1240);
    expect(moving.heldSeconds).toBe(heldOf(40));
    expect(moving.seconds).toBe(1240 - 35);
    expect(totalDistance(moving.points)).toBe(totalDistance(rec.points));
    // The first point after the stop carries the stop, less its window.
    const after = moving.points.find((p) => p.timestamp === T0 + 640_000)!;
    expect(pausedMsOf(after)).toBe(35_000);
  });

  it("times the splits on the moving time: the kilometre with the stop", () => {
    const rec = record([{ run: 600 }, { stand: 40 }, { run: 600 }]);
    const before = calculateSplits(rec.points);
    const after = calculateSplits(movingTimeOf(input(rec)).points);
    expect(after).toHaveLength(before.length);
    // 3 m/s is 333.3 s a kilometre; the stop is at 1.8 km, in km 2.
    expect(before[1].time - after[1].time).toBeCloseTo(35, 6);
    expect(after[0].time).toBeCloseTo(before[0].time, 6);
    expect(after[2].time).toBeCloseTo(before[2].time, 6);
  });

  it("leaves drift while standing out of the time and in the distance", () => {
    // Standing 40 s, a point 3 m off every 4 s: the trace's distance grows
    // by the drift, and the stop is still a stop.
    const rec = record([
      { run: 600 },
      { stand: 40, driftEvery: 4 },
      { run: 600 },
    ]);
    const moving = movingTimeOf(input(rec));
    expect(moving.source).toBe("trace");
    // Every metre the trace credited is kept, exactly.
    expect(totalDistance(moving.points)).toBe(totalDistance(rec.points));
    expect(totalDistance(rec.points)).toBeGreaterThan(1200 * RUN_MPS);
    // Each drift step inside the hold keeps the time 12 m/s needs for its
    // metres, half a second for 6 m: each of the nine steps keeps under a
    // second of the 35 held.
    const driftSteps = rec.points.filter(
      (p) => p.timestamp > T0 + 600_000 && p.timestamp <= T0 + 640_000
    ).length;
    expect(driftSteps).toBe(10);
    expect(moving.heldSeconds).toBeGreaterThan(heldOf(40) - driftSteps);
    expect(moving.heldSeconds).toBeLessThan(heldOf(40));
    // The moving clock never steps back.
    for (let i = 1; i < moving.points.length; i++)
      expect(movingClockMs(moving.points[i])).toBeGreaterThanOrEqual(
        movingClockMs(moving.points[i - 1])
      );
  });

  it("never takes a recovery stood through out of the time", () => {
    // A run-walk's 60 s walk stood through, then a crossing.
    const rec = record([
      { run: 300 },
      { stand: 60 },
      { run: 300 },
      { stand: 40 },
      { run: 300 },
    ]);
    const recoveries: RecoveryWindow[] = [
      { from: T0 + 300_000, to: T0 + 360_000 },
    ];
    const moving = movingTimeOf(input(rec, { recoveries }));
    expect(moving.heldSeconds).toBe(heldOf(40));
    expect(moving.seconds).toBe(rec.seconds - heldOf(40));
    // Without the recovery, both stops would come out.
    expect(movingTimeOf(input(rec)).heldSeconds).toBe(heldOf(60) + heldOf(40));
  });

  it("ends a hold where a recovery begins, and keeps the recovery", () => {
    // Standing from 20 s before the recovery to its end.
    const rec = record([{ run: 300 }, { stand: 80 }, { run: 300 }]);
    const holds = replayAutoPause(
      rec.fixes,
      [{ from: T0 + 320_000, to: T0 + 380_000 }],
      T0,
      rec.finishedAt
    );
    expect(holds).toEqual([{ from: T0 + 305_000, to: T0 + 320_000 }]);
  });

  it("stops nothing while the fixes stop: no evidence is not a stop", () => {
    const rec = record([{ run: 300 }, { noFix: 60 }, { run: 300 }]);
    const moving = movingTimeOf(input(rec));
    expect(moving.source).toBe("trace");
    expect(moving.heldSeconds).toBe(0);
    expect(moving.seconds).toBe(rec.seconds);
  });

  it("leaves a stand at the finish out, up to the finish", () => {
    // Standing from 600 s; Finish tapped at 640 s, no fix after 629 s.
    const rec = record([{ run: 600 }, { stand: 30 }]);
    const standing = rec.fixes.slice(0, -1);
    const holds = replayAutoPause(standing, [], T0, T0 + 640_000);
    expect(holds).toEqual([{ from: T0 + 605_000, to: T0 + 640_000 }]);
  });

  it("keeps the clock running through drift that reads 1 m/s or more", () => {
    // The GPS-only rule: 1 m/s is moving, as live auto-pause reads it.
    const rec = record([{ run: 300 }, { stand: 40, speed: 1.4 }, { run: 300 }]);
    expect(movingTimeOf(input(rec)).heldSeconds).toBe(0);
  });
});

describe("a run that keeps its timer", () => {
  const rec = record([{ run: 600 }, { stand: 40 }, { run: 600 }]);

  it.each([
    ["paused by hand", { pausedByHand: true }],
    ["on a treadmill", { outdoorGps: false }],
    ["with no trace", { points: [] }],
    ["with auto-pause on", { autoPause: true }],
    ["with no clock start", { startedAt: null }],
    ["with no fixes kept", { fixes: [] }],
  ] as [string, Partial<MovingTimeInput>][])("%s", (_name, overrides) => {
    const moving = movingTimeOf(input(rec, overrides));
    expect(moving.source).toBe("timer");
    expect(moving.seconds).toBe(rec.seconds);
    expect(moving.heldSeconds).toBe(0);
    expect(moving.points).toEqual(overrides.points ?? rec.points);
  });

  it("a trace that holds a hold already: a run resumed after the app closed", () => {
    const held = rec.points.map((p, i) =>
      i > 700 ? { ...p, pausedMs: 120_000 } : p
    );
    const moving = movingTimeOf(input(rec, { points: held }));
    expect(moving.source).toBe("timer");
    expect(moving.points).toEqual(held);
  });
});

describe("withHolds", () => {
  it("gives a point inside a hold the time held up to it, less what its metres keep", () => {
    // Standing 15 to 30 s with a point 3 m off every 5 s.
    const rec = record([{ run: 10 }, { stand: 20, driftEvery: 5 }, { run: 10 }]);
    const { points, heldMs } = withHolds(
      rec.points,
      [{ from: T0 + 15_000, to: T0 + 30_000 }],
      rec.finishedAt
    );
    /** What a step of `metres` keeps of a hold: the time 12 m/s needs. */
    const keeps = (metres: number) =>
      Math.ceil((metres / MAX_PLAUSIBLE_SPEED_MPS) * 1000) + 1;
    const at = (s: number) =>
      rec.points.findIndex((p) => p.timestamp === T0 + s * 1000);
    const step = (i: number) => segmentMetres(rec.points[i - 1], rec.points[i]);
    // The drift point at 15 s is the hold's first instant: nothing held.
    expect(points[at(15)].pausedMs).toBeUndefined();
    // At 20 s: five seconds held, less what the 6 m step keeps.
    expect(step(at(20))).toBeCloseTo(6, 6);
    expect(points[at(20)].pausedMs).toBe(5000 - keeps(step(at(20))));
    // The whole hold, less what each of its three steps keeps.
    const kept = [20, 25, 30].reduce((ms, s) => ms + keeps(step(at(s))), 0);
    expect(heldMs).toBe(15_000 - kept);
    expect(totalDistance(points)).toBe(totalDistance(rec.points));
    // Before the hold: nothing held, and no field written.
    expect(points[5].pausedMs).toBeUndefined();
  });
});

describe("the worked example: 30 minutes with two 40 s stops", () => {
  // 3 m/s; stops at 10 and 20 minutes.
  const rec = record([
    { run: 600 },
    { stand: 40 },
    { run: 560 },
    { stand: 40 },
    { run: 560 },
  ]);
  const moving = movingTimeOf(input(rec));
  const distance = totalDistance(rec.points);
  const pace = (seconds: number) => (seconds / distance) * 1000;

  it("is 30:00 elapsed and 28:50 moving, on the same 5.16 km", () => {
    expect(rec.seconds).toBe(1800);
    expect(moving.seconds).toBe(1730);
    expect(totalDistance(moving.points)).toBe(distance);
    expect(Math.round(distance)).toBe(5160);
    // The average pace: 348.8 s a kilometre (5:48 /km) on the timer, 335.3
    // (5:35 /km) moving.
    expect(Math.floor(pace(rec.seconds))).toBe(348);
    expect(Math.floor(pace(moving.seconds))).toBe(335);
  });
});
