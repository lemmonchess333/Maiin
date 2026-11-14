import { describe, it, expect } from "vitest";
import { summariseWeek } from "../weekSummary";
import type { TrainingWeek } from "../trainingWeek";

/**
 * Home's "This week" card. Lifts and runs are the week every screen counts
 * (`trainingWeek`, tested there); this adds the week's food days
 * (`foodDay.ts`).
 */

/* The week of Monday 21 September 2026. */
const training: TrainingWeek = {
  weekKey: "2026-09-21",
  lifts: { done: 2, planned: 3 },
  runs: { done: 1, planned: 2, km: 5 },
};

const NO_MEALS = new Map<string, number>();

describe("summariseWeek", () => {
  it("carries the week's lifts and runs as they are counted everywhere", () => {
    const counts = summariseWeek({ training, caloriesByDate: NO_MEALS });
    expect(counts.lifts).toEqual({ done: 2, planned: 3 });
    expect(counts.runs).toEqual({ done: 1, planned: 2 });
  });

  it("counts the food days, 800 kcal or more, out of the seven", () => {
    const counts = summariseWeek({
      training,
      caloriesByDate: new Map([
        ["2026-09-21", 2400],
        // A coffee and nothing else is not a day of eating.
        ["2026-09-22", 120],
        ["2026-09-23", 800],
        ["2026-09-24", 799],
        // The Monday after: not this week.
        ["2026-09-28", 2600],
      ]),
    });
    expect(counts.foodDays).toBe(2);
    expect(counts.foodDayTotal).toBe(7);
  });

  it("has no food count while the meals are not known", () => {
    const counts = summariseWeek({ training, caloriesByDate: null });
    expect(counts.foodDays).toBeNull();
    expect(counts.foodDayTotal).toBe(7);
  });
});

describe("summariseWeek — the week the account began", () => {
  it("counts the food days from the start day", () => {
    // Joined on the Friday (25th) of a Monday 21st week.
    const counts = summariseWeek({
      training,
      caloriesByDate: NO_MEALS,
      startKey: "2026-09-25",
    });
    expect(counts.foodDayTotal).toBe(3);
  });

  it("is the whole week without a start day, or after the first week", () => {
    expect(
      summariseWeek({ training, caloriesByDate: NO_MEALS }).foodDayTotal
    ).toBe(7);
    expect(
      summariseWeek({
        training,
        caloriesByDate: NO_MEALS,
        startKey: "2026-09-01",
      }).foodDayTotal
    ).toBe(7);
  });
});
