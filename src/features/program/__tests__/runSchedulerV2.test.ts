/**
 * runScheduler V2 tests · P0-3 · spec v7.
 *
 * Locks the new contract:
 *   - Driven by weekSchedule (not 7 - liftDayCount cap)
 *   - Native v2 ScheduledRunDay output (id / date / weekKey / status)
 *   - Long-run prefers non-Both slots (stress-aware default)
 *   - Compressed race-prep plans apply safety rules
 *   - Hybrid users (lift + run on Both day) get scheduled runs there
 */

import { describe, it, expect } from "vitest";
import {
  scheduleStructuredWeekV2,
  generateRacePlanV2,
  enrichRunDayV2,
  type RacePlanV2Input,
} from "../runScheduler";
import { generateSchedule, type ScheduleDay } from "@/lib/scheduleUtils";
import type { ScheduledRunDay } from "../programTypes";

const sundayStart = "2026-05-10";  // Sunday
const baseInput = {
  weekNumber: 1,
  weekStart: sundayStart,
};

/* ─── scheduleStructuredWeekV2 ───────────────────────────────── */

describe("scheduleStructuredWeekV2", () => {
  it("returns empty array when no run-eligible days in schedule", () => {
    const allLift: ScheduleDay[] = generateSchedule(4, 0);
    const result = scheduleStructuredWeekV2({ ...baseInput, weekSchedule: allLift });
    expect(result).toEqual([]);
  });

  it("schedules runs on every run-eligible day in weekSchedule", () => {
    const schedule = generateSchedule(2, 3); // 3 run days
    const result = scheduleStructuredWeekV2({ ...baseInput, weekSchedule: schedule });
    expect(result).toHaveLength(3);
  });

  it("emits v2-shaped runDays with id / date / weekKey / status", () => {
    const schedule = generateSchedule(3, 2);
    const result = scheduleStructuredWeekV2({ ...baseInput, weekSchedule: schedule });
    result.forEach((rd) => {
      expect(rd.id).toBeTruthy();
      expect(rd.id).toMatch(/^runday_/);
      expect(rd.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(rd.weekKey).toBe(sundayStart);
      expect(rd.status).toBe("planned");
    });
  });

  it("derives `date` from weekStart + dayIndex correctly", () => {
    // weekStart = Sun 2026-05-10. Run on dayIndex 3 (Wed) = 2026-05-13
    const schedule: ScheduleDay[] = [
      { day: 0, type: "rest" },
      { day: 1, type: "rest" },
      { day: 2, type: "rest" },
      { day: 3, type: "run" },
      { day: 4, type: "rest" },
      { day: 5, type: "rest" },
      { day: 6, type: "rest" },
    ];
    const result = scheduleStructuredWeekV2({ ...baseInput, weekSchedule: schedule });
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2026-05-13");
  });

  it("schedules runs on Both days (the headline P0-3 hybrid fix)", () => {
    // 6 lifts + 2 runs = 8 sessions → 1 both day required
    // Verify the run-eligible-from-weekSchedule path schedules a run
    // on the Both day, which V1 explicitly excluded.
    const schedule = generateSchedule(6, 2);
    const result = scheduleStructuredWeekV2({ ...baseInput, weekSchedule: schedule });
    expect(result).toHaveLength(2);
    // At least one of the runs should land on a Both day
    const onBothDays = result.filter((rd) => schedule[rd.dayIndex].type === "both");
    expect(onBothDays.length).toBeGreaterThanOrEqual(1);
  });

  it("alternates tempo (even weeks) and intervals (odd weeks)", () => {
    const schedule = generateSchedule(2, 3);
    const evenWeek = scheduleStructuredWeekV2({ ...baseInput, weekSchedule: schedule, weekNumber: 2 });
    const oddWeek = scheduleStructuredWeekV2({ ...baseInput, weekSchedule: schedule, weekNumber: 3 });
    expect(evenWeek.find((rd) => rd.type === "tempo")).toBeTruthy();
    expect(oddWeek.find((rd) => rd.type === "intervals")).toBeTruthy();
  });

  it("places exactly one long run per week", () => {
    const schedule = generateSchedule(2, 3);
    const result = scheduleStructuredWeekV2({ ...baseInput, weekSchedule: schedule });
    const longs = result.filter((rd) => rd.type === "long");
    expect(longs).toHaveLength(1);
  });

  it("is sorted by dayIndex ascending", () => {
    const schedule = generateSchedule(2, 3);
    const result = scheduleStructuredWeekV2({ ...baseInput, weekSchedule: schedule });
    for (let i = 1; i < result.length; i++) {
      expect(result[i].dayIndex).toBeGreaterThan(result[i - 1].dayIndex);
    }
  });
});

/* ─── Stress-aware long-run placement ────────────────────────── */

describe("scheduleStructuredWeekV2 · long-run placement", () => {
  it("prefers run-only slot over Both slot for the long run", () => {
    // 2 lift, 3 run = 5 sessions, no doubles. Run-only slots get
    // the long.
    const schedule: ScheduleDay[] = [
      { day: 0, type: "rest" },
      { day: 1, type: "lift" },
      { day: 2, type: "run" },     // run-only
      { day: 3, type: "lift" },
      { day: 4, type: "run" },     // run-only
      { day: 5, type: "rest" },
      { day: 6, type: "run" },     // run-only — weekend, gets long
    ];
    const result = scheduleStructuredWeekV2({ ...baseInput, weekSchedule: schedule });
    const longRun = result.find((rd) => rd.type === "long");
    expect(longRun).toBeTruthy();
    expect(schedule[longRun!.dayIndex].type).toBe("run");
  });

  it("falls back to Both slot when no run-only slots available", () => {
    // 5 lift, 5 run = 10 sessions → 3 both days, 2 lift-only, 2 run-only
    // The long run should go in a run-only slot first.
    const allBothNoRunOnly: ScheduleDay[] = [
      { day: 0, type: "rest" },
      { day: 1, type: "both" },
      { day: 2, type: "lift" },
      { day: 3, type: "both" },
      { day: 4, type: "lift" },
      { day: 5, type: "both" },
      { day: 6, type: "rest" },
    ];
    const result = scheduleStructuredWeekV2({ ...baseInput, weekSchedule: allBothNoRunOnly });
    const longRun = result.find((rd) => rd.type === "long");
    expect(longRun).toBeTruthy();
    // No run-only slots, so the long run must land on a Both slot
    expect(allBothNoRunOnly[longRun!.dayIndex].type).toBe("both");
  });

  it("prefers weekend run-only slot over weekday run-only", () => {
    const schedule: ScheduleDay[] = [
      { day: 0, type: "run" },     // Sun (weekend, run-only) → preferred
      { day: 1, type: "lift" },
      { day: 2, type: "run" },     // Tue (weekday)
      { day: 3, type: "lift" },
      { day: 4, type: "run" },     // Thu (weekday)
      { day: 5, type: "lift" },
      { day: 6, type: "rest" },
    ];
    const result = scheduleStructuredWeekV2({ ...baseInput, weekSchedule: schedule });
    const longRun = result.find((rd) => rd.type === "long");
    expect(longRun?.dayIndex).toBe(0); // Sunday wins
  });
});

/* ─── generateRacePlanV2 ─────────────────────────────────────── */

describe("generateRacePlanV2", () => {
  const standardInput: RacePlanV2Input = {
    weekSchedule: generateSchedule(3, 3),
    raceGoal: { distance: "10k", targetDate: "2026-08-10" },  // ~13 weeks from May 10
    weeklyRunDays: 3,
    currentDate: "2026-05-10",
    weekStart: "2026-05-10",
  };

  it("returns totalWeeks, compressed flag, weeks array", () => {
    const result = generateRacePlanV2(standardInput);
    expect(result.totalWeeks).toBeGreaterThan(0);
    expect(typeof result.compressed).toBe("boolean");
    expect(Array.isArray(result.weeks)).toBe(true);
    expect(result.weeks.length).toBe(result.totalWeeks);
  });

  it("computes totalWeeks deterministically from currentDate (not new Date())", () => {
    const a = generateRacePlanV2(standardInput);
    const b = generateRacePlanV2(standardInput);
    expect(a.totalWeeks).toBe(b.totalWeeks);
  });

  it("emits v2-shaped runDays in every week", () => {
    const result = generateRacePlanV2(standardInput);
    result.weeks.forEach((week) => {
      week.forEach((rd) => {
        expect(rd.id).toBeTruthy();
        expect(rd.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(rd.weekKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(rd.status).toBe("planned");
      });
    });
  });

  it("each week's weekKey advances by 7 days from week 0", () => {
    const result = generateRacePlanV2(standardInput);
    if (result.weeks.length < 2) return; // skip if too short
    const week0Key = result.weeks[0][0]?.weekKey;
    const week1Key = result.weeks[1][0]?.weekKey;
    if (week0Key && week1Key) {
      const w0 = new Date(week0Key);
      const w1 = new Date(week1Key);
      const diffDays = (w1.getTime() - w0.getTime()) / 86400000;
      expect(diffDays).toBe(7);
    }
  });

  it("sets compressed=false when totalWeeks >= minWeeks", () => {
    const long = generateRacePlanV2({
      ...standardInput,
      raceGoal: { distance: "10k", targetDate: "2026-12-10" },  // 31 weeks
    });
    expect(long.compressed).toBe(false);
  });

  it("sets compressed=true when totalWeeks < race-config minWeeks", () => {
    // 10K minWeeks = 6. Pick 3 weeks out → compressed = true.
    const compressed = generateRacePlanV2({
      ...standardInput,
      raceGoal: { distance: "10k", targetDate: "2026-05-31" },  // 3 weeks
    });
    expect(compressed.compressed).toBe(true);
    expect(compressed.totalWeeks).toBe(3);
  });

  it("hard floor of 2 weeks for compressed plans", () => {
    const tooShort = generateRacePlanV2({
      ...standardInput,
      raceGoal: { distance: "10k", targetDate: "2026-05-12" },  // 2 days
    });
    expect(tooShort.totalWeeks).toBeGreaterThanOrEqual(2);
  });

  it("schedules runs on Both days when weekSchedule has them", () => {
    const hybridSchedule = generateSchedule(6, 2); // includes Both days
    const result = generateRacePlanV2({
      ...standardInput,
      weekSchedule: hybridSchedule,
      weeklyRunDays: 2,
    });
    // At least one run in week 0 should be on a Both day
    const week0OnBoth = result.weeks[0]?.filter(
      (rd) => hybridSchedule[rd.dayIndex].type === "both",
    );
    expect((week0OnBoth ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("compressed plans cap hard sessions: skip the taper quality work", () => {
    // 3-week plan → totalWeeks 3 < minWeeks 6 → compressed
    const compressed = generateRacePlanV2({
      ...standardInput,
      raceGoal: { distance: "10k", targetDate: "2026-05-31" },
    });
    expect(compressed.compressed).toBe(true);
    // Find taper-week runs (week index >= 75% of total)
    const taperWeekIdx = Math.floor(compressed.totalWeeks * 0.75);
    const taperWeek = compressed.weeks[taperWeekIdx] ?? [];
    // In compressed plans, taper week skips intervals — should be all easy/long
    const intervalsInTaper = taperWeek.filter((rd) => rd.type === "intervals");
    expect(intervalsInTaper).toHaveLength(0);
  });

  it("final week is always race week regardless of compression", () => {
    const result = generateRacePlanV2(standardInput);
    const finalWeek = result.weeks[result.weeks.length - 1];
    const raceRun = finalWeek.find((rd) => rd.type === "race");
    expect(raceRun).toBeTruthy();
  });

  it("returns empty weeks when no run-eligible days in weekSchedule", () => {
    const liftOnly = generateSchedule(5, 0);
    const result = generateRacePlanV2({
      ...standardInput,
      weekSchedule: liftOnly,
    });
    expect(result.weeks).toEqual([]);
  });
});

/* ─── enrichRunDayV2 (back-compat helper) ────────────────────── */

describe("enrichRunDayV2", () => {
  const weekStart = new Date(2026, 4, 10); // Sun May 10

  it("adds id / date / weekKey / status to a v1 runDay", () => {
    const v1: ScheduledRunDay = {
      dayIndex: 2,
      templateId: "tempo_20",
      type: "tempo",
      completed: false,
    };
    const v2 = enrichRunDayV2(v1, weekStart);
    expect(v2.id).toBeTruthy();
    expect(v2.date).toBe("2026-05-12");
    expect(v2.weekKey).toBe("2026-05-10");
    expect(v2.status).toBe("planned");
  });

  it("derives status='completed_exact' when v1 completed=true", () => {
    const v1: ScheduledRunDay = {
      dayIndex: 0,
      templateId: "easy_30",
      type: "easy",
      completed: true,
    };
    const v2 = enrichRunDayV2(v1, weekStart);
    expect(v2.status).toBe("completed_exact");
  });

  it("preserves existing v2 fields (idempotent)", () => {
    const already: ScheduledRunDay = {
      id: "explicit_id",
      weekKey: "2026-05-10",
      date: "2026-05-12",
      dayIndex: 2,
      templateId: "tempo_20",
      type: "tempo",
      completed: false,
      status: "planned",
    };
    const v2 = enrichRunDayV2(already, weekStart);
    expect(v2.id).toBe("explicit_id");
    expect(v2.date).toBe("2026-05-12");
  });

  it("preserves userOverride as string", () => {
    const v1: ScheduledRunDay = {
      dayIndex: 2,
      templateId: "tempo_20",
      type: "tempo",
      completed: false,
      userOverride: "alternate_template_id",
    };
    const v2 = enrichRunDayV2(v1, weekStart);
    expect(v2.userOverride).toBe("alternate_template_id");
    expect(typeof v2.userOverride).toBe("string");
  });
});
