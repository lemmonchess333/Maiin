import { describe, expect, it } from "vitest";
import { homeMealsWindow } from "../homeMealsWindow";
import { addLocalDays, localDateString, localWeekKey } from "../dateHelpers";
import { weekDays } from "../trainingWeek";

/* Derived from the clock, not dated: the window follows today's week. */
const today = new Date();
const week = localWeekKey(today);
const [monday, , , , , , sunday] = weekDays(week);
const daysAgo = (n: number) => localDateString(addLocalDays(today, -n));

describe("homeMealsWindow", () => {
  it("is the current week for an account past its first fortnight", () => {
    expect(homeMealsWindow(week, daysAgo(40), today)).toEqual({
      from: monday,
      to: sunday,
    });
  });

  it("reaches back to the day a new account began", () => {
    const begun = daysAgo(10);
    const window = homeMealsWindow(week, begun, today);
    expect(window.to).toBe(sunday);
    expect(window.from).toBe(begun < monday ? begun : monday);
  });

  it("never reaches past the fortnight, nor without a start day", () => {
    expect(homeMealsWindow(week, daysAgo(15), today).from).toBe(monday);
    expect(homeMealsWindow(week, null, today).from).toBe(monday);
  });
});
