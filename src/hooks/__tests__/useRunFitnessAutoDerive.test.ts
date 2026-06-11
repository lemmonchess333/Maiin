import { describe, it, expect } from "vitest";
import { resolveAutoDeriveBenchmark } from "../useRunFitnessAutoDerive";

const runs = [
  { distanceM: 5000, durationS: 1500 }, // 25:00 5K
  { distanceM: 5000, durationS: 1200 }, // 20:00 5K — best
  { distanceM: 10000, durationS: 3000 }, // 50:00 10K
];

describe("resolveAutoDeriveBenchmark", () => {
  it("returns null when the user already has fitness set", () => {
    expect(resolveAutoDeriveBenchmark(true, runs)).toBeNull();
  });

  it("returns null with fewer than 3 eligible runs", () => {
    expect(resolveAutoDeriveBenchmark(false, runs.slice(0, 2))).toBeNull();
  });

  it("derives the best-effort benchmark from enough eligible runs", () => {
    expect(resolveAutoDeriveBenchmark(false, runs)).toEqual({
      distanceM: 5000,
      timeS: 1200,
    });
  });

  it("returns null when none of the runs are representative (all < 2km)", () => {
    expect(
      resolveAutoDeriveBenchmark(false, [
        { distanceM: 800, durationS: 200 },
        { distanceM: 1000, durationS: 300 },
        { distanceM: 1500, durationS: 400 },
      ])
    ).toBeNull();
  });
});
