/**
 * The weekly review email says what the review page says (App1 Q55).
 *
 * functions/lib/weeklyReviewEmail.js counts a week's food days and names
 * its dates on the server; the review page counts them in
 * `useWeeklyReview` (a day's active meals, summed, against `isFoodDay`)
 * and names them with `formatWeekRange`. If the two drifted, Monday's email
 * would say "food on 5 of 7 days" over a review that says 4.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { isActiveMealDoc } from "@/lib/mealTotals";
import { isFoodDay } from "@/lib/foodDay";
import { formatWeekRange } from "@/lib/weeklyReviewViewModel";

const require = createRequire(import.meta.url);
const server = require("../../../functions/lib/weeklyReviewEmail.js");

type Meal = { date?: unknown; totalCalories?: unknown; deletedAt?: unknown };

/** The review page's count: useWeeklyReview's day totals, then isFoodDay. */
function reviewFoodDays(meals: Meal[], start: string, end: string): number {
  const byDay = new Map<string, number>();
  for (const m of meals) {
    if (!isActiveMealDoc(m)) continue;
    if (typeof m.date !== "string") continue;
    if (m.date < start || m.date > end) continue;
    const cals = typeof m.totalCalories === "number" ? m.totalCalories : 0;
    byDay.set(m.date, (byDay.get(m.date) || 0) + cals);
  }
  return [...byDay.values()].filter((calories) => isFoodDay(calories)).length;
}

const WEEK = { start: "2026-11-09", end: "2026-11-15" };

describe("the weekly review email and the review page agree", () => {
  it("on the week's food days", () => {
    const cases: Meal[][] = [
      [],
      [{ date: "2026-11-09", totalCalories: 800 }],
      [{ date: "2026-11-09", totalCalories: 799 }],
      [
        { date: "2026-11-09", totalCalories: 400 },
        { date: "2026-11-09", totalCalories: 400 },
      ],
      [
        { date: "2026-11-10", totalCalories: 2000, deletedAt: { seconds: 1 } },
        { date: "2026-11-11", totalCalories: "2000" },
        { date: "2026-11-12", totalCalories: 1500 },
        { totalCalories: 3000 },
        { date: "2026-11-16", totalCalories: 3000 },
        { date: "2026-11-08", totalCalories: 3000 },
      ],
      Array.from({ length: 7 }, (_, i) => ({
        date: `2026-11-${String(9 + i).padStart(2, "0")}`,
        totalCalories: 1800,
      })),
    ];
    const counts = cases.map((meals) => {
      const email = server.foodDaysIn(meals, WEEK);
      expect(email, JSON.stringify(meals)).toBe(
        reviewFoodDays(meals, WEEK.start, WEEK.end)
      );
      return email;
    });
    // Anchor: the cases reach every count from none to a full week.
    expect(Math.max(...counts)).toBe(7);
    expect(counts).toContain(0);
  });

  it("on how the week's dates are written", () => {
    for (const week of [
      WEEK,
      { start: "2026-11-30", end: "2026-12-06" },
      { start: "2026-12-28", end: "2027-01-03" },
      { start: "2026-08-31", end: "2026-09-06" },
    ]) {
      expect(server.weekRangeLabel(week)).toBe(
        formatWeekRange(week.start, week.end)
      );
    }
  });
});
