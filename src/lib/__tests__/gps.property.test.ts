import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { assertProperty } from "@/test/property";
import {
  MAX_PLAUSIBLE_SPEED_MPS,
  calculateSplits,
  haversine,
  movingClockMs,
  movingSecondsBetween,
  pausedMsOf,
  routeTotalDistance,
  segmentMetres,
  totalDistance,
  type GPSPoint,
} from "../gps";
import { METRES_PER_MILE } from "../distanceUnits";

/**
 * The trace's distance and its splits, as properties. A trace is drawn as
 * a start and a list of steps: a few metres to a few kilometres (a signal
 * drop), one to twenty seconds, sometimes with the clock held (`pausedMs`)
 * and sometimes a break (a privacy cut). Coordinates stay off the poles
 * and the antimeridian, where nobody runs and the step maths would wrap.
 */

const EARTH_HALF_CIRCUMFERENCE = Math.PI * 6_371_000;

const lat = fc.double({ min: -70, max: 70, noNaN: true });
const lon = fc.double({ min: -170, max: 170, noNaN: true });

interface Step {
  north: number;
  east: number;
  seconds: number;
  heldSeconds: number;
  breakBefore: boolean;
  altitude: number | null;
}

const step: fc.Arbitrary<Omit<Step, "breakBefore">> = fc.record({
  north: fc.oneof(
    { weight: 8, arbitrary: fc.double({ min: -30, max: 30, noNaN: true }) },
    // A signal drop: fast-check's doubles crowd near zero, so the long
    // jumps are drawn as whole metres to reach them often.
    { weight: 2, arbitrary: fc.integer({ min: -3000, max: 3000 }) }
  ),
  east: fc.double({ min: -30, max: 30, noNaN: true }),
  seconds: fc.integer({ min: 1, max: 20 }),
  heldSeconds: fc.oneof(
    { weight: 6, arbitrary: fc.constant(0) },
    { weight: 1, arbitrary: fc.integer({ min: 1, max: 600 }) }
  ),
  altitude: fc.option(fc.double({ min: -50, max: 3000, noNaN: true }), {
    nil: null,
  }),
});

/** Steps, about one in twenty after a break. */
const steps = fc.array(
  fc.tuple(step, fc.integer({ min: 0, max: 19 })).map(([s, roll]): Step => ({
    ...s,
    breakBefore: roll === 0,
  })),
  { minLength: 1, maxLength: 120 }
);

const START_MS = 1_700_000_000_000;

/** The points a start and its steps walk to. `pausedMs` only grows, as
 *  the run screen writes it. */
function trace(
  startLat: number,
  startLon: number,
  walk: readonly Step[],
  withHolds = true
): GPSPoint[] {
  const point = (
    la: number,
    lo: number,
    timestamp: number,
    pausedMs: number,
    altitude: number | null,
    breakBefore: boolean
  ): GPSPoint => ({
    lat: la,
    lon: lo,
    rawLat: la,
    rawLon: lo,
    altitude,
    accuracy: 5,
    speed: null,
    timestamp,
    ...(pausedMs > 0 ? { pausedMs } : {}),
    ...(breakBefore ? { breakBefore } : {}),
  });
  const points = [point(startLat, startLon, START_MS, 0, null, false)];
  let la = startLat;
  let lo = startLon;
  let t = START_MS;
  let held = 0;
  for (const s of walk) {
    la += s.north / 111_320;
    lo += s.east / (111_320 * Math.cos((la * Math.PI) / 180));
    const heldMs = withHolds ? s.heldSeconds * 1000 : 0;
    t += s.seconds * 1000 + heldMs;
    held += heldMs;
    points.push(point(la, lo, t, held, s.altitude, s.breakBefore));
  }
  return points;
}

const close = (a: number, b: number, abs = 1e-6) =>
  Math.abs(a - b) <= abs + 1e-12 * Math.max(Math.abs(a), Math.abs(b));

describe("haversine", () => {
  it("is never negative, zero to itself, symmetric and at most half the earth", () => {
    assertProperty(
      fc.property(lat, lon, lat, lon, (la1, lo1, la2, lo2) => {
        const d = haversine(la1, lo1, la2, lo2);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(EARTH_HALF_CIRCUMFERENCE + 1e-6);
        expect(haversine(la2, lo2, la1, lo1)).toBe(d);
        expect(haversine(la1, lo1, la1, lo1)).toBe(0);
      })
    );
  });

  it("keeps the triangle inequality", () => {
    assertProperty(
      fc.property(lat, lon, lat, lon, lat, lon, (a1, b1, a2, b2, a3, b3) => {
        const direct = haversine(a1, b1, a3, b3);
        const via = haversine(a1, b1, a2, b2) + haversine(a2, b2, a3, b3);
        expect(direct).toBeLessThanOrEqual(via + 1e-6);
      })
    );
  });
});

describe("a trace's distance", () => {
  it("adds up: the two halves of a trace cut at any point come to the whole", () => {
    assertProperty(
      fc.property(lat, lon, steps, fc.nat(), (la, lo, walk, cutAt) => {
        const points = trace(la, lo, walk);
        const k = cutAt % points.length;
        const whole = totalDistance(points);
        const halves =
          totalDistance(points.slice(0, k + 1)) +
          totalDistance(points.slice(k));
        expect(close(halves, whole, 1e-6 * Math.max(1, whole))).toBe(true);
      })
    );
  });

  it("is never more than the line drawn through the points, and is that line with no clock held", () => {
    assertProperty(
      fc.property(lat, lon, steps, (la, lo, walk) => {
        const held = trace(la, lo, walk);
        const line = routeTotalDistance(held);
        expect(totalDistance(held)).toBeLessThanOrEqual(line + 1e-6);
        const unheld = trace(la, lo, walk, false);
        expect(totalDistance(unheld)).toBe(routeTotalDistance(unheld));
      })
    );
  });

  it("across a hold, a step credits no more than 12 m/s of its moving time", () => {
    assertProperty(
      fc.property(lat, lon, steps, (la, lo, walk) => {
        const points = trace(la, lo, walk);
        for (let i = 1; i < points.length; i++) {
          const [a, b] = [points[i - 1], points[i]];
          const metres = segmentMetres(a, b);
          expect(metres).toBeLessThanOrEqual(
            haversine(a.lat, a.lon, b.lat, b.lon) + 1e-9
          );
          if (pausedMsOf(b) > pausedMsOf(a))
            expect(metres).toBeLessThanOrEqual(
              MAX_PLAUSIBLE_SPEED_MPS * movingSecondsBetween(a, b) + 1e-9
            );
        }
      })
    );
  });

  it("counts nothing across a break", () => {
    assertProperty(
      fc.property(lat, lon, steps, (la, lo, walk) => {
        const points = trace(la, lo, walk);
        const joined = points.map((p, i) =>
          i > 0 && p.breakBefore ? { ...p, breakBefore: undefined } : p
        );
        const gaps = points.reduce(
          (sum, p, i) =>
            i > 0 && p.breakBefore
              ? sum +
                haversine(points[i - 1].lat, points[i - 1].lon, p.lat, p.lon)
              : sum,
          0
        );
        // With every break joined, the distance gains at most the lines
        // the breaks left out.
        expect(totalDistance(joined)).toBeLessThanOrEqual(
          totalDistance(points) + gaps + 1e-6
        );
        expect(totalDistance(joined)).toBeGreaterThanOrEqual(
          totalDistance(points) - 1e-6
        );
      })
    );
  });
});

describe("splits", () => {
  it("one split per whole lap of the distance, numbered from 1, in km and in miles", () => {
    assertProperty(
      fc.property(lat, lon, steps, (la, lo, walk) => {
        const points = trace(la, lo, walk);
        const total = totalDistance(points);
        for (const lap of [1000, METRES_PER_MILE]) {
          const splits = calculateSplits(points, lap);
          expect(splits.length).toBe(Math.floor(total / lap));
          expect(splits.map((s) => s.km)).toEqual(splits.map((_, i) => i + 1));
        }
      })
    );
  });

  it("each split takes moving time, and together no more than the run's", () => {
    assertProperty(
      fc.property(lat, lon, steps, (la, lo, walk) => {
        const points = trace(la, lo, walk);
        const splits = calculateSplits(points);
        const moving =
          (movingClockMs(points[points.length - 1]) -
            movingClockMs(points[0])) /
          1000;
        for (const s of splits) expect(s.time).toBeGreaterThan(0);
        const sum = splits.reduce((acc, s) => acc + s.time, 0);
        expect(sum).toBeLessThanOrEqual(moving + 1e-6);
      })
    );
  });

  it("a split's pace is its time over its lap", () => {
    assertProperty(
      fc.property(lat, lon, steps, (la, lo, walk) => {
        for (const s of calculateSplits(trace(la, lo, walk), METRES_PER_MILE))
          expect(close(s.paceSeconds, (s.time / METRES_PER_MILE) * 1000)).toBe(
            true
          );
      })
    );
  });
});
