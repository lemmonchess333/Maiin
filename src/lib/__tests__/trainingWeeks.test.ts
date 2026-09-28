import { describe, it, expect } from "vitest";
import {
  countOf,
  liftingBins,
  liftingFigures,
  runningBins,
  runningFigures,
  totalTimeLabel,
} from "../trainingWeeks";
import type { SummaryBin } from "../periodSummary";

/**
 * The week cards' words. The tile these replaced read "1 total runs" for
 * every runner in their first week; a count is English or it is a bug.
 */

const bin = (over: Partial<SummaryBin>): SummaryBin => ({
  key: "2026-09-14",
  lifts: 0,
  runs: 0,
  volumeKg: 0,
  distanceM: 0,
  current: false,
  ...over,
});

describe("counts read as English", () => {
  it("one is singular, anything else plural, zero included", () => {
    expect(countOf(1, "run", "runs")).toBe("1 run");
    expect(countOf(3, "run", "runs")).toBe("3 runs");
    expect(countOf(0, "run", "runs")).toBe("0 runs");
  });

  it("in the figures", () => {
    const one = runningFigures({
      distanceM: 5000,
      runs: 1,
      seconds: 1500,
      unit: "km",
    });
    expect(one.map((f) => f.label)).toEqual(["km run", "run", "time"]);
    const lifts = liftingFigures({ volumeKg: 900, sessions: 1, sets: 1 });
    expect(lifts.map((f) => f.label)).toEqual(["kg lifted", "session", "set"]);
    expect(
      liftingFigures({ volumeKg: 900, sessions: 2, sets: 9 }).map(
        (f) => f.label
      )
    ).toEqual(["kg lifted", "sessions", "sets"]);
  });

  it("in a bar's reading", () => {
    expect(runningBins("km").countText(bin({ runs: 1 }))).toBe("1 run");
    expect(liftingBins.countText(bin({ lifts: 2 }))).toBe("2 sessions");
  });
});

describe("units", () => {
  it("are the reader's on a run's figures and bars", () => {
    const miles = runningFigures({
      distanceM: 16_093.44,
      runs: 2,
      seconds: 5400,
      unit: "mi",
    });
    expect(miles[0]).toEqual({ value: "10.0", label: "mi run" });
    const bars = runningBins("mi");
    expect(bars.amount(bin({ distanceM: 1609.344 }))).toBeCloseTo(1);
    expect(bars.describe(1)).toBe("1.0 mi");
  });

  it("are spaced, and time reads as time", () => {
    expect(liftingBins.describe(12_300)).toBe("12.3k kg");
    expect(
      runningFigures({
        distanceM: 42_000,
        runs: 5,
        seconds: 14_700,
        unit: "km",
      })[2]
    ).toEqual({ value: "4h 5m", label: "time" });
  });

  it("gives time as hours and minutes, never a clock", () => {
    expect(totalTimeLabel(43_500)).toBe("12h 5m");
    expect(totalTimeLabel(2712)).toBe("45m");
    expect(totalTimeLabel(0)).toBe("0m");
    expect(totalTimeLabel(123 * 3600 + 1800)).toBe("123h");
  });
});
