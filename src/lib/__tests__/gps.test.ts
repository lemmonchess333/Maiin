import { describe, it, expect } from "vitest";
import { paceMinSec } from "../runLabels";
import { METRES_PER_MILE } from "../distanceUnits";
import {
  haversine,
  bearing,
  routeProgress,
  routeTotalDistance,
  routeTimeAtDistance,
  isValidReading,
  readingVerdict,
  calculatePace,
  rollingPaceSeconds,
  paceAsNumber,
  calculateSplits,
  splitsForDisplay,
  totalElevationGain,
  totalDistance,
  estimateRunCalories,
  detectBestEfforts,
  KalmanFilter,
  toGPX,
  climbBySegment,
  movingClockMs,
  movingSecondsBetween,
  segmentMetres,
  fixTimestamp,
  MAX_PLAUSIBLE_SPEED_MPS,
  FIX_TIME_MAX_AGE_MS,
  type GPSPoint,
} from "../gps";
import { sampleRoute } from "../routeSegments";

// ── Helpers ──────────────────────────────────

function makePoint(overrides: Partial<GPSPoint> = {}): GPSPoint {
  const base = {
    lat: 51.5074,
    lon: -0.1278,
    altitude: 10,
    accuracy: 5,
    speed: 3,
    timestamp: Date.now(),
    ...overrides,
  };
  return {
    ...base,
    /* Raw defaults to the (possibly overridden) smoothed pair rather than to a
       fixed literal. `useGPS.makePoint` derives both from one fix, so a point
       whose lat/lon and rawLat/rawLon disagree by hundreds of metres is not a
       state production can reach — and `isValidReading` now measures from the
       RAW pair, so a stale literal here would fabricate a teleport. An explicit
       rawLat/rawLon override still wins, for the tests that want the two to
       differ on purpose. */
    rawLat: overrides.rawLat ?? base.lat,
    rawLon: overrides.rawLon ?? base.lon,
  };
}

/** Metres in one degree of latitude, by this module's haversine (R =
 *  6,371 km): a step of `m / M_PER_DEG` degrees along a meridian is
 *  exactly `m` metres to it. */
const M_PER_DEG = (6371000 * Math.PI) / 180;

/**
 * A run due north from the equator: `n` points `stepM` metres apart, one
 * every `dtSec` seconds of running. `holds[i]` is seconds the clock was
 * stopped just before point `i` — the shape useGPS records a pause in:
 * nothing recorded while held, the wall clock jumps, and every later point
 * carries the time held in `pausedMs`. `carriedM[i]` moves point `i` (and
 * everything after it) on by that many metres, covered while held.
 */
function trace(
  n: number,
  stepM: number,
  dtSec: number,
  holds: Record<number, number> = {},
  carriedM: Record<number, number> = {},
  moveSec: Record<number, number> = {}
): GPSPoint[] {
  const pts: GPSPoint[] = [];
  let t = 1_700_000_000_000;
  let held = 0;
  let metres = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      t += (moveSec[i] ?? dtSec) * 1000;
      metres += stepM;
    }
    if (holds[i]) {
      t += holds[i] * 1000;
      held += holds[i] * 1000;
    }
    metres += carriedM[i] ?? 0;
    pts.push(
      makePoint({
        lat: metres / M_PER_DEG,
        lon: 0,
        altitude: 10,
        timestamp: t,
        ...(held > 0 ? { pausedMs: held } : {}),
      })
    );
  }
  return pts;
}

// ── haversine ────────────────────────────────

describe("haversine", () => {
  it("returns 0 for identical points", () => {
    expect(haversine(51.5074, -0.1278, 51.5074, -0.1278)).toBe(0);
  });

  it("calculates known distance: London to Paris (~343 km)", () => {
    const dist = haversine(51.5074, -0.1278, 48.8566, 2.3522);
    expect(dist).toBeGreaterThan(340000);
    expect(dist).toBeLessThan(346000);
  });

  it("calculates known distance: New York to Los Angeles (~3944 km)", () => {
    const dist = haversine(40.7128, -74.006, 34.0522, -118.2437);
    expect(dist).toBeGreaterThan(3930000);
    expect(dist).toBeLessThan(3960000);
  });

  it("calculates short distance (~100m between nearby points)", () => {
    // About 111m per 0.001 degree of latitude
    const dist = haversine(51.5074, -0.1278, 51.5084, -0.1278);
    expect(dist).toBeGreaterThan(100);
    expect(dist).toBeLessThan(120);
  });

  it("is symmetric", () => {
    const d1 = haversine(51.5074, -0.1278, 48.8566, 2.3522);
    const d2 = haversine(48.8566, 2.3522, 51.5074, -0.1278);
    expect(d1).toBeCloseTo(d2, 5);
  });

  it("handles equator crossing", () => {
    const dist = haversine(1, 0, -1, 0);
    // ~222 km
    expect(dist).toBeGreaterThan(220000);
    expect(dist).toBeLessThan(224000);
  });
});

// ── bearing ──────────────────────────────────

describe("bearing", () => {
  it("points ~north (0°) for due-north travel", () => {
    const b = bearing(51.5, -0.1, 51.51, -0.1);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(1);
  });

  it("points ~east (90°) for due-east travel", () => {
    expect(bearing(51.5, -0.1, 51.5, -0.09)).toBeCloseTo(90, 0);
  });

  it("points ~south (180°) for due-south travel", () => {
    expect(bearing(51.5, -0.1, 51.49, -0.1)).toBeCloseTo(180, 0);
  });

  it("points ~west (270°) for due-west travel", () => {
    expect(bearing(51.5, -0.1, 51.5, -0.11)).toBeCloseTo(270, 0);
  });

  it("always returns a value in [0, 360)", () => {
    const b = bearing(51.5, -0.1, 51.49, -0.11);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
  });
});

// ── routeTotalDistance / routeProgress ───────

describe("routeTotalDistance", () => {
  it("sums segment lengths (~222m for two 0.001° lat steps)", () => {
    const route = [
      makePoint({ lat: 51.5, lon: -0.1 }),
      makePoint({ lat: 51.501, lon: -0.1 }),
      makePoint({ lat: 51.502, lon: -0.1 }),
    ];
    const total = routeTotalDistance(route);
    expect(total).toBeGreaterThan(215);
    expect(total).toBeLessThan(230);
  });

  it("is 0 for a single point", () => {
    expect(routeTotalDistance([makePoint({ lat: 51.5, lon: -0.1 })])).toBe(0);
  });
});

describe("routeProgress", () => {
  const route = [
    makePoint({ lat: 51.5, lon: -0.1 }),
    makePoint({ lat: 51.501, lon: -0.1 }),
    makePoint({ lat: 51.502, lon: -0.1 }),
  ];

  it("returns null for a degenerate route (<2 points)", () => {
    expect(
      routeProgress([makePoint({ lat: 51.5, lon: -0.1 })], 51.5, -0.1)
    ).toBeNull();
  });

  it("on-route start: ~0 off-route, ~0 covered, full remaining", () => {
    const p = routeProgress(route, 51.5, -0.1)!;
    expect(p.offRouteMeters).toBeLessThan(2);
    expect(p.coveredMeters).toBeLessThan(2);
    expect(p.remainingMeters).toBeCloseTo(p.totalMeters, 0);
    expect(p.fraction).toBeLessThan(0.02);
  });

  it("on-route midpoint: ~0 off-route, ~half covered", () => {
    const p = routeProgress(route, 51.501, -0.1)!;
    expect(p.offRouteMeters).toBeLessThan(2);
    expect(p.fraction).toBeGreaterThan(0.45);
    expect(p.fraction).toBeLessThan(0.55);
  });

  it("off to the side: off-route distance reflects the lateral offset", () => {
    // ~0.001° lon off at lat 51.5 ≈ 69m
    const p = routeProgress(route, 51.501, -0.101)!;
    expect(p.offRouteMeters).toBeGreaterThan(50);
    expect(p.offRouteMeters).toBeLessThan(85);
  });

  it("past the end clamps covered to total (remaining ~0)", () => {
    const p = routeProgress(route, 51.5021, -0.1)!;
    expect(p.remainingMeters).toBeLessThan(20);
    expect(p.fraction).toBeGreaterThan(0.9);
  });
});

// ── routeTimeAtDistance ──────────────────────

describe("routeTimeAtDistance", () => {
  const base = Date.parse("2026-01-01T10:00:00Z");
  // ~111m per 0.001° lat. Three points 60s apart → 0s @0m, 60s @~111m, 120s @~222m.
  const route = [
    makePoint({ lat: 51.5, lon: -0.1, timestamp: base }),
    makePoint({ lat: 51.501, lon: -0.1, timestamp: base + 60_000 }),
    makePoint({ lat: 51.502, lon: -0.1, timestamp: base + 120_000 }),
  ];

  it("returns ~0s at the start", () => {
    expect(routeTimeAtDistance(route, 0)).toBeCloseTo(0, 0);
  });

  it("interpolates ~60s at the first km-point distance (~111m)", () => {
    const t = routeTimeAtDistance(route, 111)!;
    expect(t).toBeGreaterThan(55);
    expect(t).toBeLessThan(65);
  });

  it("interpolates within a segment (~30s at ~55m)", () => {
    const t = routeTimeAtDistance(route, 55)!;
    expect(t).toBeGreaterThan(25);
    expect(t).toBeLessThan(35);
  });

  it("returns the full original time beyond the route end", () => {
    expect(routeTimeAtDistance(route, 10_000)).toBeCloseTo(120, 0);
  });

  it("returns null when the route has no real timestamps (GPX without time)", () => {
    const noTime = [
      makePoint({ lat: 51.5, lon: -0.1, timestamp: 0 }),
      makePoint({ lat: 51.501, lon: -0.1, timestamp: 0 }),
    ];
    expect(routeTimeAtDistance(noTime, 50)).toBeNull();
  });
});

// ── isValidReading ───────────────────────────

describe("isValidReading", () => {
  it("accepts first point with accuracy <= 150", () => {
    const coords = {
      latitude: 51.5,
      longitude: -0.1,
      accuracy: 100,
      altitude: 10,
      altitudeAccuracy: 5,
      heading: 0,
      speed: 3,
      toJSON() {
        return this;
      },
    };
    expect(isValidReading(coords, null)).toBe(true);
  });

  it("rejects first point with accuracy > 150", () => {
    const coords = {
      latitude: 51.5,
      longitude: -0.1,
      accuracy: 200,
      altitude: 10,
      altitudeAccuracy: 5,
      heading: 0,
      speed: 3,
      toJSON() {
        return this;
      },
    };
    expect(isValidReading(coords, null)).toBe(false);
  });

  it("rejects subsequent point with accuracy > 35 (after 15s)", () => {
    const lastPoint = makePoint({
      lat: 51.5,
      lon: -0.1,
      timestamp: Date.now() - 20000,
    });
    const coords = {
      latitude: 51.501,
      longitude: -0.1,
      accuracy: 40,
      altitude: 10,
      altitudeAccuracy: 5,
      heading: 0,
      speed: 3,
      toJSON() {
        return this;
      },
    };
    expect(isValidReading(coords, lastPoint, 20)).toBe(false);
  });

  it("allows accuracy up to 50 in first 15 seconds", () => {
    const lastPoint = makePoint({
      lat: 51.5,
      lon: -0.1,
      timestamp: Date.now() - 10000,
    });
    const coords = {
      latitude: 51.501,
      longitude: -0.1,
      accuracy: 45,
      altitude: 10,
      altitudeAccuracy: 5,
      heading: 0,
      speed: 3,
      toJSON() {
        return this;
      },
    };
    expect(isValidReading(coords, lastPoint, 10)).toBe(true);
  });

  it("rejects readings with implied speed > 12 m/s", () => {
    const lastPoint = makePoint({
      lat: 51.5,
      lon: -0.1,
      timestamp: Date.now() - 1000,
    });
    // 0.01 degrees lat ≈ 1111m in 1 second → speed ≈ 1111 m/s
    const coords = {
      latitude: 51.51,
      longitude: -0.1,
      accuracy: 5,
      altitude: 10,
      altitudeAccuracy: 5,
      heading: 0,
      speed: 3,
      toJSON() {
        return this;
      },
    };
    expect(isValidReading(coords, lastPoint)).toBe(false);
  });

  it("rejects readings with distance < 1m", () => {
    const lastPoint = makePoint({
      lat: 51.5,
      lon: -0.1,
      timestamp: Date.now() - 5000,
    });
    // Essentially same point
    const coords = {
      latitude: 51.5,
      longitude: -0.1,
      accuracy: 5,
      altitude: 10,
      altitudeAccuracy: 5,
      heading: 0,
      speed: 3,
      toJSON() {
        return this;
      },
    };
    expect(isValidReading(coords, lastPoint)).toBe(false);
  });

  it("rejects if timeDiff <= 0", () => {
    const lastPoint = makePoint({
      lat: 51.5,
      lon: -0.1,
      timestamp: Date.now() + 5000,
    });
    const coords = {
      latitude: 51.501,
      longitude: -0.1,
      accuracy: 5,
      altitude: 10,
      altitudeAccuracy: 5,
      heading: 0,
      speed: 3,
      toJSON() {
        return this;
      },
    };
    expect(isValidReading(coords, lastPoint)).toBe(false);
  });

  it("accepts a valid subsequent reading", () => {
    // ~111m over 30 seconds = ~3.7 m/s (walking/jogging)
    const lastPoint = makePoint({
      lat: 51.5,
      lon: -0.1,
      timestamp: Date.now() - 30000,
    });
    const coords = {
      latitude: 51.501,
      longitude: -0.1,
      accuracy: 10,
      altitude: 10,
      altitudeAccuracy: 5,
      heading: 0,
      speed: 3,
      toJSON() {
        return this;
      },
    };
    expect(isValidReading(coords, lastPoint, 30)).toBe(true);
  });
});

// ── calculatePace ────────────────────────────

describe("calculatePace", () => {
  it("returns '--:--' for distance < 10m", () => {
    expect(calculatePace(5, 100)).toBe("--:--");
  });

  it("returns correct pace for 1km in 5 minutes", () => {
    // 300s / 1000m * 1000 = 300 s/km = 5:00
    expect(calculatePace(1000, 300)).toBe("5:00");
  });

  it("returns correct pace for 5km in 25 minutes", () => {
    // 1500s / 5000m * 1000 = 300 s/km = 5:00
    expect(calculatePace(5000, 1500)).toBe("5:00");
  });

  it("pads seconds with leading zero", () => {
    // 1000m in 365s → 365 s/km → 6:05
    expect(calculatePace(1000, 365)).toBe("6:05");
  });

  it("handles fast pace", () => {
    // 1000m in 180s → 3:00
    expect(calculatePace(1000, 180)).toBe("3:00");
  });

  it("handles slow pace", () => {
    // 1000m in 600s → 10:00
    expect(calculatePace(1000, 600)).toBe("10:00");
  });
});

// ── paceAsNumber ─────────────────────────────

describe("paceAsNumber", () => {
  it("returns 0 for distance < 10m", () => {
    expect(paceAsNumber(5, 100)).toBe(0);
  });

  it("returns seconds per km for 1km in 5 minutes", () => {
    // 300s / 1000m * 1000 = 300
    expect(paceAsNumber(1000, 300)).toBe(300);
  });

  it("returns correct value for 5km in 25 minutes", () => {
    expect(paceAsNumber(5000, 1500)).toBe(300);
  });

  it("returns fractional seconds", () => {
    // 1000m in 330s → 330 s/km
    expect(paceAsNumber(1000, 330)).toBeCloseTo(330, 5);
  });
});

// ── calculateSplits ─────────────────────

describe("calculateSplits", () => {
  it("returns empty for fewer than 2 points", () => {
    expect(calculateSplits([])).toEqual([]);
    expect(calculateSplits([makePoint()])).toEqual([]);
  });

  it("produces correct paceSeconds using paceAsNumber", () => {
    // Create points spanning slightly over 1km along a straight line
    // 0.001 deg lat ≈ 111m, so ~0.009 deg ≈ 1000m
    const baseTime = Date.now();
    const points: GPSPoint[] = [];
    for (let i = 0; i <= 10; i++) {
      points.push(
        makePoint({
          lat: 51.5 + i * 0.001,
          lon: -0.1,
          altitude: 10,
          timestamp: baseTime + i * 30000, // 30s between each point
        })
      );
    }
    const splits = calculateSplits(points);
    if (splits.length > 0) {
      const split = splits[0];
      // paceSeconds should equal paceAsNumber(1000, split.time)
      expect(split.paceSeconds).toBeCloseTo(paceAsNumber(1000, split.time), 5);
      // paceSeconds should NOT equal split.time (the old bug)
      // For 1km splits they happen to be equal via paceAsNumber, which is fine
      expect(split.paceSeconds).toBeGreaterThan(0);
    }
  });

  it("distributes time across km boundaries when one segment crosses several (no 0:00 splits)", () => {
    // GPS dropout → reappear: a single segment jumps ~3km over 300s. Each km
    // boundary should get its proportional share (~100s), NOT the whole time on
    // km1 and 0:00 (0:00/km pace) on km2/km3 — the regression this fixes.
    const baseTime = 1_700_000_000_000;
    const points: GPSPoint[] = [
      makePoint({ lat: 51.5, lon: -0.1, altitude: 10, timestamp: baseTime }),
      makePoint({
        lat: 51.5 + 0.027, // ~3000m north
        lon: -0.1,
        altitude: 10,
        timestamp: baseTime + 300000, // 300s later
      }),
    ];
    const splits = calculateSplits(points);
    expect(splits.length).toBeGreaterThanOrEqual(3);
    for (const s of splits) {
      expect(s.time).toBeGreaterThan(0); // no zero-duration split
      expect(s.paceSeconds).toBeGreaterThan(0);
    }
    // Each km ≈ 100s (300s over ~3km); generous tolerance for haversine.
    expect(splits[0].time).toBeGreaterThan(50);
    expect(splits[0].time).toBeLessThan(150);
  });
});

describe("calculateSplits — the lap, and splitsForDisplay", () => {
  /* ~5 km due north at a steady 5:00/km. 0.0089983° lat ≈ 1000 m, so five
     of those is ~5 km; 300 s per km keeps the pace exactly 5:00 whichever
     way the run is cut. */
  const baseTime = 1_700_000_000_000;
  const points: GPSPoint[] = Array.from({ length: 51 }, (_, i) =>
    makePoint({
      lat: 51.5 + i * 0.00089983, // ~100 m steps
      lon: -0.1,
      altitude: 10,
      timestamp: baseTime + i * 30000, // 30 s per 100 m = 5:00/km
    })
  );

  it("cuts on the lap it is given — miles are FEWER, longer rows", () => {
    const km = calculateSplits(points, 1000);
    const mi = calculateSplits(points, METRES_PER_MILE);
    expect(km.length).toBe(5);
    expect(mi.length).toBe(3); // 5 km is 3.1 miles
    // A mile lap takes ~1.61× as long to cover at the same pace.
    expect(mi[0].time / km[0].time).toBeCloseTo(1.609, 1);
  });

  it("paceSeconds stays SECONDS PER KM whichever lap is used", () => {
    /* The property that lets the display convert. `paceAsNumber`
       normalises to 1000 m, so the same 5:00/km effort reads 300 from both
       cuts — if a mile lap reported ~483 instead, every downstream
       comparison (fastest split, colour banding, avg) would be against a
       different scale depending on the reader's preference. */
    const km = calculateSplits(points, 1000);
    const mi = calculateSplits(points, METRES_PER_MILE);
    expect(km[0].paceSeconds).toBeCloseTo(300, 0);
    expect(mi[0].paceSeconds).toBeCloseTo(300, 0);
  });

  it("the lap ordinal counts laps, not kilometres", () => {
    const mi = calculateSplits(points, METRES_PER_MILE);
    expect(mi.map((s) => s.km)).toEqual([1, 2, 3]);
  });

  it("splitsForDisplay recomputes mile laps, and says so", () => {
    const stored = calculateSplits(points, 1000);
    const metric = splitsForDisplay("km", points, stored);
    expect(metric.lapUnit).toBe("km");
    expect(metric.splits).toBe(stored); // untouched — no needless recompute

    const imperial = splitsForDisplay("mi", points, stored);
    expect(imperial.lapUnit).toBe("mi");
    expect(imperial.splits.length).toBe(3);
  });

  it("falls back to the stored kilometre rows when there is no trace", () => {
    /* A treadmill or manual run has no points to recut, and there is no
       honest way to turn kilometre rows into mile ones. It must report
       lapUnit "km" so the chart labels what it actually shows rather than
       relabelling rows nobody recut. */
    const stored = calculateSplits(points, 1000);
    const noTrace = splitsForDisplay("mi", [], stored);
    expect(noTrace.lapUnit).toBe("km");
    expect(noTrace.splits).toBe(stored);
    expect(splitsForDisplay("mi", null, stored).lapUnit).toBe("km");
    // A single point is not a trace either.
    expect(splitsForDisplay("mi", [points[0]], stored).lapUnit).toBe("km");
  });

  it("survives a missing stored array", () => {
    expect(splitsForDisplay("km", points, null).splits).toEqual([]);
    expect(splitsForDisplay("km", points, undefined).splits).toEqual([]);
  });
});

// ── totalElevationGain ───────────────────────

/** The rule totalElevationGain used until 2026-10: any rise over 2 m
 *  between two consecutive fixes, counted in full. Kept here only so the
 *  tests below can show what it got wrong on the same tracks. */
function perFixRule(points: GPSPoint[]): number {
  let gain = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1].altitude;
    const b = points[i].altitude;
    if (a != null && b != null && b - a > 2) gain += b - a;
  }
  return gain;
}

/** Deterministic uniform noise in [-amp, amp]. */
function jitter(seed: number, amp: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1) * amp;
  };
}

/** A track of the given altitudes, one fix a second. */
function altitudeTrack(altitudes: (number | null)[]): GPSPoint[] {
  return altitudes.map((altitude, i) =>
    makePoint({ lat: i * 0.0001, lon: 0, altitude, timestamp: i * 1000 })
  );
}

/** Level, then a steady climb of `rise` metres over `climbFixes` fixes,
 *  then level again — 0.5 m a fix for 30 m over 60 is a ~17% hill at a
 *  jog, already steeper than most. */
function hill(
  rise: number,
  climbFixes: number,
  flatFixes: number,
  noise?: () => number
): number[] {
  const alts: number[] = [];
  for (let i = 0; i < flatFixes; i++) alts.push(100);
  for (let i = 1; i <= climbFixes; i++)
    alts.push(100 + (rise * i) / climbFixes);
  for (let i = 0; i < flatFixes; i++) alts.push(100 + rise);
  return noise ? alts.map((a) => a + noise()) : alts;
}

describe("totalElevationGain", () => {
  it("returns 0 for empty array", () => {
    expect(totalElevationGain([])).toBe(0);
  });

  it("returns 0 for single point", () => {
    expect(totalElevationGain([makePoint()])).toBe(0);
  });

  it("counts a smooth, gentle climb in full — the per-fix rule counted none of it", () => {
    /* UNDER-count. A real climb arrives in small steps: half a metre a
       fix here, and on a 2% grade about 6 cm. No single step clears 2 m,
       so on a smooth (barometric) altitude track the old rule read a 30 m
       hill as flat. */
    const track = altitudeTrack(hill(30, 60, 30));
    expect(perFixRule(track)).toBe(0);
    expect(totalElevationGain(track)).toBe(30);
  });

  it("reads a flat track with ±2–4 m jitter as next to no climb — the per-fix rule read hundreds of metres", () => {
    /* OVER-count. Every fix-to-fix rise over 2 m counted in full, so ten
       flat minutes of jitter added up to a mountain. 20 seeds per
       amplitude, ten minutes at a fix a second each. */
    for (const amp of [2, 3, 4]) {
      const gains: number[] = [];
      for (let seed = 1; seed <= 20; seed++) {
        const noise = jitter(seed * 7 + amp, amp);
        const track = altitudeTrack(
          Array.from({ length: 600 }, () => 100 + noise())
        );
        expect(perFixRule(track)).toBeGreaterThan(100);
        gains.push(totalElevationGain(track));
      }
      /* Measured: 0 m on every seed at ±2 and ±3 m; at ±4 m a mean of
         2.3 m and a worst of 6 m. The per-fix rule: 166–730 m. */
      const mean = gains.reduce((a, b) => a + b, 0) / gains.length;
      expect(mean).toBeLessThanOrEqual(amp === 4 ? 3 : 0.5);
      expect(Math.max(...gains)).toBeLessThanOrEqual(amp === 4 ? 8 : 1);
    }
  });

  it("reads a steady 30 m climb with ±3 m noise as about 30 m", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const track = altitudeTrack(hill(30, 120, 60, jitter(seed, 3)));
      const gain = totalElevationGain(track);
      // Measured 31–32 m on these seeds; the per-fix rule read 139–231 m.
      expect(gain).toBeGreaterThanOrEqual(29);
      expect(gain).toBeLessThanOrEqual(33);
      expect(perFixRule(track)).toBeGreaterThan(100);
    }
  });

  it("counts a descent as loss, not gain", () => {
    const down = altitudeTrack(hill(30, 60, 30).reverse());
    expect(totalElevationGain(down)).toBe(0);
    const { loss } = climbBySegment(down);
    expect(loss.reduce((a, b) => a + b, 0)).toBeCloseTo(30, 6);
  });

  it("ignores a rise and fall under the 3 m threshold, and counts one over it in full", () => {
    // Level, up h metres, level, back down, level.
    const bump = (h: number) => [
      ...hill(h, 30, 30),
      ...hill(h, 30, 0).reverse(),
      ...Array.from({ length: 30 }, () => 100),
    ];
    expect(totalElevationGain(altitudeTrack(bump(2)))).toBe(0);
    /* The whole 5 m from the low point, not 5 − 3: a threshold that shaved
       itself off every hill would under-count every hilly run. */
    expect(totalElevationGain(altitudeTrack(bump(5)))).toBe(5);
  });

  it("reads past fixes with no altitude instead of breaking the climb at them", () => {
    /* A source that reports altitude on alternate fixes. The per-fix rule
       needed two consecutive altitudes, so it saw no climb at all. */
    const alts = hill(30, 60, 30);
    const patchy = altitudeTrack(alts.map((a, i) => (i % 2 ? null : a)));
    expect(perFixRule(patchy)).toBe(0);
    expect(totalElevationGain(patchy)).toBe(30);
  });

  it("returns whole metres", () => {
    expect(
      Number.isInteger(
        totalElevationGain(altitudeTrack(hill(12.6, 40, 30, jitter(9, 1))))
      )
    ).toBe(true);
  });
});

describe("climbBySegment and the splits' elevation", () => {
  it("is non-negative per segment and adds up to the total", () => {
    const track = altitudeTrack([
      ...hill(20, 50, 20, jitter(3, 2)),
      ...hill(20, 50, 20, jitter(4, 2)).reverse(),
    ]);
    const { gain, loss } = climbBySegment(track);
    expect(gain.every((g) => g >= 0) && loss.every((l) => l >= 0)).toBe(true);
    expect(gain[0]).toBe(0);
    expect(totalElevationGain(track)).toBe(
      Math.round(gain.reduce((a, b) => a + b, 0))
    );
  });

  it("puts a climb in the split it happened in, and the splits add up to the run", () => {
    /* Three kilometres at 5:00/km, a fix a second (3.33 m apart): level,
       a 20 m climb across the second kilometre, level. Smoothing spreads
       the corners of the climb over a few fixes either side, a few
       centimetres into the neighbouring kilometres. */
    const alts = Array.from({ length: 910 }, (_, i) =>
      i <= 300 ? 100 : i >= 600 ? 120 : 100 + (20 * (i - 300)) / 300
    );
    const track = alts.map((altitude, i) =>
      makePoint({
        lat: (i * (10 / 3)) / M_PER_DEG,
        lon: 0,
        altitude,
        timestamp: i * 1000,
      })
    );
    const splits = calculateSplits(track);
    expect(splits.map((s) => s.elevationGain)).toEqual([0, 20, 0]);
    expect(splits.reduce((a, s) => a + s.elevationGain, 0)).toBe(
      totalElevationGain(track)
    );
    expect(splits.every((s) => s.elevationLoss === 0)).toBe(true);
  });
});

// ── totalDistance ─────────────────────────────

describe("totalDistance", () => {
  it("returns 0 for empty array", () => {
    expect(totalDistance([])).toBe(0);
  });

  it("returns 0 for single point", () => {
    expect(totalDistance([makePoint()])).toBe(0);
  });

  it("sums distances between consecutive points", () => {
    // Three points in a line: each ~111m apart (0.001 deg lat)
    const points: GPSPoint[] = [
      makePoint({ lat: 51.5, lon: -0.1 }),
      makePoint({ lat: 51.501, lon: -0.1 }),
      makePoint({ lat: 51.502, lon: -0.1 }),
    ];
    const dist = totalDistance(points);
    // Should be approximately 222m (2 * ~111m)
    expect(dist).toBeGreaterThan(200);
    expect(dist).toBeLessThan(250);
  });

  it("accumulates distance even if path doubles back", () => {
    const points: GPSPoint[] = [
      makePoint({ lat: 51.5, lon: -0.1 }),
      makePoint({ lat: 51.501, lon: -0.1 }),
      makePoint({ lat: 51.5, lon: -0.1 }),
    ];
    const dist = totalDistance(points);
    // Should be ~222m (111m out + 111m back)
    expect(dist).toBeGreaterThan(200);
    expect(dist).toBeLessThan(250);
  });
});

// ── estimateRunCalories ──────────────────────

describe("estimateRunCalories", () => {
  it("returns reasonable estimate for 5km at 70kg", () => {
    // 5 * 70 * 1.036 = 362.6 → 363
    const cal = estimateRunCalories(5000, 70);
    expect(cal).toBe(363);
  });

  it("returns 0 for 0 distance", () => {
    expect(estimateRunCalories(0, 70)).toBe(0);
  });

  it("scales linearly with distance", () => {
    const cal5 = estimateRunCalories(5000, 70);
    const cal10 = estimateRunCalories(10000, 70);
    // Allow ±1 for rounding: Math.round can differ by 1
    expect(Math.abs(cal10 - cal5 * 2)).toBeLessThanOrEqual(1);
  });

  it("scales linearly with weight", () => {
    const cal70 = estimateRunCalories(5000, 70);
    const cal80 = estimateRunCalories(5000, 80);
    expect(cal80 / cal70).toBeCloseTo(80 / 70, 1);
  });

  it("returns reasonable estimate for a marathon at 80kg", () => {
    // 42.195 * 80 * 1.036 ≈ 3496
    const cal = estimateRunCalories(42195, 80);
    expect(cal).toBeGreaterThan(3400);
    expect(cal).toBeLessThan(3600);
  });
});

// ── KalmanFilter ─────────────────────────────

describe("KalmanFilter", () => {
  it("returns the first reading unchanged", () => {
    const kf = new KalmanFilter();
    const result = kf.process(51.5, -0.1, 10);
    expect(result.lat).toBe(51.5);
    expect(result.lon).toBe(-0.1);
  });

  it("smooths subsequent noisy readings toward the previous estimate", () => {
    const kf = new KalmanFilter();
    kf.process(51.5, -0.1, 10);
    // Second reading with some noise
    const result = kf.process(51.6, -0.2, 10);
    // Should be between the first and second reading (smoothed)
    expect(result.lat).toBeGreaterThan(51.5);
    expect(result.lat).toBeLessThan(51.6);
    expect(result.lon).toBeGreaterThan(-0.2);
    expect(result.lon).toBeLessThan(-0.1);
  });

  it("converges toward consistent readings", () => {
    const kf = new KalmanFilter();
    kf.process(51.5, -0.1, 10);
    // Feed the same point multiple times
    let result = { lat: 0, lon: 0 };
    for (let i = 0; i < 20; i++) {
      result = kf.process(51.6, -0.2, 10);
    }
    // Should converge close to 51.6, -0.2
    expect(result.lat).toBeCloseTo(51.6, 2);
    expect(result.lon).toBeCloseTo(-0.2, 2);
  });

  it("trusts high-accuracy readings more", () => {
    const kf1 = new KalmanFilter();
    kf1.process(51.5, -0.1, 10);
    const highAccuracy = kf1.process(51.6, -0.2, 1); // very accurate

    const kf2 = new KalmanFilter();
    kf2.process(51.5, -0.1, 10);
    const lowAccuracy = kf2.process(51.6, -0.2, 100); // very inaccurate

    // High accuracy reading should pull the estimate closer to 51.6
    expect(highAccuracy.lat).toBeGreaterThan(lowAccuracy.lat);
  });

  it("reset allows re-initialization", () => {
    const kf = new KalmanFilter();
    kf.process(51.5, -0.1, 10);
    kf.process(51.6, -0.2, 10);
    kf.reset();
    // After reset, next reading should be returned as-is
    const result = kf.process(52.0, 0.0, 10);
    expect(result.lat).toBe(52.0);
    expect(result.lon).toBe(0.0);
  });
});

describe("rollingPaceSeconds — the rolling window", () => {
  /* 1° latitude ≈ 111,320m. So 0.001° ≈ 111.32m. We synthesise points
   * with lat increments and timestamps to control distance + time
   * within the rolling window. */
  const baseTs = 1_700_000_000_000;

  function pointAt(lat: number, secondsOffset: number): GPSPoint {
    return makePoint({
      lat,
      lon: 0,
      timestamp: baseTs + secondsOffset * 1000,
    });
  }

  /* These cases were written against a `rollingPace` string formatter that
     was deleted when the live screen went unit-aware (a preformatted
     per-KILOMETRE label is useless to a miles reader). The window logic
     they cover is the same function's, so they are ported to the number
     form rather than deleted with it — "--:--" becomes null, "5:00"
     becomes 300. */
  it("returns null for fewer than two points", () => {
    expect(rollingPaceSeconds([])).toBeNull();
    expect(rollingPaceSeconds([pointAt(0, 0)])).toBeNull();
  });

  it("returns null when the rolling distance is below 10m", () => {
    /* Two points 1m apart over 30s — under the distance floor. */
    const a = pointAt(0, 0);
    const b = pointAt(0.0000089, 30); // ~1m north
    expect(rollingPaceSeconds([a, b], 30)).toBeNull();
  });

  it("computes a rolling pace from points within the window", () => {
    /* Two points 100m apart, 30s apart → pace 5:00/km. */
    const a = pointAt(0, 0);
    const b = pointAt(0.0008983, 30); // ~100m north
    expect(rollingPaceSeconds([a, b], 30)).toBeCloseTo(300, 0);
  });

  it("only sums points within the window — older points are ignored", () => {
    /* First point is 60s ago (outside a 30s window). Within the
       window: two points 100m apart over 20s → pace 200s/km = 3:20/km. */
    const old = pointAt(0, 0);
    const start = pointAt(0, 40); // 20s before the latest at t=60
    const end = pointAt(0.0008983, 60);
    expect(rollingPaceSeconds([old, start, end], 30)).toBeCloseTo(200, 0);
  });

  it("returns null when only the latest point falls inside the window", () => {
    /* All older points outside → only the latest survives → can't
       compute pace from a single point. */
    const a = pointAt(0, 0);
    const b = pointAt(0.001, 100); // 100s later, well outside a 30s window
    expect(rollingPaceSeconds([a, b], 30)).toBeNull();
  });

  describe("rollingPaceSeconds — the number behind the label", () => {
    it("returns null, never a number, when there is nothing to judge", () => {
      /* The audio pace alert branches on this. `0` would read as an
         absurdly fast pace and fire an "ahead of target" alert from a
         standing start; the previous call-site expression did exactly
         that (`distance > 0 ? … : 0`). */
      expect(rollingPaceSeconds([])).toBeNull();
      expect(rollingPaceSeconds([pointAt(0, 0)])).toBeNull();
      const a = pointAt(0, 0);
      const b = pointAt(0.0000089, 30); // ~1m — under the distance floor
      expect(rollingPaceSeconds([a, b], 30)).toBeNull();
    });

    it("feeds paceMinSec, which is where the unit is applied now", () => {
      /* Replaces an "agrees with the formatted rollingPace" pairing that
         died with that formatter. The equivalent claim today is that the
         number reaches the shared formatter and converts there — 300 s/km
         reads 5:00 to a metric runner and 8:03 to an imperial one, from
         the SAME reading. */
      const a = pointAt(0, 0);
      const b = pointAt(0.0008983, 30); // ~100m in 30s → 300 s/km
      const secs = rollingPaceSeconds([a, b], 30)!;
      expect(secs).toBeCloseTo(300, 0);
      expect(paceMinSec(secs, "km")).toBe("5:00");
      expect(paceMinSec(secs, "mi")).toBe("8:03");
    });

    it("a warm-up does not poison the reading — the pace-alert defect", () => {
      /* The scenario the alert kept getting wrong. Ten minutes of 7:00/km
         warm-up, then on-target 5:00/km work.

         Whole-run average after one on-pace minute is still ~6:50/km —
         past the alert's 15 s/km threshold against a 300 s/km target, and
         it stays past it for most of the session, so the runner is told
         they are behind every 30 seconds while running exactly on pace.
         The rolling window reports the work, which is the thing being
         judged. */
      const points: GPSPoint[] = [];
      let lat = 0;
      let t = 0;
      // Warm-up: 100m per 42s = 7:00/km, for 10 minutes.
      for (let i = 0; i < 14; i += 1) {
        points.push(pointAt(lat, t));
        lat += 0.0008983;
        t += 42;
      }
      // Work: 100m per 30s = 5:00/km, for one minute.
      for (let i = 0; i < 2; i += 1) {
        points.push(pointAt(lat, t));
        lat += 0.0008983;
        t += 30;
      }
      points.push(pointAt(lat, t));

      const totalM = 111320 * lat;
      const wholeRunAvg = (t / totalM) * 1000;
      const rolling = rollingPaceSeconds(points, 30)!;

      // The average is far enough off target to trip a 15 s/km alert…
      expect(Math.abs(wholeRunAvg - 300)).toBeGreaterThan(15);
      // …while the rolling read is on target and would not.
      expect(Math.abs(rolling - 300)).toBeLessThanOrEqual(15);
    });
  });
});

describe("toGPX", () => {
  const pts: GPSPoint[] = [
    makePoint({ lat: 51.5, lon: -0.1, timestamp: 0, altitude: 10 }),
    makePoint({ lat: 51.51, lon: -0.11, timestamp: 1000, altitude: 12 }),
  ];

  it("escapes XML metacharacters in the run name (no invalid GPX)", () => {
    const gpx = toGPX(pts, `Tom & Jerry's <fast> run`);
    expect(gpx).toContain(
      "<name>Tom &amp; Jerry&apos;s &lt;fast&gt; run</name>"
    );
    // raw, unescaped specials must not leak into the markup
    expect(gpx).not.toContain("& Jerry");
    expect(gpx).not.toContain("<fast>");
  });

  it("emits lat/lon in order with metre elevation and ISO time", () => {
    const gpx = toGPX(pts, "Morning run");
    expect(gpx).toContain('<trkpt lat="51.5" lon="-0.1">');
    expect(gpx).toContain("<ele>10.0</ele>");
    expect(gpx).toContain("<time>1970-01-01T00:00:00.000Z</time>");
  });
});

// ── detectBestEfforts ────────────────────────
// Sliding-window fastest-segment detector (1K/5K/10K) used by RunSummary's PR
// surface. Previously untested. Builds paths along a meridian (lon 0) so each
// segment's metres come from the same haversine the function uses.

/** N points stepping `latStep`° north every `dtSec` seconds (constant pace). */
function meridianPath(n: number, latStep: number, dtSec: number): GPSPoint[] {
  const pts: GPSPoint[] = [];
  for (let i = 0; i < n; i++) {
    pts.push(
      makePoint({ lat: i * latStep, lon: 0, timestamp: i * dtSec * 1000 })
    );
  }
  return pts;
}

describe("detectBestEfforts", () => {
  it("returns nothing when the run is shorter than the smallest target", () => {
    const pts = meridianPath(5, 0.001, 10); // ~445m
    expect(detectBestEfforts(pts, 500)).toEqual([]);
  });

  it("returns [] for an empty track even if the param claims distance", () => {
    expect(detectBestEfforts([], 5000)).toEqual([]);
  });

  it("detects a 1K effort on a run just past 1km, with a sane time", () => {
    // 12 points × ~111m ≈ 1.2km at 10s/segment (constant pace), ~110s total.
    const pts = meridianPath(12, 0.001, 10);
    const dist = totalDistance(pts);
    expect(dist).toBeGreaterThan(1000);

    const efforts = detectBestEfforts(pts, dist);
    expect(efforts.map((e) => e.label)).toEqual(["1K"]);
    expect(efforts[0].distance).toBe(1000);
    // The fastest 1000m window is ~82% of the ~110s total — comfortably in band.
    expect(efforts[0].time).toBeGreaterThan(60);
    expect(efforts[0].time).toBeLessThanOrEqual(110);
  });

  it("does not report a distance the param claims but the GPS track never covers", () => {
    // Param says 6km, but the track is only ~1.2km — the inner accDist>=target
    // gate for 5K is never met, so only 1K comes back (guards the two-gate logic).
    const pts = meridianPath(12, 0.001, 10);
    expect(detectBestEfforts(pts, 6000).map((e) => e.label)).toEqual(["1K"]);
  });

  it("reports 1K and 5K (not 10K) on a ~6km track", () => {
    const pts = meridianPath(55, 0.001, 10); // ~6km
    const dist = totalDistance(pts);
    expect(dist).toBeGreaterThan(5000);
    expect(dist).toBeLessThan(10000);

    const labels = detectBestEfforts(pts, dist).map((e) => e.label);
    expect(labels).toContain("1K");
    expect(labels).toContain("5K");
    expect(labels).not.toContain("10K");
  });

  it("picks the FASTEST 1K window, not the average (the whole point of a best effort)", () => {
    // ~1.2km slow (20s/seg) followed by a continuous ~1.2km fast block (4s/seg).
    // The best 1K must be drawn from the fast block, far below any slow window.
    const slow = meridianPath(12, 0.001, 20); // i=0..11, lat 0..0.011, t 0..220s
    const t0 = 11 * 20 * 1000;
    const fast: GPSPoint[] = [];
    for (let i = 1; i <= 12; i++) {
      fast.push(
        makePoint({
          lat: (11 + i) * 0.001,
          lon: 0,
          timestamp: t0 + i * 4 * 1000,
        })
      );
    }
    const pts = [...slow, ...fast];

    const oneK = detectBestEfforts(pts, totalDistance(pts)).find(
      (e) => e.label === "1K"
    );
    expect(oneK).toBeDefined();
    // Fast block ≈ 111m/4s → 1000m ≈ 36s; the slow-window 1K would be ~180s.
    expect(oneK!.time).toBeLessThan(60);
  });
});

// ── Moving time: pauses are not running ──────
// A pause (manual or auto) and the start countdown stop the run's clock;
// useGPS records nothing while it is stopped and stamps every later point
// with the time held (`pausedMs`). Splits, best efforts, the live pace and
// the ghost all read the MOVING clock, as `duration` always has — Strava's
// splits and best efforts do the same. `trace()` builds that shape.

describe("calculateSplits — moving time", () => {
  it("leaves a 5-minute stop inside km 2 out of km 2's time", () => {
    /* 5:00/km, a point every 100 m; the clock stops for 300 s at 1.4 km.
       Timed on the wall clock (the old code) km 2 read 10:00. */
    const pts = trace(32, 100, 30, { 15: 300 }); // 3.1 km
    const splits = calculateSplits(pts);
    expect(splits.map((s) => Math.round(s.time))).toEqual([300, 300, 300]);
    expect(splits[1].pace).toBe("5:00");
    // The splits add up to the moving time, which is the run's duration.
    expect(splits.reduce((a, s) => a + s.time, 0)).toBeCloseTo(
      movingSecondsBetween(pts[0], pts[30]),
      3
    );
  });

  it("reads a trace without pausedMs on the wall clock, as before — saved runs do not move", () => {
    const pts = trace(32, 100, 30);
    expect(pts.every((p) => p.pausedMs === undefined)).toBe(true);
    expect(calculateSplits(pts).map((s) => Math.round(s.time))).toEqual([
      300, 300, 300,
    ]);
    expect(movingClockMs(pts[7])).toBe(pts[7].timestamp);
  });

  it("survives the saved trace being thinned — mile splits are recut from it", () => {
    /* `pausedMs` is cumulative, so any two points left after sampleRoute
       still subtract to the right moving time. An imperial reader's mile
       splits are recomputed from the SAVED (sampled) trace. */
    const pts = trace(1010, 5, 1.5, { 430: 600 }); // 5 km, 5:00/km, a 10-minute stop in km 3
    const thinned = sampleRoute(pts, 120);
    expect(thinned.length).toBeLessThan(pts.length);
    const full = calculateSplits(pts);
    const fromSaved = calculateSplits(thinned);
    expect(fromSaved).toHaveLength(full.length);
    fromSaved.forEach((s, i) => expect(s.time).toBeCloseTo(full[i].time, 0));
    expect(Math.max(...fromSaved.map((s) => s.time))).toBeLessThan(310);
  });

  it("never times a split negative when the phone's clock steps back", () => {
    const pts = trace(32, 100, 30);
    // The fix at the 1 km mark reads 400 s early: on the raw clock, km 1 took -100 s.
    pts[10] = { ...pts[10], timestamp: pts[10].timestamp - 400_000 };
    for (const s of calculateSplits(pts))
      expect(s.time).toBeGreaterThanOrEqual(0);
  });
});

describe("detectBestEfforts — moving time", () => {
  it("never puts a pause's time into a best 1K", () => {
    /* 1.1 km at 5:00/km with a 5-minute stop at 0.5 km, so EVERY 1 km
       stretch contains the stop. On the wall clock (the old code) the
       best 1K was 10:00. */
    const pts = trace(12, 100, 30, { 6: 300 });
    const oneK = detectBestEfforts(pts, totalDistance(pts)).find(
      (e) => e.label === "1K"
    );
    // 10 or 11 of the 100 m steps, whichever first covers 1 km: 5:00 or 5:30.
    expect(oneK!.time).toBeGreaterThanOrEqual(300 - 1e-6);
    expect(oneK!.time).toBeLessThanOrEqual(330 + 1e-6);
  });

  it("does not let a line drawn across a pause carry a 1K", () => {
    /* Paused, given a lift 2 km up the road, resumed. Nothing was recorded
       while held, so the next point is 2 km from the last — with the
       paused time taken out of the clock that line alone would be a 1K in
       two seconds. Only what the two clock-running seconds either side of
       the stop could cover (MAX_PLAUSIBLE_SPEED_MPS) is credited. On the
       wall clock (the old code) that same line made the best 1K 10:02. */
    const pts = trace(12, 100, 30, { 6: 600 }, { 6: 2000 }, { 6: 2 });
    const oneK = detectBestEfforts(pts, totalDistance(pts)).find(
      (e) => e.label === "1K"
    );
    expect(oneK).toBeDefined();
    expect(oneK!.time).toBeGreaterThan(280);
    expect(oneK!.time).toBeLessThan(310);
    // …and the 2 km is not distance: 1.0 km run plus at most 2 s × 12 m/s.
    expect(totalDistance(pts)).toBeCloseTo(
      1000 + 2 * MAX_PLAUSIBLE_SPEED_MPS,
      6
    );
    expect(calculateSplits(pts).length).toBeLessThanOrEqual(1);
  });

  it("finds the same efforts on a trace with no holds as it always did", () => {
    const pts = meridianPath(55, 0.001, 10);
    const labels = detectBestEfforts(pts, totalDistance(pts)).map(
      (e) => e.label
    );
    expect(labels).toEqual(["1K", "5K"]);
  });
});

describe("segmentMetres and the moving clock", () => {
  it("is the straight line when no hold falls between the points", () => {
    const [a, b] = trace(2, 250, 60);
    expect(segmentMetres(a, b)).toBeCloseTo(250, 6);
  });

  it("caps the line across a hold at what the running part of the gap could cover", () => {
    // 3 s of clock-running time either side of a 10-minute hold, 900 m apart.
    const [a, b] = trace(2, 900, 3, { 1: 600 });
    expect(movingSecondsBetween(a, b)).toBeCloseTo(3, 6);
    expect(segmentMetres(a, b)).toBeCloseTo(3 * MAX_PLAUSIBLE_SPEED_MPS, 6);
    // A runner who resumed where they stopped keeps every metre.
    const [c, d] = trace(2, 8, 3, { 1: 600 });
    expect(segmentMetres(c, d)).toBeCloseTo(8, 6);
  });

  it("reads a missing or malformed pausedMs as nothing held", () => {
    const p = makePoint({ timestamp: 5000 });
    expect(movingClockMs(p)).toBe(5000);
    expect(movingClockMs({ ...p, pausedMs: "300" as unknown as number })).toBe(
      5000
    );
    expect(movingClockMs({ ...p, pausedMs: NaN })).toBe(5000);
    expect(movingClockMs({ ...p, pausedMs: 1200 })).toBe(3800);
  });
});

describe("rollingPaceSeconds — moving time", () => {
  it("reads the running pace straight after a wait, not the wait", () => {
    /* A fix a second at 5:00/km for a minute, 20 s stopped at a crossing,
       then 5 s running. On the wall clock the 30 s window held 10 s of
       running and 20 s of standing: 15:00/km, and the pace alert told the
       runner they were behind as they set off. */
    const pts = trace(67, 10 / 3, 1, { 61: 20 });
    expect(rollingPaceSeconds(pts, 30)).toBeCloseTo(300, 0);
  });
});

describe("routeTimeAtDistance — moving time", () => {
  it("leaves the original run's stops out of the ghost, as the live timer does", () => {
    // 222 m, a 2-minute stop halfway; the live side is timer.elapsed.
    const route = trace(3, 111, 60, { 2: 120 });
    expect(routeTimeAtDistance(route, 222)).toBeCloseTo(120, 0);
    expect(routeTimeAtDistance(route, 10_000)).toBeCloseTo(120, 0);
  });
});

describe("fixTimestamp — when a fix was taken", () => {
  const now = 1_700_000_000_000;

  it("uses the fix's own time when it is sane", () => {
    expect(fixTimestamp(now - 4000, now, now - 5000)).toBe(now - 4000);
    expect(fixTimestamp(now - 4000, now, null)).toBe(now - 4000);
  });

  it("falls back to arrival for a time that is missing or not a number", () => {
    expect(fixTimestamp(undefined, now, null)).toBe(now);
    expect(fixTimestamp(NaN, now, null)).toBe(now);
    expect(fixTimestamp(Infinity, now, null)).toBe(now);
    expect(fixTimestamp("1700000000000", now, null)).toBe(now);
  });

  it("never stamps a fix later than it arrived", () => {
    // A receiver clock running ahead: a little, then an hour.
    expect(fixTimestamp(now + 500, now, null)).toBe(now);
    expect(fixTimestamp(now + 3_600_000, now, now - 1000)).toBe(now);
  });

  it("falls back to arrival for a time before the previous point, or absurdly old", () => {
    expect(fixTimestamp(now - 9000, now, now - 5000)).toBe(now);
    expect(fixTimestamp(now - FIX_TIME_MAX_AGE_MS - 1, now, null)).toBe(now);
    // Seconds read as milliseconds would date the run in 1970.
    expect(fixTimestamp(now / 1000, now, null)).toBe(now);
  });
});

describe("isValidReading — measured on the fix's own time", () => {
  it("judges a batched fix on the seconds between the fixes, not between arrivals", () => {
    // 30 m in 1 s is 30 m/s — a teleport — even though it arrives 10 s late.
    const lastPoint = makePoint({ lat: 0, lon: 0, timestamp: 1_000_000 });
    const coords = {
      latitude: 30 / M_PER_DEG,
      longitude: 0,
      accuracy: 5,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON() {
        return this;
      },
    } as GeolocationCoordinates;
    expect(isValidReading(coords, lastPoint, 60, 1_001_000)).toBe(false);
    expect(isValidReading(coords, lastPoint, 60, 1_010_000)).toBe(true);
  });
});

describe("readingVerdict — why a fix is not recorded", () => {
  const coordsAt = (lat: number, accuracy = 5) => ({
    latitude: lat,
    longitude: -0.1,
    accuracy,
    altitude: 10,
    altitudeAccuracy: 5,
    heading: 0,
    speed: 3,
    toJSON() {
      return this;
    },
  });
  const T = 1_700_000_000_000;
  const last = makePoint({ lat: 51.5, lon: -0.1, timestamp: T });
  const metresNorth = (m: number) => 51.5 + m / 111_320;

  it("calls a fix that has not moved still, not bad", () => {
    expect(readingVerdict(coordsAt(metresNorth(0.4)), last, 60, T + 1000)).toBe(
      "still"
    );
    // The same fix delivered twice: still, not out of order.
    expect(readingVerdict(coordsAt(51.5), last, 60, T)).toBe("still");
  });

  it("names each fault", () => {
    expect(
      readingVerdict(coordsAt(metresNorth(5), 80), last, 60, T + 1000)
    ).toBe("inaccurate");
    expect(readingVerdict(coordsAt(metresNorth(5)), last, 60, T - 1000)).toBe(
      "out-of-order"
    );
    expect(readingVerdict(coordsAt(metresNorth(50)), last, 60, T + 1000)).toBe(
      "teleport"
    );
    expect(readingVerdict(coordsAt(metresNorth(3)), last, 60, T + 1000)).toBe(
      "ok"
    );
  });

  it("records only what it calls ok", () => {
    expect(isValidReading(coordsAt(metresNorth(3)), last, 60, T + 1000)).toBe(
      true
    );
    expect(isValidReading(coordsAt(metresNorth(0.4)), last, 60, T + 1000)).toBe(
      false
    );
  });
});
