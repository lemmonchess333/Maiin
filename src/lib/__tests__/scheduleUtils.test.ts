import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateSchedule,
  getTodaySchedule,
  countByType,
  liftIndexForDayOfWeek,
  isValidWeekSchedule,
  type ScheduleDay,
} from "../scheduleUtils";

describe("generateSchedule", () => {
  it("returns 7 days all rest when liftDays=0, runDays=0", () => {
    const schedule = generateSchedule(0, 0);
    expect(schedule).toHaveLength(7);
    expect(schedule.every((d) => d.type === "rest")).toBe(true);
  });

  it("assigns days 0-6 in order", () => {
    const schedule = generateSchedule(0, 0);
    schedule.forEach((d, i) => {
      expect(d.day).toBe(i);
    });
  });

  it("handles 3 lift, 2 run — alternates lift/run in priority slots", () => {
    const schedule = generateSchedule(3, 2);
    // Pattern: lift, run, lift, run, lift
    // Slot order: [1, 3, 5, 2, 4, 6, 0]
    // So: day1=lift, day3=run, day5=lift, day2=run, day4=lift
    expect(schedule[1].type).toBe("lift");
    expect(schedule[3].type).toBe("run");
    expect(schedule[5].type).toBe("lift");
    expect(schedule[2].type).toBe("run");
    expect(schedule[4].type).toBe("lift");
    expect(schedule[6].type).toBe("rest");
    expect(schedule[0].type).toBe("rest");
  });

  it("handles 4 lift, 0 run", () => {
    const schedule = generateSchedule(4, 0);
    // Pattern: lift, lift, lift, lift
    // Slot order: [1, 3, 5, 2]
    expect(schedule[1].type).toBe("lift");
    expect(schedule[3].type).toBe("lift");
    expect(schedule[5].type).toBe("lift");
    expect(schedule[2].type).toBe("lift");
    expect(schedule[4].type).toBe("rest");
    expect(schedule[6].type).toBe("rest");
    expect(schedule[0].type).toBe("rest");
  });

  it("handles 0 lift, 3 run", () => {
    const schedule = generateSchedule(0, 3);
    // Pattern: run, run, run
    // Slot order: [1, 3, 5]
    expect(schedule[1].type).toBe("run");
    expect(schedule[3].type).toBe("run");
    expect(schedule[5].type).toBe("run");
    expect(schedule[2].type).toBe("rest");
    expect(schedule[4].type).toBe("rest");
  });

  it("handles 3 lift, 3 run — fills 6 days", () => {
    const schedule = generateSchedule(3, 3);
    // Pattern: lift, run, lift, run, lift, run
    // Slots: day1=lift, day3=run, day5=lift, day2=run, day4=lift, day6=run
    expect(schedule[1].type).toBe("lift");
    expect(schedule[3].type).toBe("run");
    expect(schedule[5].type).toBe("lift");
    expect(schedule[2].type).toBe("run");
    expect(schedule[4].type).toBe("lift");
    expect(schedule[6].type).toBe("run");
    expect(schedule[0].type).toBe("rest");
  });

  it("handles 1 lift, 1 run", () => {
    const schedule = generateSchedule(1, 1);
    // Pattern: lift, run
    // Slots: day1=lift, day3=run
    expect(schedule[1].type).toBe("lift");
    expect(schedule[3].type).toBe("run");
    const restCount = schedule.filter((d) => d.type === "rest").length;
    expect(restCount).toBe(5);
  });

  it("handles maximum 7 active days (4 lift, 3 run)", () => {
    const schedule = generateSchedule(4, 3);
    // Pattern: lift, run, lift, run, lift, run, lift
    // Slots: day1=lift, day3=run, day5=lift, day2=run, day4=lift, day6=run, day0=lift
    expect(schedule[1].type).toBe("lift");
    expect(schedule[3].type).toBe("run");
    expect(schedule[5].type).toBe("lift");
    expect(schedule[2].type).toBe("run");
    expect(schedule[4].type).toBe("lift");
    expect(schedule[6].type).toBe("run");
    expect(schedule[0].type).toBe("lift");
  });

  it("does not exceed 7 slots even if lift+run > 7 (now uses Both days, P0-B)", () => {
    const schedule = generateSchedule(5, 5);
    expect(schedule).toHaveLength(7);
    // P0-B: previously truncated silently. Now uses "both" days to
    // preserve every requested session.
    const counts = countByType(schedule);
    expect(counts.lift + counts.both).toBe(5); // total lift exposure
    expect(counts.run + counts.both).toBe(5);  // total run exposure
    expect(counts.both).toBeGreaterThanOrEqual(1);
    expect(counts.rest).toBe(0);
  });

  it("handles 1 lift, 0 run — single lift day on Monday", () => {
    const schedule = generateSchedule(1, 0);
    expect(schedule[1].type).toBe("lift");
    const restCount = schedule.filter((d) => d.type === "rest").length;
    expect(restCount).toBe(6);
  });
});

describe("getTodaySchedule", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the correct ScheduleDay for the current day of the week", () => {
    // Set date to a Wednesday (day 3)
    vi.setSystemTime(new Date("2026-03-11T12:00:00")); // Wednesday
    const schedule = generateSchedule(3, 2);
    const today = getTodaySchedule(schedule);
    expect(today).not.toBeNull();
    expect(today!.day).toBe(3);
    expect(today!.type).toBe(schedule[3].type);
  });

  it("returns the Sunday entry when today is Sunday", () => {
    vi.setSystemTime(new Date("2026-03-15T12:00:00")); // Sunday
    const schedule = generateSchedule(3, 2);
    const today = getTodaySchedule(schedule);
    expect(today).not.toBeNull();
    expect(today!.day).toBe(0);
  });

  it("returns null if no matching day in schedule", () => {
    const partial: ScheduleDay[] = [
      { day: 1, type: "lift" },
      { day: 2, type: "run" },
    ];
    // Set to Wednesday (3) which isn't in the partial schedule
    vi.setSystemTime(new Date("2026-03-11T12:00:00"));
    expect(getTodaySchedule(partial)).toBeNull();
  });

  it("returns null for empty schedule", () => {
    vi.setSystemTime(new Date("2026-03-11T12:00:00"));
    expect(getTodaySchedule([])).toBeNull();
  });
});

describe("generateSchedule · P0-B Both-day support", () => {
  // The headline acceptance test from the spec. Pre-P0-B, this case
  // silently truncated one session. Now it produces a "both" day.
  it("generateSchedule(6, 2) → 6 lift exposures + 2 run exposures + ≥1 both, no truncation", () => {
    const schedule = generateSchedule(6, 2);
    const counts = countByType(schedule);
    expect(counts.lift + counts.both).toBe(6);
    expect(counts.run + counts.both).toBe(2);
    expect(counts.both).toBeGreaterThanOrEqual(1);
    expect(counts.rest).toBe(7 - 6 - 1); // 0
    expect(schedule).toHaveLength(7);
  });

  it("generateSchedule(4, 2) → no forced doubles (total fits in 7)", () => {
    const schedule = generateSchedule(4, 2);
    const counts = countByType(schedule);
    expect(counts.both).toBe(0);
    expect(counts.lift).toBe(4);
    expect(counts.run).toBe(2);
    expect(counts.rest).toBe(1);
  });

  it("generateSchedule(7, 7) → 7 both days, full hybrid week", () => {
    const schedule = generateSchedule(7, 7);
    const counts = countByType(schedule);
    expect(counts.both).toBe(7);
    expect(counts.lift).toBe(0); // all consumed by 'both'
    expect(counts.run).toBe(0);
    expect(counts.rest).toBe(0);
  });

  it("generateSchedule(5, 4) → 2 both + 3 lift + 2 run + 0 rest", () => {
    const schedule = generateSchedule(5, 4);
    const counts = countByType(schedule);
    expect(counts.both).toBe(2);            // total - 7 = 9 - 7
    expect(counts.lift).toBe(3);            // 5 - 2
    expect(counts.run).toBe(2);             // 4 - 2
    expect(counts.rest).toBe(0);
    // exposure check
    expect(counts.lift + counts.both).toBe(5);
    expect(counts.run + counts.both).toBe(4);
  });

  it("generateSchedule(6, 4) → 3 both + 3 lift + 1 run + 0 rest", () => {
    const schedule = generateSchedule(6, 4);
    const counts = countByType(schedule);
    expect(counts.both).toBe(3);
    expect(counts.lift).toBe(3);
    expect(counts.run).toBe(1);
    expect(counts.rest).toBe(0);
    expect(counts.lift + counts.both).toBe(6);
    expect(counts.run + counts.both).toBe(4);
  });

  it("places Both days in highest-priority slots (Mon/Wed/Fri preferred)", () => {
    const schedule = generateSchedule(6, 2);
    // 1 both day. Highest-priority slot is Mon (day=1).
    expect(schedule[1].type).toBe("both");
  });

  it("never produces a 'both' day when total ≤ 7", () => {
    for (let lift = 0; lift <= 7; lift++) {
      for (let run = 0; run <= 7 - lift; run++) {
        const schedule = generateSchedule(lift, run);
        const counts = countByType(schedule);
        expect(counts.both).toBe(0);
      }
    }
  });

  it("is idempotent — generating the same input twice produces identical schedules", () => {
    const a = generateSchedule(6, 2);
    const b = generateSchedule(6, 2);
    expect(a).toEqual(b);
  });

  it("handles degenerate single-modality overflow (0 lift, 8 runs) without crashing", () => {
    // No lift to pair with, so no Both days possible. Function should
    // cap at 7 days of runs rather than emitting negative restCount.
    const schedule = generateSchedule(0, 8);
    expect(schedule).toHaveLength(7);
    const counts = countByType(schedule);
    expect(counts.both).toBe(0);
    expect(counts.lift).toBe(0);
    // Either 7 runs (capped) or some mix — the key invariant is no crash and 7 days
    expect(counts.run + counts.rest).toBe(7);
  });

  it("handles degenerate single-modality overflow (8 lift, 0 runs) without crashing", () => {
    const schedule = generateSchedule(8, 0);
    expect(schedule).toHaveLength(7);
    const counts = countByType(schedule);
    expect(counts.both).toBe(0);
    expect(counts.run).toBe(0);
    expect(counts.lift + counts.rest).toBe(7);
  });

  it("returns valid 7-day schedule even at maximum hybrid (5 lift, 5 run)", () => {
    const schedule = generateSchedule(5, 5);
    expect(schedule).toHaveLength(7);
    const counts = countByType(schedule);
    expect(counts.both).toBe(3);            // 10 - 7
    expect(counts.lift).toBe(2);            // 5 - 3
    expect(counts.run).toBe(2);             // 5 - 3
    expect(counts.rest).toBe(0);
    // Lift + run exposure preserved
    expect(counts.lift + counts.both).toBe(5);
    expect(counts.run + counts.both).toBe(5);
  });
});

describe("countByType", () => {
  it("counts a typical 3 lift, 2 run schedule", () => {
    const schedule = generateSchedule(3, 2);
    const counts = countByType(schedule);
    expect(counts.lift).toBe(3);
    expect(counts.run).toBe(2);
    expect(counts.rest).toBe(2);
    expect(counts.both).toBe(0);
  });

  it("counts all rest when 0/0", () => {
    const schedule = generateSchedule(0, 0);
    const counts = countByType(schedule);
    expect(counts.rest).toBe(7);
    expect(counts.lift).toBe(0);
    expect(counts.run).toBe(0);
    expect(counts.both).toBe(0);
  });

  it("handles schedule with both type", () => {
    const schedule: ScheduleDay[] = [
      { day: 0, type: "rest" },
      { day: 1, type: "both" },
      { day: 2, type: "lift" },
      { day: 3, type: "run" },
      { day: 4, type: "both" },
      { day: 5, type: "lift" },
      { day: 6, type: "rest" },
    ];
    const counts = countByType(schedule);
    expect(counts.lift).toBe(2);
    expect(counts.run).toBe(1);
    expect(counts.both).toBe(2);
    expect(counts.rest).toBe(2);
  });

  it("handles empty schedule", () => {
    const counts = countByType([]);
    expect(counts.lift).toBe(0);
    expect(counts.run).toBe(0);
    expect(counts.both).toBe(0);
    expect(counts.rest).toBe(0);
  });

  it("counts 4 lift, 3 run filling all 7 days", () => {
    const schedule = generateSchedule(4, 3);
    const counts = countByType(schedule);
    expect(counts.lift).toBe(4);
    expect(counts.run).toBe(3);
    expect(counts.rest).toBe(0);
    expect(counts.both).toBe(0);
  });
});

describe("liftIndexForDayOfWeek", () => {
  // Pin the mapping the Today + Week tabs use to find today's
  // workouts[] entry. Regression here breaks completion state
  // + skip dispatch on Programme.

  it("maps the first lift day to workout index 0", () => {
    const schedule = generateSchedule(3, 2);
    const liftDays = schedule
      .filter((d) => d.type === "lift" || d.type === "both")
      .map((d) => d.day)
      .sort((a, b) => a - b);
    expect(liftIndexForDayOfWeek(schedule, liftDays[0])).toBe(0);
  });

  it("maps subsequent lift days incrementally", () => {
    const schedule = generateSchedule(3, 2);
    const liftDays = schedule
      .filter((d) => d.type === "lift" || d.type === "both")
      .map((d) => d.day)
      .sort((a, b) => a - b);
    expect(liftIndexForDayOfWeek(schedule, liftDays[1])).toBe(1);
    expect(liftIndexForDayOfWeek(schedule, liftDays[2])).toBe(2);
  });

  it("returns -1 for a rest day", () => {
    const schedule = generateSchedule(3, 2);
    const restDay = schedule.find((d) => d.type === "rest");
    expect(restDay).toBeDefined();
    expect(liftIndexForDayOfWeek(schedule, restDay!.day)).toBe(-1);
  });

  it("returns -1 for a run-only day (not lift+both)", () => {
    const schedule = generateSchedule(3, 2);
    const runOnlyDay = schedule.find((d) => d.type === "run");
    expect(runOnlyDay).toBeDefined();
    expect(liftIndexForDayOfWeek(schedule, runOnlyDay!.day)).toBe(-1);
  });

  it("counts a Both day as a lift slot", () => {
    // 5 lift + 4 run = 9 exposures, packs 2 into Both days.
    const schedule = generateSchedule(5, 4);
    const bothDay = schedule.find((d) => d.type === "both");
    expect(bothDay).toBeDefined();
    const idx = liftIndexForDayOfWeek(schedule, bothDay!.day);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(5);
  });

  it("returns -1 for a missing or wrong-length schedule", () => {
    expect(liftIndexForDayOfWeek(undefined, 1)).toBe(-1);
    expect(liftIndexForDayOfWeek(null, 1)).toBe(-1);
    expect(liftIndexForDayOfWeek([], 1)).toBe(-1);
    const tooShort: ScheduleDay[] = [{ day: 0, type: "lift" }];
    expect(liftIndexForDayOfWeek(tooShort, 0)).toBe(-1);
  });

  it("returns -1 for a day-of-week converted to rest", () => {
    const schedule = generateSchedule(3, 2);
    const modified = schedule.map((d) =>
      d.day === 3 ? { ...d, type: "rest" as const } : d,
    );
    expect(liftIndexForDayOfWeek(modified, 3)).toBe(-1);
  });
});

describe("isValidWeekSchedule", () => {
  // The narrower-than-length-7 validator that backs
  // backfillWeekScheduleIfMissing's regeneration trigger. Pre-
  // PR-0b-i a 7-entry array with duplicate days or unknown types
  // would slip through; this validator catches it.

  it("accepts the canonical week (days 0-6, valid types)", () => {
    expect(isValidWeekSchedule(generateSchedule(3, 2))).toBe(true);
  });

  it("rejects non-arrays", () => {
    expect(isValidWeekSchedule(null)).toBe(false);
    expect(isValidWeekSchedule(undefined)).toBe(false);
    expect(isValidWeekSchedule("not a schedule")).toBe(false);
    expect(isValidWeekSchedule({})).toBe(false);
    expect(isValidWeekSchedule(42)).toBe(false);
  });

  it("rejects wrong-length arrays", () => {
    expect(isValidWeekSchedule([])).toBe(false);
    expect(isValidWeekSchedule(generateSchedule(3, 2).slice(0, 6))).toBe(false);
    const tooMany = [...generateSchedule(3, 2), { day: 7, type: "rest" as const }];
    expect(isValidWeekSchedule(tooMany)).toBe(false);
  });

  it("rejects schedules with duplicate days", () => {
    const dup: ScheduleDay[] = [
      { day: 0, type: "rest" },
      { day: 0, type: "lift" }, // duplicate
      { day: 2, type: "run" },
      { day: 3, type: "lift" },
      { day: 4, type: "rest" },
      { day: 5, type: "lift" },
      { day: 1, type: "rest" },
    ];
    expect(isValidWeekSchedule(dup)).toBe(false);
  });

  it("rejects schedules with missing days (gap in 0..6)", () => {
    const gap: ScheduleDay[] = [
      { day: 0, type: "rest" },
      { day: 1, type: "lift" },
      { day: 2, type: "run" },
      // day 3 missing
      { day: 4, type: "rest" },
      { day: 5, type: "lift" },
      { day: 6, type: "rest" },
      { day: 7, type: "rest" as never }, // out of range
    ];
    expect(isValidWeekSchedule(gap)).toBe(false);
  });

  it("rejects schedules with unknown type strings", () => {
    const badType = [
      { day: 0, type: "rest" },
      { day: 1, type: "lift" },
      { day: 2, type: "run" },
      { day: 3, type: "long" as never }, // not in the enum
      { day: 4, type: "rest" },
      { day: 5, type: "lift" },
      { day: 6, type: "rest" },
    ];
    expect(isValidWeekSchedule(badType)).toBe(false);
  });

  it("rejects schedules with non-numeric or out-of-range day values", () => {
    const badDay = [
      { day: 0, type: "rest" },
      { day: 1, type: "lift" },
      { day: 2, type: "run" },
      { day: -1, type: "lift" as never }, // out of range
      { day: 4, type: "rest" },
      { day: 5, type: "lift" },
      { day: 6, type: "rest" },
    ];
    expect(isValidWeekSchedule(badDay)).toBe(false);
  });

  it("rejects schedules with malformed entries (non-object)", () => {
    const malformed = [
      { day: 0, type: "rest" },
      "not an entry" as never,
      { day: 2, type: "run" },
      { day: 3, type: "lift" },
      { day: 4, type: "rest" },
      { day: 5, type: "lift" },
      { day: 6, type: "rest" },
    ];
    expect(isValidWeekSchedule(malformed)).toBe(false);
  });
});
