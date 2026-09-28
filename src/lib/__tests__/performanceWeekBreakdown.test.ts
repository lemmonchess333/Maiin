import { describe, it, expect } from "vitest";
import {
  performanceWeekBreakdown,
  USUAL_WEEK_MIN_WEEKS,
} from "../performanceWeekBreakdown";

/**
 * The Performance page's account of its score, built from the document's
 * own aggregates and baseline, so it cannot describe a different week
 * from the one it scored, and cannot claim what the data does not hold.
 */

const AGG = {
  liftSessions: 4,
  liftTonnage: 16240,
  runSessions: 3,
  runKm: 32.4,
  runLongKm: 14.2,
  mealDaysLogged: 6,
  avgDailyCalories: 2184.4,
  avgDailyProtein: 147.6,
};
const BASE = { liftTonnage: 13700, runKm: 26, weeksUsed: 4 };
const KM = { distanceUnit: "km" as const, establishing: false };

describe("performanceWeekBreakdown", () => {
  it("states the week's lifting and running beside the usual week", () => {
    const { measures } = performanceWeekBreakdown(
      { aggregates: AGG, baseline: BASE },
      KM
    );
    expect(measures).toEqual([
      {
        key: "lifting",
        label: "Lifting",
        value: 16240,
        valueText: "16.2k kg",
        usual: 13700,
        usualText: "13.7k kg",
        detail: "4 sessions",
      },
      {
        key: "running",
        label: "Running",
        value: 32.4,
        valueText: "32.4 km",
        usual: 26,
        usualText: "26.0 km",
        detail: "3 runs · longest 14.2 km",
      },
    ]);
  });

  it("gives the food logged as whole numbers per logged day", () => {
    const { food } = performanceWeekBreakdown(
      { aggregates: AGG, baseline: BASE },
      KM
    );
    expect(food).toEqual({
      daysLogged: 6,
      caloriesPerDay: 2184,
      proteinPerDay: 148,
    });
  });

  it("offers no usual week while the score is establishing", () => {
    const { measures } = performanceWeekBreakdown(
      { aggregates: AGG, baseline: BASE },
      { ...KM, establishing: true }
    );
    expect(measures.map((m) => m.usual)).toEqual([null, null]);
    expect(measures.map((m) => m.usualText)).toEqual([null, null]);
  });

  it(`needs ${USUAL_WEEK_MIN_WEEKS} active weeks before one is the usual week`, () => {
    const one = performanceWeekBreakdown(
      { aggregates: AGG, baseline: { ...BASE, weeksUsed: 1 } },
      KM
    );
    expect(one.measures.every((m) => m.usual === null)).toBe(true);
    const two = performanceWeekBreakdown(
      { aggregates: AGG, baseline: { ...BASE, weeksUsed: 2 } },
      KM
    );
    expect(two.measures.every((m) => m.usual !== null)).toBe(true);
  });

  it("says so when a discipline the user usually trains was skipped", () => {
    const { measures } = performanceWeekBreakdown(
      {
        aggregates: { ...AGG, runSessions: 0, runKm: 0, runLongKm: 0 },
        baseline: BASE,
      },
      KM
    );
    const running = measures.find((m) => m.key === "running")!;
    expect(running.valueText).toBe("0.0 km");
    expect(running.detail).toBe("No runs in these 7 days");
    expect(running.usualText).toBe("26.0 km");
  });

  it("says nothing about a discipline the user does not train", () => {
    const { measures } = performanceWeekBreakdown(
      {
        aggregates: { ...AGG, runSessions: 0, runKm: 0, runLongKm: 0 },
        baseline: { ...BASE, runKm: 0 },
      },
      KM
    );
    expect(measures.map((m) => m.key)).toEqual(["lifting"]);
  });

  it("keeps the longest run to weeks with more than one", () => {
    // One run is its own longest; saying so twice is noise.
    const { measures } = performanceWeekBreakdown(
      {
        aggregates: { ...AGG, runSessions: 1, runKm: 8, runLongKm: 8 },
        baseline: BASE,
      },
      KM
    );
    expect(measures.find((m) => m.key === "running")!.detail).toBe("1 run");
  });

  it("writes running in the reader's unit", () => {
    const { measures } = performanceWeekBreakdown(
      { aggregates: AGG, baseline: BASE },
      { ...KM, distanceUnit: "mi" }
    );
    const running = measures.find((m) => m.key === "running")!;
    expect(running.valueText).toBe("20.1 mi");
    expect(running.usualText).toBe("16.2 mi");
    expect(running.detail).toBe("3 runs · longest 8.8 mi");
    // The bar compares like with like.
    expect(running.value).toBeCloseTo(20.13, 1);
    expect(running.usual).toBeCloseTo(16.16, 1);
  });

  it("has no food line without a logged day, and caps days at seven", () => {
    expect(
      performanceWeekBreakdown(
        { aggregates: { ...AGG, mealDaysLogged: 0 }, baseline: BASE },
        KM
      ).food
    ).toBeNull();
    expect(
      performanceWeekBreakdown(
        { aggregates: { ...AGG, mealDaysLogged: 9 }, baseline: BASE },
        KM
      ).food?.daysLogged
    ).toBe(7);
  });

  it("reads a legacy document with no aggregates as nothing to say", () => {
    expect(performanceWeekBreakdown({}, KM)).toEqual({
      measures: [],
      food: null,
    });
    expect(
      performanceWeekBreakdown(
        { aggregates: { liftSessions: Number.NaN }, baseline: null },
        KM
      )
    ).toEqual({ measures: [], food: null });
  });
});
