/**
 * The client's copy of the badge rules (badgeEarning.ts), which the app
 * draws progress rings from. Every badge is awarded by the server (App1
 * Q33): the award rules are functions/lib/badgeRules.js, tested in
 * functions/__tests__/badgeRules.test.js (where the cases that lived here
 * went), and badgeRules.cross.test.ts pins these helpers to them.
 */
import { describe, it, expect } from "vitest";
import {
  activeDayCounts,
  maxConsecutiveDayRun,
  earnedBadgeCount,
} from "../badgeEarning";

// Local-midday anchor so date-fns `format` (local) is tz-stable in the test.
const TODAY = new Date(2026, 4, 20, 12, 0, 0); // 2026-05-20

describe("activeDayCounts", () => {
  it("counts distinct lift and run days in the window ending today", () => {
    expect(
      activeDayCounts(
        [
          { date: "2026-05-20" },
          { date: "2026-05-20" },
          { date: "2026-05-14" },
        ],
        [{ day: "2026-05-19" }, { day: "2026-05-13" }],
        TODAY,
        7
      )
    ).toEqual({ liftDays: 2, runDays: 1 });
  });

  it("counts a run on the day it started, not the day it finished (Lift3)", () => {
    expect(
      activeDayCounts([], [{ day: "2026-05-07" }], TODAY, 14).runDays
    ).toBe(1);
    expect(
      activeDayCounts([], [{ day: "2026-05-06" }], TODAY, 14).runDays
    ).toBe(0);
  });
});

// N consecutive YYYY-MM-DD keys ending on `end` (inclusive), oldest-first.
function consecutiveDates(end: string, n: number): string[] {
  const out: string[] = [];
  const cursor = new Date(end + "T12:00:00");
  for (let i = 0; i < n; i++) {
    out.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(
        cursor.getDate()
      ).padStart(2, "0")}`
    );
    cursor.setDate(cursor.getDate() - 1);
  }
  return out.reverse();
}

describe("maxConsecutiveDayRun", () => {
  it("is 0 for an empty list", () => {
    expect(maxConsecutiveDayRun([])).toBe(0);
  });

  it("counts a single day as a run of 1", () => {
    expect(maxConsecutiveDayRun(["2026-05-20"])).toBe(1);
  });

  it("counts a clean consecutive run", () => {
    expect(maxConsecutiveDayRun(consecutiveDates("2026-05-20", 14))).toBe(14);
  });

  it("resets on a gap and returns the LONGEST run, not the latest", () => {
    const dates = [
      ...consecutiveDates("2026-05-10", 5), // run of 5
      // gap
      ...consecutiveDates("2026-05-20", 3), // run of 3
    ];
    expect(maxConsecutiveDayRun(dates)).toBe(5);
  });

  it("dedupes + sorts unordered input with duplicates", () => {
    expect(
      maxConsecutiveDayRun([
        "2026-05-03",
        "2026-05-01",
        "2026-05-02",
        "2026-05-02",
      ])
    ).toBe(3);
  });

  it("survives a month boundary (calendar-day adjacency, not +1 date math)", () => {
    expect(
      maxConsecutiveDayRun(["2026-04-29", "2026-04-30", "2026-05-01"])
    ).toBe(3);
  });
});

describe("earnedBadgeCount", () => {
  it("counts earned badges but EXCLUDES ultimate_athlete itself", () => {
    const badges = [
      { id: "a", earnedAt: "x" },
      { id: "b", earnedAt: "x" },
      { id: "ultimate_athlete", earnedAt: "x" },
      { id: "c", earnedAt: null },
    ];
    expect(earnedBadgeCount(badges)).toBe(2);
  });
});
