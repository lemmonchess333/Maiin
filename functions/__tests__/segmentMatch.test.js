/**
 * Matching a saved run to a segment (Run26 call 3, lib/segmentMatch.js).
 *
 * Every trace here is drawn in metres east and north of a point in south
 * London (helpers/segmentTraces.cjs). The runner holds 4 m/s (4:10 /km)
 * unless a test says otherwise, so a 1,000 m stretch takes 250 s.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  matchSegment,
  boxCouldMatch,
  routeTolerance,
  traceOf,
  ROUTE_TOLERANCE_M,
  MAX_ROUTE_TOLERANCE_M,
} = require("../lib/segmentMatch");
const {
  segmentShape,
  stretchOf,
  pathMetres,
  boundingBox,
} = require("../lib/segmentGeometry");

const { T0, trace, jitter } = require("./helpers/segmentTraces.cjs");

/** A segment made from a creator's run along `waypoints`, as the store
 *  keeps it. */
function segmentAlong(waypoints) {
  const run = trace(waypoints, { spacing: 15 });
  const stretch = stretchOf(run, 0, run.length - 1);
  return segmentShape(stretch);
}

const STRAIGHT = [
  [0, 0],
  [1000, 0],
];
const L_SHAPE = [
  [0, 0],
  [600, 0],
  [600, 600],
];

describe("a run on the segment's route", () => {
  it("matches a run through it, timed from the start to the end", () => {
    const segment = segmentAlong(STRAIGHT);
    const run = trace([
      [-1000, 0],
      [2000, 0],
    ]);
    const efforts = matchSegment(segment, run);
    expect(efforts).toHaveLength(1);
    // 1,000 m at 4 m/s.
    expect(efforts[0].elapsedSeconds).toBe(250);
    expect(efforts[0].lap).toBe(1);
    expect(efforts[0].startMs).toBe(T0 + 250_000);
  });

  it("times between saved points, not on them", () => {
    const segment = segmentAlong(STRAIGHT);
    // Points every 70 m from -33 m: neither end of the segment is a point.
    const run = trace(
      [
        [-33, 0],
        [1500, 0],
      ],
      { spacing: 70, speed: 3.2 }
    );
    const [effort] = matchSegment(segment, run);
    expect(effort.elapsedSeconds).toBe(Math.round(1000 / 3.2));
  });

  it("matches a run along the L's corner, with GPS noise of ±10 m", () => {
    const segment = segmentAlong(L_SHAPE);
    const run = trace(
      [
        [-300, 0],
        [600, 0],
        [600, 900],
      ],
      {
        nudge: (i, x, y) => [x + 10 * jitter(i), y + 10 * jitter(i + 1000)],
      }
    );
    const efforts = matchSegment(segment, run);
    expect(efforts).toHaveLength(1);
    expect(efforts[0].elapsedSeconds).toBeGreaterThan(290);
    expect(efforts[0].elapsedSeconds).toBeLessThan(310);
  });

  it("matches a marathon's thinned trace, its saved points 84 m apart, round the corner", () => {
    const segment = segmentAlong(L_SHAPE);
    const run = trace(
      [
        [-500, 0],
        [600, 0],
        [600, 1100],
      ],
      { spacing: 84 }
    );
    expect(matchSegment(segment, run)).toHaveLength(1);
  });

  it("counts a stop on the way: the clock keeps running", () => {
    const segment = segmentAlong(STRAIGHT);
    const before = trace([
      [-200, 0],
      [500, 0],
    ]);
    const stoppedMs = 60_000;
    const resume = before[before.length - 1].timestamp + stoppedMs;
    const after = trace(
      [
        [500, 0],
        [1300, 0],
      ],
      { startMs: resume }
    ).slice(1);
    const [effort] = matchSegment(segment, [...before, ...after]);
    expect(effort.elapsedSeconds).toBe(250 + 60);
  });
});

describe("a run that isn't the segment", () => {
  it("does not match the route run the other way", () => {
    const segment = segmentAlong(STRAIGHT);
    const run = trace([
      [2000, 0],
      [-1000, 0],
    ]);
    expect(matchSegment(segment, run)).toEqual([]);
  });

  it("does not match a shortcut across the L", () => {
    const segment = segmentAlong(L_SHAPE);
    const run = trace([
      [-200, 0],
      [0, 0],
      [600, 600],
      [600, 800],
    ]);
    expect(matchSegment(segment, run)).toEqual([]);
  });

  it("does not match a corner cut 60 m inside the L", () => {
    const segment = segmentAlong(L_SHAPE);
    const run = trace([
      [-200, 0],
      [540, 0],
      [600, 60],
      [600, 800],
    ]);
    expect(matchSegment(segment, run)).toEqual([]);
  });

  it("matches a detour 20 m off the route, and not one 100 m off", () => {
    const segment = segmentAlong(STRAIGHT);
    const detour = (off) =>
      trace([
        [-200, 0],
        [400, 0],
        [420, off],
        [580, off],
        [600, 0],
        [1200, 0],
      ]);
    expect(matchSegment(segment, detour(20))).toHaveLength(1);
    expect(matchSegment(segment, detour(100))).toEqual([]);
  });

  it("does not match a run that leaves the route and comes back to where it left", () => {
    const segment = segmentAlong(STRAIGHT);
    // Out to a fountain and back, then on: every metre of the segment is
    // run, but not only the segment.
    const spur = (off) =>
      trace([
        [-200, 0],
        [500, 0],
        [500, off],
        [500, 0],
        [1200, 0],
      ]);
    expect(matchSegment(segment, spur(20))).toHaveLength(1);
    expect(matchSegment(segment, spur(100))).toEqual([]);
  });

  it("does not match a run that stops short of the end", () => {
    const segment = segmentAlong(STRAIGHT);
    const run = trace([
      [-200, 0],
      [900, 0],
    ]);
    expect(matchSegment(segment, run)).toEqual([]);
  });

  it("does not match across a gap in the trace", () => {
    const segment = segmentAlong(STRAIGHT);
    const run = trace([
      [-200, 0],
      [1200, 0],
    ]).map((p, i) => (i === 30 ? { ...p, breakBefore: true } : p));
    expect(matchSegment(segment, run)).toEqual([]);
  });

  it("does not time a stretch faster than a runner can hold", () => {
    const segment = segmentAlong(STRAIGHT);
    const run = trace(
      [
        [-200, 0],
        [1200, 0],
      ],
      { speed: 15 }
    );
    expect(matchSegment(segment, run)).toEqual([]);
  });

  it("does not match a trace whose clock runs backwards", () => {
    const segment = segmentAlong(STRAIGHT);
    const run = trace([
      [-200, 0],
      [1200, 0],
    ]);
    run[20] = { ...run[20], timestamp: run[19].timestamp - 1000 };
    expect(matchSegment(segment, run)).toEqual([]);
  });
});

describe("laps", () => {
  // A 300 m by 200 m block, run anticlockwise from its south-west corner:
  // a 1,000 m loop whose start and end meet.
  const BLOCK = [
    [0, 0],
    [300, 0],
    [300, 200],
    [0, 200],
    [0, 0],
  ];

  it("counts each lap of a loop as its own effort", () => {
    // Made to end 20 m past where it starts, so each lap's end is after
    // the next lap's start.
    const segment = segmentAlong([...BLOCK, [20, 0]]);
    const twice = trace([[-100, 0], ...BLOCK, ...BLOCK.slice(1), [100, 0]]);
    const efforts = matchSegment(segment, twice);
    expect(efforts.map((e) => e.lap)).toEqual([1, 2]);
    expect(efforts.map((e) => e.elapsedSeconds)).toEqual([255, 255]);
    // The second lap began 20 m, 5 s, before the first was timed to its end.
    expect(efforts[0].endMs - efforts[1].startMs).toBeCloseTo(5_000, -2);
  });

  it("counts a loop run once as one effort", () => {
    const segment = segmentAlong([...BLOCK, [20, 0]]);
    const once = trace([[-100, 0], ...BLOCK, [100, 0]]);
    expect(matchSegment(segment, once)).toHaveLength(1);
  });

  it("counts two passes of an out-and-back's out leg once each way it was run forwards", () => {
    const segment = segmentAlong(STRAIGHT);
    // Out, back, out again: the out leg is run forwards twice.
    const run = trace([
      [-100, 0],
      [1100, 0],
      [-100, 0],
      [1100, 0],
    ]);
    expect(matchSegment(segment, run)).toHaveLength(2);
  });
});

describe("the parts", () => {
  it("widens the route tolerance on a thinned trace, up to its cap", () => {
    expect(routeTolerance(20)).toBe(ROUTE_TOLERANCE_M);
    expect(routeTolerance(120)).toBe(60);
    expect(routeTolerance(1000)).toBe(MAX_ROUTE_TOLERANCE_M);
  });

  it("reads a trace's unreadable point as a gap, not a line across it", () => {
    const points = trace(STRAIGHT, { spacing: 250 });
    points[2] = { lat: "x" };
    const read = traceOf(points);
    expect(read).toHaveLength(points.length - 1);
    expect(read[2].breakBefore).toBe(true);
  });

  it("rules a segment out by its box before matching", () => {
    const segment = segmentAlong(STRAIGHT);
    const near = trace([
      [-100, 0],
      [1100, 0],
    ]);
    const elsewhere = trace([
      [5000, 5000],
      [6000, 5000],
    ]);
    expect(boxCouldMatch(segment.bbox, near)).toBe(true);
    expect(boxCouldMatch(segment.bbox, elsewhere)).toBe(false);
  });

  it("keeps a made segment's length and ends from the stretch", () => {
    const run = trace(L_SHAPE, { spacing: 5 });
    const stretch = stretchOf(run, 0, run.length - 1);
    const shape = segmentShape(stretch);
    expect(shape.points.length).toBe(200);
    expect(shape.lengthMeters).toBe(Math.round(pathMetres(run)));
    expect(shape.lengthMeters).toBe(1200);
    expect(shape.start).toEqual({
      lat: Math.round(run[0].lat * 1e6) / 1e6,
      lon: Math.round(run[0].lon * 1e6) / 1e6,
    });
    expect(shape.bbox).toEqual(boundingBox(shape.points));
    expect(shape.startCell).toMatch(/^gcpu[0-9a-z]{2}$/);
  });
});
