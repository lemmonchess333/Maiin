import { describe, it, expect } from "vitest";
import {
  bodyLine,
  foodLine,
  goDeeperLines,
  liftingLine,
  runningLine,
} from "../goDeeperLines";
import type { LiftProgressRow } from "@/lib/liftProgress";
import type { PaceByKindRow } from "@/lib/runInsights";

/* A figure and its unit stay on one line when the tile wraps. */
const NB = "\u00A0";

const set = { weight: 80, reps: 5, date: "2026-09-01", e1rm: 93 };
const lift = (over: Partial<LiftProgressRow> = {}): LiftProgressRow => ({
  exerciseId: "bench-press",
  name: "Bench Press",
  sessions: 4,
  first: set,
  latest: set,
  series: [],
  direction: "level",
  newBest: null,
  holding: null,
  ...over,
});

describe("liftingLine", () => {
  it("leads with this week's new bests", () => {
    expect(liftingLine([lift({ newBest: set, direction: "up" }), lift()])).toBe(
      "1 new best this week"
    );
    expect(liftingLine([lift({ newBest: set }), lift({ newBest: set })])).toBe(
      "2 new bests this week"
    );
  });

  it("otherwise counts the lifts going up and the ones holding", () => {
    expect(
      liftingLine([
        lift({ direction: "up" }),
        lift({ direction: "up" }),
        lift({ holding: { best: set, sessionsSince: 4 }, direction: "up" }),
      ])
    ).toBe("2 lifts up · 1 holding");
    expect(liftingLine([lift({ direction: "up" })])).toBe("1 lift up");
  });

  it("has nothing to say about level or falling lifts alone", () => {
    expect(liftingLine([lift(), lift({ direction: "down" })])).toBeNull();
    expect(liftingLine([])).toBeNull();
  });
});

describe("runningLine", () => {
  const easy = (now: number, before: number | null): PaceByKindRow => ({
    kind: "easy",
    runs: 4,
    distanceM: 30_000,
    paceSecPerKm: now,
    previousPaceSecPerKm: before,
  });

  it("says how the easy pace moved, in the reader's unit", () => {
    expect(
      runningLine({ pace: [easy(350, 357)], longest: null, unit: "km" })
    ).toBe(`Easy pace 7${NB}s/km faster`);
    expect(
      runningLine({ pace: [easy(357, 350)], longest: null, unit: "mi" })
    ).toBe(`Easy pace 11${NB}s/mi slower`);
  });

  it("falls back to the longest run without an easy-pace change", () => {
    expect(
      runningLine({
        pace: [easy(350, null)],
        longest: { distanceM: 18_000 },
        unit: "km",
      })
    ).toBe(`Longest run 18.0${NB}km`);
    expect(runningLine({ pace: [], longest: null, unit: "km" })).toBeNull();
  });
});

describe("bodyLine", () => {
  it("states the rate in the reader's unit", () => {
    expect(bodyLine({ kgPerWeek: -0.33, unit: "kg", hideNumber: false })).toBe(
      `Down 0.33${NB}kg a week`
    );
    expect(bodyLine({ kgPerWeek: 0.2, unit: "lbs", hideNumber: false })).toBe(
      `Up 0.44${NB}lbs a week`
    );
  });

  it("says only the direction when the number is hidden", () => {
    expect(bodyLine({ kgPerWeek: -0.33, unit: "kg", hideNumber: true })).toBe(
      "Trending down"
    );
  });

  it("reads a near-flat rate as steady, and no rate as nothing", () => {
    expect(bodyLine({ kgPerWeek: 0.02, unit: "kg", hideNumber: false })).toBe(
      "Holding steady"
    );
    expect(
      bodyLine({ kgPerWeek: null, unit: "kg", hideNumber: false })
    ).toBeNull();
  });
});

describe("foodLine and the set of lines", () => {
  it("counts logged days, and says nothing before the first", () => {
    expect(foodLine({ daysLogged: 26, rangeDays: 30 })).toBe(
      "Logged 26 of 30 days"
    );
    expect(foodLine({ daysLogged: 0, rangeDays: 30 })).toBeNull();
  });

  it("keeps only the pages that have a line", () => {
    expect(
      goDeeperLines({
        lifting: "1 lift up",
        running: null,
        body: null,
        food: "Logged 3 of 7 days",
      })
    ).toEqual({ lifting: "1 lift up", food: "Logged 3 of 7 days" });
  });
});
