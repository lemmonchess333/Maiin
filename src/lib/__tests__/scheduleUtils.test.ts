import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateSchedule,
  getTodaySchedule,
  countByType,
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

  it("does not exceed 7 slots even if lift+run > 7", () => {
    const schedule = generateSchedule(5, 5);
    expect(schedule).toHaveLength(7);
    // Only 7 slots available so only first 7 pattern entries are assigned
    const restCount = schedule.filter((d) => d.type === "rest").length;
    expect(restCount).toBe(0);
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
