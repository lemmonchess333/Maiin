import { describe, it, expect } from "vitest";
import { summariseWeek } from "../weekSummary";

type Kind = "lift" | "run" | "both" | "rest";

function week(
  kinds: Kind[],
  runsDone: boolean[] = []
): {
  dateKey: string;
  scheduleType: Kind;
  run: { isCompleted: boolean };
}[] {
  return kinds.map((scheduleType, i) => ({
    dateKey: `2026-09-${String(21 + i).padStart(2, "0")}`,
    scheduleType,
    run: { isCompleted: runsDone[i] ?? false },
  }));
}

const NONE = new Map<string, never[]>();
const NO_MEALS = new Map<string, { meals: number }>();

describe("summariseWeek", () => {
  it("counts planned lift and run days, with a both day in each", () => {
    const counts = summariseWeek({
      window: week(["lift", "run", "both", "rest", "lift", "run", "rest"]),
      liftDates: [],
      extraRunsByDate: NONE,
      mealsByDate: NO_MEALS,
    });
    expect(counts.lifts.planned).toBe(3);
    expect(counts.runs.planned).toBe(3);
  });

  it("counts every lift logged this week, planned day or not", () => {
    // A lift logged on a rest day happened; the column says so.
    const counts = summariseWeek({
      window: week(["lift", "rest", "lift", "rest", "rest", "rest", "rest"]),
      liftDates: ["2026-09-21", "2026-09-22", "2026-09-22"],
      extraRunsByDate: NONE,
      mealsByDate: NO_MEALS,
    });
    expect(counts.lifts).toEqual({ done: 3, planned: 2 });
  });

  it("leaves out lifts logged outside the week", () => {
    const counts = summariseWeek({
      window: week(["lift", "rest", "rest", "rest", "rest", "rest", "rest"]),
      liftDates: ["2026-09-20", "2026-09-21", "2026-09-28"],
      extraRunsByDate: NONE,
      mealsByDate: NO_MEALS,
    });
    expect(counts.lifts.done).toBe(1);
  });

  it("counts completed planned runs and runs that matched no planned day", () => {
    const counts = summariseWeek({
      window: week(
        ["run", "rest", "run", "rest", "run", "rest", "rest"],
        [true, false, false, false, true]
      ),
      liftDates: [],
      extraRunsByDate: new Map([
        ["2026-09-22", [{}]],
        ["2026-09-27", [{}, {}]],
        // A day outside the window contributes nothing.
        ["2026-09-28", [{}]],
      ]),
      mealsByDate: NO_MEALS,
    });
    expect(counts.runs).toEqual({ done: 5, planned: 3 });
  });

  it("counts days with at least one meal, out of the seven", () => {
    const counts = summariseWeek({
      window: week(["rest", "rest", "rest", "rest", "rest", "rest", "rest"]),
      liftDates: [],
      extraRunsByDate: NONE,
      mealsByDate: new Map([
        ["2026-09-21", { meals: 3 }],
        ["2026-09-22", { meals: 0 }],
        ["2026-09-23", { meals: 1 }],
        ["2026-09-30", { meals: 4 }],
      ]),
    });
    expect(counts.foodDays).toBe(2);
  });
});
