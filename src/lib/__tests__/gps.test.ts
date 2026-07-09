import { describe, it, expect } from "vitest";
import {
  haversine,
  bearing,
  routeProgress,
  routeTotalDistance,
  routeTimeAtDistance,
  isValidReading,
  calculatePace,
  rollingPace,
  paceAsNumber,
  calculateSplits,
  totalElevationGain,
  totalDistance,
  estimateRunCalories,
  detectBestEfforts,
  KalmanFilter,
  toGPX,
  type GPSPoint,
} from "../gps";

// ── Helpers ──────────────────────────────────

function makePoint(overrides: Partial<GPSPoint> = {}): GPSPoint {
  return {
    lat: 51.5074,
    lon: -0.1278,
    altitude: 10,
    accuracy: 5,
    speed: 3,
    timestamp: Date.now(),
    rawLat: 51.5074,
    rawLon: -0.1278,
    ...overrides,
  };
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

// ── totalElevationGain ───────────────────────

describe("totalElevationGain", () => {
  it("returns 0 for empty array", () => {
    expect(totalElevationGain([])).toBe(0);
  });

  it("returns 0 for single point", () => {
    expect(totalElevationGain([makePoint()])).toBe(0);
  });

  it("sums only positive elevation changes > 2m", () => {
    const points: GPSPoint[] = [
      makePoint({ altitude: 10 }),
      makePoint({ altitude: 15 }), // +5 (counted)
      makePoint({ altitude: 12 }), // -3 (ignored)
      makePoint({ altitude: 20 }), // +8 (counted)
      makePoint({ altitude: 19 }), // -1 (ignored, also <= 2)
    ];
    // gain = 5 + 8 = 13
    expect(totalElevationGain(points)).toBe(13);
  });

  it("ignores small gains <= 2m (noise filter)", () => {
    const points: GPSPoint[] = [
      makePoint({ altitude: 10 }),
      makePoint({ altitude: 11.5 }), // +1.5 ≤ 2, ignored
      makePoint({ altitude: 12 }), // +0.5 ≤ 2, ignored
    ];
    expect(totalElevationGain(points)).toBe(0);
  });

  it("handles null altitudes", () => {
    const points: GPSPoint[] = [
      makePoint({ altitude: 10 }),
      makePoint({ altitude: null }),
      makePoint({ altitude: 20 }),
    ];
    // First→Second: null altitude, skipped. Second→Third: null altitude, skipped.
    expect(totalElevationGain(points)).toBe(0);
  });

  it("rounds the result", () => {
    const points: GPSPoint[] = [
      makePoint({ altitude: 10 }),
      makePoint({ altitude: 15.7 }), // +5.7
    ];
    expect(totalElevationGain(points)).toBe(6); // Math.round(5.7)
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

describe("rollingPace", () => {
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

  it("returns '--:--' for fewer than two points", () => {
    expect(rollingPace([])).toBe("--:--");
    expect(rollingPace([pointAt(0, 0)])).toBe("--:--");
  });

  it("returns '--:--' when the rolling distance is below 10m", () => {
    /* Two points 1m apart over 30s — under the distance floor. */
    const a = pointAt(0, 0);
    const b = pointAt(0.0000089, 30); // ~1m north
    expect(rollingPace([a, b], 30)).toBe("--:--");
  });

  it("computes a rolling pace from points within the window", () => {
    /* Two points 100m apart, 30s apart → pace 5:00/km. */
    const a = pointAt(0, 0);
    const b = pointAt(0.0008983, 30); // ~100m north
    expect(rollingPace([a, b], 30)).toBe("5:00");
  });

  it("only sums points within the window — older points are ignored", () => {
    /* First point is 60s ago (outside a 30s window). Within the
       window: two points 100m apart over 20s → pace 200s/km = 3:20/km. */
    const old = pointAt(0, 0);
    const start = pointAt(0, 40); // 20s before the latest at t=60
    const end = pointAt(0.0008983, 60);
    expect(rollingPace([old, start, end], 30)).toBe("3:20");
  });

  it("returns '--:--' when only the latest point falls inside the window", () => {
    /* All older points outside → only the latest survives → can't
       compute pace from a single point. */
    const a = pointAt(0, 0);
    const b = pointAt(0.001, 100); // 100s later, well outside a 30s window
    expect(rollingPace([a, b], 30)).toBe("--:--");
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
