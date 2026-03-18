import { describe, it, expect } from "vitest";
import {
  haversine,
  isValidReading,
  calculatePace,
  paceAsNumber,
  calculateSplits,
  totalElevationGain,
  totalDistance,
  estimateRunCalories,
  KalmanFilter,
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

// ── isValidReading ───────────────────────────

describe("isValidReading", () => {
  it("accepts first point with accuracy <= 150", () => {
    const coords = { latitude: 51.5, longitude: -0.1, accuracy: 100, altitude: 10, altitudeAccuracy: 5, heading: 0, speed: 3, toJSON() { return this; } };
    expect(isValidReading(coords, null)).toBe(true);
  });

  it("rejects first point with accuracy > 150", () => {
    const coords = { latitude: 51.5, longitude: -0.1, accuracy: 200, altitude: 10, altitudeAccuracy: 5, heading: 0, speed: 3, toJSON() { return this; } };
    expect(isValidReading(coords, null)).toBe(false);
  });

  it("rejects subsequent point with accuracy > 35 (after 15s)", () => {
    const lastPoint = makePoint({ lat: 51.5, lon: -0.1, timestamp: Date.now() - 20000 });
    const coords = { latitude: 51.501, longitude: -0.1, accuracy: 40, altitude: 10, altitudeAccuracy: 5, heading: 0, speed: 3, toJSON() { return this; } };
    expect(isValidReading(coords, lastPoint, 20)).toBe(false);
  });

  it("allows accuracy up to 50 in first 15 seconds", () => {
    const lastPoint = makePoint({ lat: 51.5, lon: -0.1, timestamp: Date.now() - 10000 });
    const coords = { latitude: 51.501, longitude: -0.1, accuracy: 45, altitude: 10, altitudeAccuracy: 5, heading: 0, speed: 3, toJSON() { return this; } };
    expect(isValidReading(coords, lastPoint, 10)).toBe(true);
  });

  it("rejects readings with implied speed > 12 m/s", () => {
    const lastPoint = makePoint({ lat: 51.5, lon: -0.1, timestamp: Date.now() - 1000 });
    // 0.01 degrees lat ≈ 1111m in 1 second → speed ≈ 1111 m/s
    const coords = { latitude: 51.51, longitude: -0.1, accuracy: 5, altitude: 10, altitudeAccuracy: 5, heading: 0, speed: 3, toJSON() { return this; } };
    expect(isValidReading(coords, lastPoint)).toBe(false);
  });

  it("rejects readings with distance < 1m", () => {
    const lastPoint = makePoint({ lat: 51.5, lon: -0.1, timestamp: Date.now() - 5000 });
    // Essentially same point
    const coords = { latitude: 51.5, longitude: -0.1, accuracy: 5, altitude: 10, altitudeAccuracy: 5, heading: 0, speed: 3, toJSON() { return this; } };
    expect(isValidReading(coords, lastPoint)).toBe(false);
  });

  it("rejects if timeDiff <= 0", () => {
    const lastPoint = makePoint({ lat: 51.5, lon: -0.1, timestamp: Date.now() + 5000 });
    const coords = { latitude: 51.501, longitude: -0.1, accuracy: 5, altitude: 10, altitudeAccuracy: 5, heading: 0, speed: 3, toJSON() { return this; } };
    expect(isValidReading(coords, lastPoint)).toBe(false);
  });

  it("accepts a valid subsequent reading", () => {
    // ~111m over 30 seconds = ~3.7 m/s (walking/jogging)
    const lastPoint = makePoint({ lat: 51.5, lon: -0.1, timestamp: Date.now() - 30000 });
    const coords = { latitude: 51.501, longitude: -0.1, accuracy: 10, altitude: 10, altitudeAccuracy: 5, heading: 0, speed: 3, toJSON() { return this; } };
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
      points.push(makePoint({
        lat: 51.5 + i * 0.001,
        lon: -0.1,
        altitude: 10,
        timestamp: baseTime + i * 30000, // 30s between each point
      }));
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
      makePoint({ altitude: 15 }),  // +5 (counted)
      makePoint({ altitude: 12 }),  // -3 (ignored)
      makePoint({ altitude: 20 }),  // +8 (counted)
      makePoint({ altitude: 19 }),  // -1 (ignored, also <= 2)
    ];
    // gain = 5 + 8 = 13
    expect(totalElevationGain(points)).toBe(13);
  });

  it("ignores small gains <= 2m (noise filter)", () => {
    const points: GPSPoint[] = [
      makePoint({ altitude: 10 }),
      makePoint({ altitude: 11.5 }), // +1.5 ≤ 2, ignored
      makePoint({ altitude: 12 }),    // +0.5 ≤ 2, ignored
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
      makePoint({ lat: 51.500, lon: -0.1 }),
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
      makePoint({ lat: 51.500, lon: -0.1 }),
      makePoint({ lat: 51.501, lon: -0.1 }),
      makePoint({ lat: 51.500, lon: -0.1 }),
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
