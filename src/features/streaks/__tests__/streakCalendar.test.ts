/**
 * The streak sheet's month (Mob1 call 4): logged days, covered days and
 * the rest, each with the words a screen reader says, and the one line of
 * reassurance after a covered day.
 */
import { describe, it, expect } from "vitest";
import {
  coveredDayLine,
  earliestStreakMonth,
  monthOf,
  streakMonth,
} from "../streakCalendar";

const TODAY = "2026-10-27"; // a Tuesday

describe("streakMonth", () => {
  const month = streakMonth(
    monthOf(TODAY),
    new Set(["2026-10-24", "2026-10-26", "2026-10-27"]),
    ["2026-10-25"],
    TODAY
  );
  const day = (date: number) => month.days[date - 1];

  it("is the whole month, titled in full, from a Monday", () => {
    expect(month.title).toBe("October 2026");
    expect(month.days).toHaveLength(31);
    // 1 October 2026 is a Thursday: three blanks before it.
    expect(month.leadingBlanks).toBe(3);
  });

  it("marks logged, covered and nothing-logged days, in en-GB words", () => {
    expect(day(24)).toMatchObject({
      state: "logged",
      label: "Saturday 24 October, logged",
    });
    expect(day(25)).toMatchObject({
      state: "covered",
      label: "Sunday 25 October, covered",
    });
    expect(day(23)).toMatchObject({
      state: "none",
      label: "Friday 23 October, nothing logged",
    });
  });

  it("says today is today, and marks nothing ahead of it", () => {
    expect(day(27)).toMatchObject({
      state: "logged",
      isToday: true,
      label: "Tuesday 27 October, today, logged",
    });
    expect(day(28)).toMatchObject({
      state: "ahead",
      label: "Wednesday 28 October",
    });
  });

  it("says nothing about today before anything is logged: no at-risk day", () => {
    const quiet = streakMonth(monthOf(TODAY), new Set(), [], TODAY);
    expect(quiet.days[26]).toMatchObject({
      state: "ahead",
      label: "Tuesday 27 October, today",
    });
  });
});

describe("earliestStreakMonth", () => {
  it("is the month the streak's reads reach back to", () => {
    const earliest = earliestStreakMonth(TODAY, 90);
    expect([
      earliest.getFullYear(),
      earliest.getMonth(),
      earliest.getDate(),
    ]).toEqual([2026, 6, 1]);
  });
});

describe("coveredDayLine", () => {
  it("says yesterday's rest day is covered, in Streak1's words", () => {
    expect(coveredDayLine(["2026-10-26"], 12, TODAY)).toBe(
      "Yesterday's rest day is covered. Still on a 12-day streak."
    );
  });

  it("names an older covered day by its date", () => {
    expect(coveredDayLine(["2026-10-20", "2026-10-13"], 15, TODAY)).toBe(
      "Tuesday 20 October was a rest day, and it's covered."
    );
  });

  it("is nothing without a covered day", () => {
    expect(coveredDayLine([], 12, TODAY)).toBeNull();
  });
});
