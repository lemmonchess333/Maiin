/**
 * Property-based guard for the GPS KalmanFilter (position smoothing).
 *
 * Each update is a convex combination new = (1−k)·old + k·raw with the Kalman
 * gain k ∈ (0,1], so the smoothed position can NEVER leave the bounding box of
 * the raw inputs seen so far — it can't diverge or overshoot. A divergent filter
 * would corrupt run tracks (phantom distance, bad pace). This fuzzes random GPS
 * streams and asserts that non-divergence, plus the seed + reset behaviour.
 *
 * Deterministic (seeded PRNG).
 */
import { describe, it, expect } from "vitest";
import { KalmanFilter } from "../gps";

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("KalmanFilter non-divergence (property-based)", () => {
  it("the smoothed position never leaves the bounding box of the raw inputs", () => {
    const rnd = mulberry32(801);
    for (let sim = 0; sim < 1500; sim++) {
      const kf = new KalmanFilter(1 + rnd() * 5);
      let minLat = Infinity,
        maxLat = -Infinity,
        minLon = Infinity,
        maxLon = -Infinity;
      const steps = 3 + Math.floor(rnd() * 40);
      for (let s = 0; s < steps; s++) {
        const lat = 51 + (rnd() - 0.5) * 0.1;
        const lon = -0.1 + (rnd() - 0.5) * 0.1;
        const accuracy = 1 + rnd() * 50;
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);

        const out = kf.process(lat, lon, accuracy);
        // Allow a hair of FP slack on the bounds.
        expect(out.lat).toBeGreaterThanOrEqual(minLat - 1e-9);
        expect(out.lat).toBeLessThanOrEqual(maxLat + 1e-9);
        expect(out.lon).toBeGreaterThanOrEqual(minLon - 1e-9);
        expect(out.lon).toBeLessThanOrEqual(maxLon + 1e-9);
      }
    }
  });

  it("the first reading is passed through unchanged (seed)", () => {
    const rnd = mulberry32(802);
    for (let i = 0; i < 1000; i++) {
      const kf = new KalmanFilter();
      const lat = 51 + (rnd() - 0.5) * 0.1;
      const lon = -0.1 + (rnd() - 0.5) * 0.1;
      const out = kf.process(lat, lon, 1 + rnd() * 50);
      expect(out).toEqual({ lat, lon });
    }
  });

  it("a constant-position stream stays pinned at that position", () => {
    const rnd = mulberry32(803);
    for (let i = 0; i < 1000; i++) {
      const kf = new KalmanFilter(1 + rnd() * 5);
      const lat = 51 + (rnd() - 0.5) * 0.1;
      const lon = -0.1 + (rnd() - 0.5) * 0.1;
      for (let s = 0; s < 20; s++) {
        const out = kf.process(lat, lon, 1 + rnd() * 50);
        expect(out.lat).toBeCloseTo(lat, 9);
        expect(out.lon).toBeCloseTo(lon, 9);
      }
    }
  });

  it("reset() re-seeds: the next reading is passed through unchanged again", () => {
    const kf = new KalmanFilter();
    kf.process(51.5, -0.1, 5);
    kf.process(51.6, -0.2, 5); // smoothed away from the seed
    kf.reset();
    const out = kf.process(40.0, -74.0, 8); // a totally different place
    expect(out).toEqual({ lat: 40.0, lon: -74.0 });
  });
});
