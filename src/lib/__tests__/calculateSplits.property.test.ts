/**
 * Property-based guard for calculateSplits — the per-km run split table.
 *
 * The km column must be CONSECUTIVE (1, 2, …, N) with no gaps or duplicates,
 * where N = floor(totalDistance / 1000). The tricky case the engine comment
 * calls out: a single GPS segment that jumps multiple km (signal drop +
 * reappear) must emit EVERY km it crosses — not skip to the far km and leave a
 * gap. This fuzzes paths (including multi-km jumps) and asserts the structure
 * for all of them.
 *
 * Paths run along a meridian so per-segment metres come from the same haversine
 * the function uses. Deterministic (seeded PRNG).
 */
import { describe, it, expect } from "vitest";
import { calculateSplits, totalDistance, type GPSPoint } from "../gps";

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

function pt(lat: number, ts: number): GPSPoint {
  return {
    lat,
    lon: 0,
    altitude: 10,
    accuracy: 5,
    speed: 3,
    timestamp: ts,
    rawLat: lat,
    rawLon: 0,
  };
}

/** A path of N segments. Each segment steps north by a random amount — mostly
 *  ~0.001–0.003° (≈110–330m), occasionally a multi-km jump (≈0.02° ≈ 2.2km). */
function genPath(rnd: () => number, segments: number): GPSPoint[] {
  const pts: GPSPoint[] = [pt(0, 0)];
  let lat = 0;
  let ts = 0;
  for (let i = 0; i < segments; i++) {
    const jump = rnd() < 0.08; // ~8% multi-km jumps to stress the while-loop
    lat += jump ? 0.015 + rnd() * 0.02 : 0.001 + rnd() * 0.002;
    ts += 10_000 + Math.round(rnd() * 50_000);
    pts.push(pt(lat, ts));
  }
  return pts;
}

describe("calculateSplits structure (property-based)", () => {
  it("km column is consecutive 1..N with N = floor(totalDistance/1000), even across multi-km jumps", () => {
    const rnd = mulberry32(909);
    for (let i = 0; i < 2000; i++) {
      const path = genPath(rnd, 5 + Math.floor(rnd() * 40));
      const splits = calculateSplits(path);
      const expectedN = Math.floor(totalDistance(path) / 1000);

      expect(splits.length).toBe(expectedN);
      // Consecutive, gap-free, no duplicates.
      expect(splits.map((s) => s.km)).toEqual(
        Array.from({ length: expectedN }, (_, k) => k + 1)
      );
    }
  });

  it("every split has a non-negative time + paceSeconds", () => {
    const rnd = mulberry32(910);
    for (let i = 0; i < 1500; i++) {
      const path = genPath(rnd, 5 + Math.floor(rnd() * 40));
      for (const s of calculateSplits(path)) {
        expect(s.time).toBeGreaterThanOrEqual(0);
        expect(s.paceSeconds).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("returns no splits for a path under 1km, and is deterministic", () => {
    const rnd = mulberry32(911);
    for (let i = 0; i < 1000; i++) {
      // ≤8 short segments → comfortably under 1km.
      const path = genPath(mulberry32(1000 + i), 1 + Math.floor(rnd() * 4));
      const a = calculateSplits(path);
      if (totalDistance(path) < 1000) expect(a).toEqual([]);
      expect(calculateSplits(path)).toEqual(a); // deterministic
    }
  });
});
