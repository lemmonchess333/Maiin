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
import {
  calculateSplits,
  detectBestEfforts,
  totalDistance,
  type GPSPoint,
} from "../gps";
import { mulberry32 } from "@/test/prng";

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

/** A run at a plausible pace: a fix every 1–3 s, 2–6 m/s. */
function genRun(rnd: () => number, fixes: number): GPSPoint[] {
  const pts: GPSPoint[] = [pt(0, 1_700_000_000_000)];
  let lat = 0;
  let ts = pts[0].timestamp;
  for (let i = 0; i < fixes; i++) {
    const dt = 1 + Math.floor(rnd() * 3);
    lat += ((2 + rnd() * 4) * dt) / 111_195;
    ts += dt * 1000;
    pts.push(pt(lat, ts));
  }
  return pts;
}

/** The same run with the clock held for `heldMs` just before point `at`:
 *  the shape useGPS records a pause in — later points are later on the
 *  wall clock by the hold, and carry it in `pausedMs`. */
function withHold(run: GPSPoint[], at: number, heldMs: number): GPSPoint[] {
  return run.map((p, i) =>
    i < at
      ? p
      : {
          ...p,
          timestamp: p.timestamp + heldMs,
          pausedMs: (p.pausedMs ?? 0) + heldMs,
        }
  );
}

describe("moving time (property-based)", () => {
  it("a hold of any length, anywhere, changes no split and no best effort", () => {
    /* The runner stood still; nothing was recorded. Splits and best
       efforts are about running, so they must come out exactly as if the
       stop never happened — on the wall clock (the old code) every split
       and effort spanning it grew by the whole hold. */
    const rnd = mulberry32(912);
    for (let i = 0; i < 300; i++) {
      const run = genRun(rnd, 400 + Math.floor(rnd() * 3000));
      let held = run;
      const holds = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < holds; k++) {
        const at = 1 + Math.floor(rnd() * (run.length - 1));
        held = withHold(held, at, Math.round(rnd() * 900_000));
      }
      const plain = calculateSplits(run);
      const paused = calculateSplits(held);
      expect(paused).toHaveLength(plain.length);
      paused.forEach((s, k) => {
        expect(s.time).toBeCloseTo(plain[k].time, 6);
        expect(s.km).toBe(plain[k].km);
      });
      const d = totalDistance(run);
      expect(totalDistance(held)).toBeCloseTo(d, 6);
      expect(detectBestEfforts(held, d)).toEqual(
        detectBestEfforts(run, d).map((e) => ({
          ...e,
          time: expect.closeTo(e.time, 6),
        }))
      );
    }
  });
});
