/**
 * Property-based guard for the GPS aggregates that drive distance, pace and
 * calories — totalDistance + totalElevationGain. These feed the run summary, so
 * a sign error or off-by-one would corrupt every downstream number.
 *
 * Invariants fuzzed over random tracks:
 *   - totalDistance is non-negative and equals the sum of consecutive haversine
 *     segments (and is monotonic — appending a point never DECREASES it)
 *   - totalElevationGain is non-negative and only ever counts UPWARD altitude
 *     moves (a descending-only track gains nothing), and reading a track
 *     backwards swaps its climb and its descent exactly — the smoothing is
 *     centred and the hysteresis has no direction, so neither favours one
 *
 * Deterministic (seeded PRNG).
 */
import { describe, it, expect } from "vitest";
import {
  climbBySegment,
  totalDistance,
  totalElevationGain,
  haversine,
  type GPSPoint,
} from "../gps";
import { mulberry32 } from "@/test/prng";

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

  it("reading a track backwards swaps its climb and its descent", () => {
    const rnd = mulberry32(875);
    const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
    for (let i = 0; i < 2000; i++) {
      const track = genTrack(rnd, Math.floor(rnd() * 60));
      const forward = climbBySegment(track);
      const backward = climbBySegment([...track].reverse());
      expect(sum(backward.loss)).toBeCloseTo(sum(forward.gain), 6);
      expect(sum(backward.gain)).toBeCloseTo(sum(forward.loss), 6);
    }
  });
});
