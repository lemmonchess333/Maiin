import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { assertProperty } from "@/test/property";
import {
  movingTimeOf,
  replayAutoPause,
  withHolds,
  type MovingFix,
  type MovingTimeInput,
  type RecoveryWindow,
} from "../runMovingTime";
import { GPS_STOP_WINDOW_MS } from "../runAutoPause";
import {
  MAX_PLAUSIBLE_SPEED_MPS,
  movingClockMs,
  pausedMsOf,
  segmentMetres,
  totalDistance,
  type GPSPoint,
} from "../gps";

/**
 * A run's moving time with auto-pause off (Run28 call 1), as properties.
 * A run is drawn as stretches of running and of standing, one fix a
 * second, with a recovery window or two from the plan; its trace walks
 * north at each fix's speed.
 */

const START = 1_700_000_000_000;

interface Stretch {
  seconds: number;
  /** Metres a second: standing (under 0.5), walking or running. */
  speed: number;
  accuracy: number;
}

const stretch: fc.Arbitrary<Stretch> = fc.record({
  seconds: fc.integer({ min: 1, max: 40 }),
  speed: fc.oneof(
    fc.double({ min: 0, max: 0.4, noNaN: true }),
    fc.double({ min: 1.2, max: 6, noNaN: true })
  ),
  accuracy: fc.integer({ min: 3, max: 40 }),
});

interface Run {
  fixes: MovingFix[];
  points: GPSPoint[];
  recoveries: RecoveryWindow[];
  finishedAt: number;
  elapsedSeconds: number;
}

const run: fc.Arbitrary<Run> = fc
  .record({
    stretches: fc.array(stretch, { minLength: 1, maxLength: 12 }),
    recoveries: fc.array(
      fc.record({
        from: fc.integer({ min: 0, max: 400 }),
        length: fc.option(fc.integer({ min: 1, max: 120 }), { nil: null }),
      }),
      { maxLength: 3 }
    ),
    tail: fc.integer({ min: 0, max: 30 }),
    timerDrift: fc.integer({ min: -3, max: 3 }),
    /** Now and then a timer that lost most of the run (a phone that
     *  slept), so the time held can be more than the timer holds. */
    timerShare: fc.oneof(
      { weight: 4, arbitrary: fc.constant(1) },
      { weight: 1, arbitrary: fc.double({ min: 0, max: 1, noNaN: true }) }
    ),
  })
  .map(({ stretches, recoveries, tail, timerDrift, timerShare }) => {
    const fixes: MovingFix[] = [];
    const points: GPSPoint[] = [];
    let t = START;
    let lat = 51.5;
    for (const s of stretches)
      for (let i = 0; i < s.seconds; i++) {
        t += 1000;
        lat += s.speed / 111_320;
        fixes.push({ timestamp: t, speed: s.speed, accuracy: s.accuracy });
        points.push({
          lat,
          lon: -0.12,
          rawLat: lat,
          rawLon: -0.12,
          altitude: null,
          accuracy: s.accuracy,
          speed: s.speed,
          timestamp: t,
        });
      }
    const finishedAt = t + tail * 1000;
    return {
      fixes,
      points,
      recoveries: recoveries.map((w) => ({
        from: START + w.from * 1000,
        to: w.length === null ? null : START + (w.from + w.length) * 1000,
      })),
      finishedAt,
      elapsedSeconds: Math.max(
        0,
        Math.round(((finishedAt - START) / 1000) * timerShare) + timerDrift
      ),
    };
  });

const input = (
  r: Run,
  extra: Partial<MovingTimeInput> = {}
): MovingTimeInput => ({
  points: r.points,
  fixes: r.fixes,
  recoveries: r.recoveries,
  startedAt: START,
  finishedAt: r.finishedAt,
  elapsedSeconds: r.elapsedSeconds,
  autoPause: false,
  outdoorGps: true,
  pausedByHand: false,
  ...extra,
});

describe("replayAutoPause", () => {
  it("holds are ordered, apart, inside the run and never inside a recovery", () => {
    assertProperty(
      fc.property(run, (r) => {
        const holds = replayAutoPause(
          r.fixes,
          r.recoveries,
          START,
          r.finishedAt
        );
        let previousEnd = START;
        for (const h of holds) {
          expect(h.from).toBeLessThan(h.to);
          expect(h.from).toBeGreaterThanOrEqual(previousEnd);
          expect(h.to).toBeLessThanOrEqual(r.finishedAt);
          previousEnd = h.to;
          for (const w of r.recoveries) {
            const to = w.to ?? r.finishedAt;
            if (to <= w.from) continue;
            const overlap = Math.min(h.to, to) - Math.max(h.from, w.from);
            expect(overlap).toBeLessThanOrEqual(0);
          }
        }
      })
    );
  });
});

/**
 * Runs whose holds are known without replaying anything: one fix a
 * second, every fix good enough to count (accuracy 35 m or better),
 * running at 1.2 m/s or more and standing under 0.5 m/s. A stop holds the
 * clock from GPS_STOP_WINDOW_MS into it until the first moving fix, or the
 * finish.
 */
const goodFix = fc.integer({ min: 3, max: 35 });
const leg = (speed: fc.Arbitrary<number>, min: number, max: number) =>
  fc.record({
    seconds: fc.integer({ min, max }),
    speed,
    accuracy: goodFix,
  });
const moving = fc.double({ min: 1.2, max: 6, noNaN: true });
const standing = fc.double({ min: 0, max: 0.4, noNaN: true });

function walk(legs: readonly Stretch[], tail: number) {
  const fixes: MovingFix[] = [];
  const points: GPSPoint[] = [];
  const legStart: number[] = [];
  let t = START;
  let lat = 51.5;
  for (const s of legs) {
    legStart.push(t + 1000);
    for (let i = 0; i < s.seconds; i++) {
      t += 1000;
      lat += s.speed / 111_320;
      fixes.push({ timestamp: t, speed: s.speed, accuracy: s.accuracy });
      points.push({
        lat,
        lon: -0.12,
        rawLat: lat,
        rawLon: -0.12,
        altitude: null,
        accuracy: s.accuracy,
        speed: s.speed,
        timestamp: t,
      });
    }
  }
  return { fixes, points, legStart, finishedAt: t + tail * 1000 };
}

describe("replayAutoPause: a stop is held", () => {
  it("a run that never stops is never held", () => {
    assertProperty(
      fc.property(
        fc.array(leg(moving, 1, 60), { minLength: 1, maxLength: 6 }),
        fc.integer({ min: 0, max: 30 }),
        (legs, tail) => {
          const w = walk(legs, tail);
          expect(replayAutoPause(w.fixes, [], START, w.finishedAt)).toEqual([]);
        }
      )
    );
  });

  it("standing 10 s or more to the finish holds from 5 s into the stop to the finish", () => {
    assertProperty(
      fc.property(
        leg(moving, 1, 60),
        leg(standing, 10, 120),
        fc.integer({ min: 0, max: 30 }),
        (ran, stood, tail) => {
          const w = walk([ran, stood], tail);
          expect(replayAutoPause(w.fixes, [], START, w.finishedAt)).toEqual([
            { from: w.legStart[1] + GPS_STOP_WINDOW_MS, to: w.finishedAt },
          ]);
        }
      )
    );
  });

  it("a stop between two runs is held until the first moving fix", () => {
    assertProperty(
      fc.property(
        leg(moving, 1, 60),
        leg(standing, 10, 120),
        leg(moving, 1, 60),
        fc.integer({ min: 0, max: 30 }),
        (ran, stood, ranAgain, tail) => {
          const w = walk([ran, stood, ranAgain], tail);
          expect(replayAutoPause(w.fixes, [], START, w.finishedAt)).toEqual([
            {
              from: w.legStart[1] + GPS_STOP_WINDOW_MS,
              to: w.legStart[2],
            },
          ]);
        }
      )
    );
  });

  it("the moving time is the timer less the stop, but for what each step keeps for its metres", () => {
    assertProperty(
      fc.property(
        leg(moving, 1, 60),
        leg(standing, 10, 120),
        fc.integer({ min: 0, max: 30 }),
        (ran, stood, tail) => {
          const w = walk([ran, stood], tail);
          const elapsedSeconds = (w.finishedAt - START) / 1000;
          const result = movingTimeOf({
            points: w.points,
            fixes: w.fixes,
            recoveries: [],
            startedAt: START,
            finishedAt: w.finishedAt,
            elapsedSeconds,
            autoPause: false,
            outdoorGps: true,
            pausedByHand: false,
          });
          const stopMs = w.finishedAt - (w.legStart[1] + GPS_STOP_WINDOW_MS);
          // Standing steps under 0.5 m/s keep a few ms each for their
          // drift (withHolds' rule): at most 0.4 m / 12 m/s, plus 1 ms.
          const keptMs = stood.seconds * (Math.ceil((0.4 / 12) * 1000) + 1);
          expect(result.source).toBe("trace");
          expect(result.heldSeconds).toBeLessThanOrEqual(
            Math.round(stopMs / 1000)
          );
          expect(result.heldSeconds).toBeGreaterThanOrEqual(
            Math.round((stopMs - keptMs) / 1000)
          );
          // The moving time: the running, the stop's first 5 s, and the
          // kept milliseconds.
          expect(result.seconds).toBeGreaterThanOrEqual(
            elapsedSeconds - Math.round(stopMs / 1000)
          );
          expect(result.seconds).toBeLessThanOrEqual(
            elapsedSeconds - Math.round((stopMs - keptMs) / 1000)
          );
        }
      )
    );
  });
});

describe("withHolds", () => {
  it("keeps the run's distance, and the moving clock never runs backwards", () => {
    assertProperty(
      fc.property(run, (r) => {
        const holds = replayAutoPause(
          r.fixes,
          r.recoveries,
          START,
          r.finishedAt
        );
        const { points, heldMs } = withHolds(r.points, holds, r.finishedAt);
        expect(points).toHaveLength(r.points.length);
        expect(totalDistance(points)).toBe(totalDistance(r.points));
        for (let i = 1; i < points.length; i++) {
          expect(pausedMsOf(points[i])).toBeGreaterThanOrEqual(
            pausedMsOf(points[i - 1])
          );
          expect(movingClockMs(points[i])).toBeGreaterThanOrEqual(
            movingClockMs(points[i - 1])
          );
        }
        const holdsMs = holds.reduce((ms, h) => ms + (h.to - h.from), 0);
        expect(heldMs).toBeGreaterThanOrEqual(0);
        expect(heldMs).toBeLessThanOrEqual(holdsMs);
      })
    );
  });

  it("takes out every held millisecond but the few a step keeps for its metres", () => {
    assertProperty(
      fc.property(run, (r) => {
        const holds = replayAutoPause(
          r.fixes,
          r.recoveries,
          START,
          r.finishedAt
        );
        const { points, heldMs } = withHolds(r.points, holds, r.finishedAt);
        const heldBefore = (at: number) =>
          holds.reduce(
            (ms, h) => (h.from < at ? ms + Math.min(h.to, at) - h.from : ms),
            0
          );
        // A point carries no more than the time held before it.
        for (const p of points)
          expect(pausedMsOf(p)).toBeLessThanOrEqual(heldBefore(p.timestamp));
        // Each step keeps at most what 12 m/s needs for its metres, plus a
        // millisecond (withHolds' rule); nothing else stays in.
        let kept = 0;
        for (let i = 1; i < r.points.length; i++) {
          const metres = segmentMetres(r.points[i - 1], r.points[i]);
          if (metres > 0)
            kept += Math.ceil((metres / MAX_PLAUSIBLE_SPEED_MPS) * 1000) + 1;
        }
        expect(heldMs).toBeGreaterThanOrEqual(heldBefore(r.finishedAt) - kept);
      })
    );
  });
});

describe("movingTimeOf", () => {
  it("moving time and time held are each between 0 and the timer, and a trace of two points is read", () => {
    assertProperty(
      fc.property(run, (r) => {
        const result = movingTimeOf(input(r));
        expect(result.heldSeconds).toBeGreaterThanOrEqual(0);
        expect(result.heldSeconds).toBeLessThanOrEqual(r.elapsedSeconds);
        expect(result.seconds).toBeGreaterThanOrEqual(0);
        expect(result.seconds).toBeLessThanOrEqual(r.elapsedSeconds);
        // Auto-pause off, outdoors, never paused by hand, a known start
        // and no hold in the trace: read from the trace once it has two
        // points.
        expect(result.source).toBe(r.points.length >= 2 ? "trace" : "timer");
      })
    );
  });

  it("a run timed by auto-pause, paused by hand or not outdoors keeps its timer and its trace", () => {
    assertProperty(
      fc.property(
        run,
        fc.constantFrom<Partial<MovingTimeInput>>(
          { autoPause: true },
          { pausedByHand: true },
          { outdoorGps: false },
          { startedAt: null }
        ),
        (r, change) => {
          const result = movingTimeOf(input(r, change));
          expect(result.source).toBe("timer");
          expect(result.seconds).toBe(r.elapsedSeconds);
          expect(result.heldSeconds).toBe(0);
          expect(result.points).toEqual(r.points);
        }
      )
    );
  });

  it("a trace that already holds a hold is not replayed again", () => {
    assertProperty(
      fc.property(run, (r) => {
        const once = movingTimeOf(input(r));
        if (!once.points.some((p) => pausedMsOf(p) > 0)) return;
        const twice = movingTimeOf(input(r, { points: once.points }));
        expect(twice.source).toBe("timer");
        expect(twice.heldSeconds).toBe(0);
      })
    );
  });
});
