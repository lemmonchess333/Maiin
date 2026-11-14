/**
 * Lifetime food days from an older read with the live window over it.
 *
 * The rules that keep the tile right without reading every meal again: the
 * window wins for a meal it holds, and a meal it does not hold is left as
 * it was read, because a window that stops at the newest few hundred says
 * nothing about anything older.
 */
import { describe, expect, it } from "vitest";
import {
  lifetimeMealStats,
  mealDay,
  overlayWindow,
  type MealDay,
} from "../lifetimeMealDays";

const older = (entries: Record<string, MealDay>) =>
  new Map(Object.entries(entries));
/** A meal of a whole day's eating, so each day here is a food day. */
const kept = (date: string, calories = 2000): MealDay => ({
  date,
  calories,
  kept: true,
});
const binned = (date: string, calories = 2000): MealDay => ({
  date,
  calories,
  kept: false,
});

describe("mealDay", () => {
  it("reads a stored meal's day, its calories and that it was kept", () => {
    expect(mealDay({ date: "2026-03-01", totalCalories: 2000 })).toEqual(
      kept("2026-03-01")
    );
  });

  it("reads an older meal's bare calories", () => {
    expect(mealDay({ date: "2026-03-01", calories: 650 })).toEqual(
      kept("2026-03-01", 650)
    );
  });

  it("a soft-deleted meal is not kept", () => {
    expect(
      mealDay({
        date: "2026-03-01",
        totalCalories: 2000,
        deletedAt: new Date(),
      })
    ).toEqual(binned("2026-03-01"));
  });

  it("a meal with no usable date still counts as a meal, on no day", () => {
    expect(mealDay({ date: 20260301 })).toEqual({
      date: null,
      calories: 0,
      kept: true,
    });
  });
});

describe("lifetimeMealStats", () => {
  it("counts kept meals and the distinct days they fall on", () => {
    const stats = lifetimeMealStats(
      older({
        a: kept("2026-03-01"),
        b: kept("2026-03-01"),
        c: kept("2026-03-02"),
        d: binned("2026-03-03"),
        e: { date: null, calories: 2000, kept: true },
      })
    );
    expect(stats).toEqual({ mealCount: 4, daysLogged: 2 });
  });

  it("counts a day once its kept meals reach 800 kcal, a food day", () => {
    const stats = lifetimeMealStats(
      older({
        a: kept("2026-03-01", 500),
        b: kept("2026-03-01", 300),
        // A coffee and nothing else is not a day of eating.
        c: kept("2026-03-02", 120),
        d: kept("2026-03-03", 799),
        e: binned("2026-03-03", 400),
      })
    );
    expect(stats).toEqual({ mealCount: 4, daysLogged: 1 });
  });

  it("is zero for nothing", () => {
    expect(lifetimeMealStats(new Map())).toEqual({
      mealCount: 0,
      daysLogged: 0,
    });
  });
});

describe("overlayWindow", () => {
  it("adds a meal logged since the older read", () => {
    const all = overlayWindow(
      older({ a: kept("2026-03-01") }),
      [{ id: "new", date: "2026-03-05", totalCalories: 2000 }],
      []
    );
    expect(lifetimeMealStats(all)).toEqual({ mealCount: 2, daysLogged: 2 });
  });

  it("stops counting a meal binned since: its day goes if it was the only one", () => {
    const all = overlayWindow(
      older({ a: kept("2026-03-01"), b: kept("2026-03-02") }),
      [],
      [{ id: "b", date: "2026-03-02", totalCalories: 2000 }]
    );
    expect(lifetimeMealStats(all)).toEqual({ mealCount: 1, daysLogged: 1 });
  });

  it("counts a meal restored since", () => {
    const all = overlayWindow(
      older({ a: binned("2026-03-01") }),
      [{ id: "a", date: "2026-03-01", totalCalories: 2000 }],
      []
    );
    expect(lifetimeMealStats(all)).toEqual({ mealCount: 1, daysLogged: 1 });
  });

  it("follows a meal moved to another day", () => {
    const all = overlayWindow(
      older({ a: kept("2026-03-01") }),
      [{ id: "a", date: "2026-03-04", totalCalories: 2000 }],
      []
    );
    expect([...all.values()]).toEqual([kept("2026-03-04")]);
  });

  it("leaves a meal the window does not hold as it was read", () => {
    // Absence from the newest few hundred is not evidence a meal is gone.
    const all = overlayWindow(
      older({ old: kept("2024-01-01") }),
      [{ id: "new", date: "2026-03-05", totalCalories: 2000 }],
      []
    );
    expect(all.get("old")).toEqual(kept("2024-01-01"));
  });

  it("does not change the older read it was given", () => {
    const before = older({ a: kept("2026-03-01") });
    overlayWindow(
      before,
      [],
      [{ id: "a", date: "2026-03-01", totalCalories: 2000 }]
    );
    expect(before.get("a")).toEqual(kept("2026-03-01"));
  });
});
