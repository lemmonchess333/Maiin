/**
 * Property-based guard for calculatePaceTrend — the run pace-trend badge.
 *
 * Example tests pin specific cases; this fuzzes run histories and asserts the
 * gating + PR-detection contract that a threshold/sign regression would break:
 *   - an ineligible current run ⇒ "no-data"
 *   - fewer than the minimum comparable runs (8, within ±20% distance) ⇒ "no-data"
 *   - a current run strictly faster than EVERY comparable run ⇒ "pr"
 *   - the trend is always one of the four enum values, and the label is
 *     non-empty exactly when the trend is not "no-data"
 *
 * Deterministic (seeded PRNG).
 */
import { describe, it, expect } from "vitest";
import { calculatePaceTrend, type PaceTrend } from "../paceTrends";

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

interface Run {
  distance: number;
  avgPace: number;
  completedAt: Date;
  activityType?: string;
  isInvalid?: boolean;
  savedAnyway?: boolean;
}

/** An eligible outdoor run ~5km, at the given pace + day offset. */
const run = (avgPace: number, dayOffset: number, distance = 5000): Run => ({
  distance,
  avgPace,
  completedAt: new Date(2026, 0, 1 + dayOffset),
  activityType: "easy",
});

const ALL: PaceTrend[] = ["pr", "improving", "consistent", "no-data"];

describe("calculatePaceTrend gating + PR detection (property-based)", () => {
  it("an ineligible current run is always 'no-data'", () => {
    const rnd = mulberry32(851);
    for (let i = 0; i < 1000; i++) {
      const history = Array.from({ length: 10 }, (_, k) =>
        run(300 + rnd() * 60, k)
      );
      const cur: Run = { ...run(290, 20), isInvalid: true };
      expect(calculatePaceTrend(cur, [...history, cur]).trend).toBe("no-data");
    }
  });

  it("fewer than 8 comparable runs ⇒ 'no-data'", () => {
    const rnd = mulberry32(852);
    for (let i = 0; i < 1000; i++) {
      const n = Math.floor(rnd() * 8); // 0..7 comparable
      const history = Array.from({ length: n }, (_, k) =>
        run(300 + rnd() * 60, k)
      );
      const cur = run(280, 50);
      expect(calculatePaceTrend(cur, [...history, cur]).trend).toBe("no-data");
    }
  });

  it("a current run faster than EVERY comparable run is a PR", () => {
    const rnd = mulberry32(853);
    for (let i = 0; i < 1500; i++) {
      // ≥8 comparable runs, all slower than the current (higher avgPace).
      const slowest = 300;
      const history = Array.from(
        { length: 8 + Math.floor(rnd() * 6) },
        (_, k) => run(slowest + 5 + rnd() * 120, k)
      );
      const cur = run(slowest - 1 - rnd() * 50, 60); // strictly fastest
      expect(calculatePaceTrend(cur, [...history, cur]).trend).toBe("pr");
    }
  });

  it("the trend is always a valid enum value, with a label iff not 'no-data'", () => {
    const rnd = mulberry32(854);
    for (let i = 0; i < 2000; i++) {
      const history = Array.from({ length: Math.floor(rnd() * 14) }, (_, k) =>
        run(250 + rnd() * 150, k)
      );
      const cur = run(250 + rnd() * 150, 60);
      const res = calculatePaceTrend(cur, [...history, cur]);
      expect(ALL).toContain(res.trend);
      expect(res.label.length > 0).toBe(res.trend !== "no-data");
    }
  });
});
