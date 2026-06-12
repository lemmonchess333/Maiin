/**
 * Property-based guard for the GPS aggregates that drive distance, pace and
 * calories — totalDistance + totalElevationGain. These feed the run summary, so
 * a sign error or off-by-one would corrupt every downstream number.
 *
 * Invariants fuzzed over random tracks:
 *   - totalDistance is non-negative and equals the sum of consecutive haversine
 *     segments (and is monotonic — appending a point never DECREASES it)
 *   - totalElevationGain is non-negative and only ever counts UPWARD altitude
 *     moves above the 2 m noise gate (a descending-only track gains nothing)
 *
 * Deterministic (seeded PRNG).
 */
import { describe, it, expect } from "vitest";
import {
  totalDistance,
  totalElevationGain,
  haversine,
  type GPSPoint,
} from "../gps";

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

function pt(lat: number, lon: number, altitude: number | null): GPSPoint {
  return {
    lat,
    lon,
    altitude,
    accuracy: 5,
    speed: 3,
    timestamp: 0,
    rawLat: lat,
    rawLon: lon,
  };
}

function genTrack(rnd: () => number, n: number): GPSPoint[] {
  const pts: GPSPoint[] = [];
  let lat = 51,
    lon = -0.1,
    alt = 10;
  for (let i = 0; i < n; i++) {
    lat += (rnd() - 0.5) * 0.01;
    lon += (rnd() - 0.5) * 0.01;
    alt += (rnd() - 0.5) * 10;
    pts.push(pt(lat, lon, rnd() < 0.1 ? null : alt));
  }
  return pts;
}

describe("totalDistance (property-based)", () => {
  it("is non-negative and equals the sum of consecutive segments", () => {
    const rnd = mulberry32(871);
    for (let i = 0; i < 2000; i++) {
      const track = genTrack(rnd, Math.floor(rnd() * 30));
      const d = totalDistance(track);
      expect(d).toBeGreaterThanOrEqual(0);

      let manual = 0;
      for (let k = 1; k < track.length; k++) {
        manual += haversine(
          track[k - 1].lat,
          track[k - 1].lon,
          track[k].lat,
          track[k].lon
        );
      }
      expect(d).toBeCloseTo(manual, 6);
    }
  });

  it("is monotonic — appending a point never decreases the total", () => {
    const rnd = mulberry32(872);
    for (let i = 0; i < 2000; i++) {
      const track = genTrack(rnd, 2 + Math.floor(rnd() * 25));
      const before = totalDistance(track.slice(0, -1));
      const after = totalDistance(track);
      expect(after).toBeGreaterThanOrEqual(before - 1e-9);
    }
  });
});

describe("totalElevationGain (property-based)", () => {
  it("is non-negative for any track", () => {
    const rnd = mulberry32(873);
    for (let i = 0; i < 2000; i++) {
      expect(
        totalElevationGain(genTrack(rnd, Math.floor(rnd() * 30)))
      ).toBeGreaterThanOrEqual(0);
    }
  });

  it("a strictly-descending track gains zero (only upward moves count)", () => {
    const rnd = mulberry32(874);
    for (let i = 0; i < 1000; i++) {
      const pts: GPSPoint[] = [];
      let alt = 1000;
      const n = 2 + Math.floor(rnd() * 20);
      for (let k = 0; k < n; k++) {
        alt -= 1 + rnd() * 20; // always down
        pts.push(pt(51 + k * 0.001, -0.1, alt));
      }
      expect(totalElevationGain(pts)).toBe(0);
    }
  });
});
