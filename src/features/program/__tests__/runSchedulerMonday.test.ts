import { describe, expect, it } from "vitest";
import { generateRacePlanV2, scheduleRecoveryWeekV2 } from "../runScheduler";
import { localWeekKey, parseLocalDate } from "@/lib/dateHelpers";
import type { ScheduleDay } from "@/lib/scheduleUtils";

const schedule: ScheduleDay[] = Array.from({ length: 7 }, (_, day) => ({
  day,
  type: [2, 4, 6].includes(day) ? "run" : "rest",
}));

describe("Monday calendar scheduling", () => {
  // Block lengths are calendar weeks from the week containing `weekStart`
  // through the race's week: Tue 29 Sep is in the week of Mon 28 Sep, the
  // fourth week from Mon 7 Sep. (This pinned 3 — `ceil(20 / 7)` from the
  // Wednesday — while the count still ran from `currentDate`.)
  it.each([
    ["2026-09-13", 1],
    ["2026-09-14", 2],
    ["2026-09-29", 4],
  ])(
    "keeps the race on %s, with the correct weekday",
    (targetDate, totalWeeks) => {
      const plan = generateRacePlanV2({
        currentDate: "2026-09-09",
        weekStart: "2026-09-07",
        raceGoal: { distance: "10k", targetDate },
        weeklyRunDays: 3,
        recentLayoff: "none",
        weekSchedule: schedule,
      });
      expect(plan.totalWeeks).toBe(totalWeeks);
      const final = plan.weeks.at(-1)!;
      expect(final.filter((rd) => rd.type === "race")).toHaveLength(1);
      expect(final.find((rd) => rd.type === "race")?.date).toBe(targetDate);
      expect(final.every((rd) => rd.date! <= targetDate)).toBe(true);
      expect(new Set(final.map((rd) => rd.weekKey))).toEqual(
        new Set([localWeekKey(parseLocalDate(targetDate))])
      );
      for (const week of plan.weeks) {
        for (const rd of week) {
          expect(rd.dayIndex).toBe(parseLocalDate(rd.date!).getDay());
          expect(rd.weekKey).toBe(localWeekKey(parseLocalDate(rd.date!)));
        }
      }
    }
  );

  it("places recovery runs on the selected weekdays through the DST weekend", () => {
    const week = scheduleRecoveryWeekV2({
      weekStart: "2026-03-23",
      weekSchedule: [
        { day: 0, type: "run" },
        { day: 1, type: "run" },
        { day: 4, type: "run" },
      ],
    });
    expect(week.map((rd) => rd.date)).toEqual([
      "2026-03-23",
      "2026-03-26",
      "2026-03-29",
    ]);
    expect(week.map((rd) => rd.dayIndex)).toEqual([1, 4, 0]);
  });
});

// A race exactly N weeks out on a Monday is the case a DST hour can turn
// into a missing week: the two local midnights are 7N days ± 1h apart, and
// elapsed-time arithmetic floors the spring-forward side to N-1. The
// expected block is N+1 calendar weeks (the race's week is its own, with
// the race alone in it); the autumn pairs pinned 2 while the count still ran
// from `currentDate`.
it.each([
  ["Europe/London", "2026-03-23", "2026-03-25", "2026-03-30", 2],
  ["America/Los_Angeles", "2026-03-02", "2026-03-04", "2026-03-09", 2],
  ["Europe/London", "2026-10-19", "2026-10-19", "2026-11-02", 3],
  ["America/Los_Angeles", "2026-10-26", "2026-10-26", "2026-11-09", 3],
])(
  "counts local calendar weeks across DST in %s (%s)",
  (zone, weekStart, currentDate, targetDate, totalWeeks) => {
    const previous = process.env.TZ;
    try {
      process.env.TZ = zone;
      const plan = generateRacePlanV2({
        currentDate,
        weekStart,
        raceGoal: { distance: "10k", targetDate },
        weeklyRunDays: 3,
        recentLayoff: "none",
        weekSchedule: schedule,
      });
      expect(plan.totalWeeks).toBe(totalWeeks);
      expect(plan.weeks.at(-1)?.map((rd) => rd.date)).toEqual([targetDate]);
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  }
);
