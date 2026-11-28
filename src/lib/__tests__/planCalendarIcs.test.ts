import { describe, it, expect } from "vitest";
import { buildWeekPlanIcs, icsFile } from "../planCalendarIcs";
import type { ScheduleDay } from "../scheduleUtils";
import type { WorkoutDay } from "@/features/program/programTypes";

function makeWorkout(dayName: string, names: string[]): WorkoutDay {
  return {
    dayName,
    dayType: "strength",
    completed: false,
    exercises: names.map((name, i) => ({
      exerciseId: `ex-${i}`,
      name,
      movementCategory: "horizontal_push",
      sets: 3,
      reps: 8,
      weight: 60,
      progressionType: "double",
      lastSuccessfulWeight: 60,
      lastAttemptedWeight: 60,
      consecutiveFailures: 0,
      plateauCount: 0,
      performanceHistory: [],
      lastPerformance: null,
    })),
  };
}

describe("buildWeekPlanIcs", () => {
  const schedule: ScheduleDay[] = [
    { day: 0, type: "run" }, // Sun
    { day: 1, type: "lift" }, // Mon
    { day: 2, type: "rest" }, // Tue
    { day: 3, type: "both" }, // Wed
    { day: 4, type: "rest" }, // Thu
    { day: 5, type: "lift" }, // Fri
    { day: 6, type: "rest" }, // Sat
  ];

  it("generates RFC 5545 all-day VEVENTs with CRLF endings and skips rest days", () => {
    const ics = buildWeekPlanIcs({
      schedule,
      workouts: [
        makeWorkout("Upper A", ["Bench Press", "Barbell Row"]),
        makeWorkout("Lower A", ["Back Squat"]),
        makeWorkout("Upper B", ["Overhead Press"]),
      ],
      referenceDate: new Date(2026, 10, 25, 12, 0, 0), // Wed Nov 25, 2026 (Mon is Nov 23)
    });

    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.split("\r\n").filter((l) => l === "BEGIN:VEVENT")).toHaveLength(
      4
    );
    expect(ics).toContain(
      "DTSTART;VALUE=DATE:20261123\r\nDTEND;VALUE=DATE:20261124"
    );
    expect(ics).toContain("SUMMARY:Upper A\r\n");
    expect(ics).toContain("SUMMARY:Lower A + Run\r\n");
    expect(ics).toContain("SUMMARY:Upper B\r\n");
    expect(ics).toContain("SUMMARY:Run session\r\n");
    // Rest day Tue Nov 24 must not appear as DTSTART
    expect(ics).not.toContain("DTSTART;VALUE=DATE:20261124");
  });

  it("escapes RFC 5545 special characters (;, ,, \\, newlines)", () => {
    const ics = buildWeekPlanIcs({
      schedule: [{ day: 1, type: "lift" }],
      workouts: [makeWorkout("Push; Pull, Legs\\Core", ["DB Press, Flat"])],
      referenceDate: new Date(2026, 10, 25, 12, 0, 0),
    });

    expect(ics).toContain("SUMMARY:Push\\; Pull\\, Legs\\\\Core\r\n");
    expect(ics).toContain("DB Press\\, Flat (3×8)");
  });

  it("wraps ICS content in a text/calendar File via icsFile", async () => {
    const file = icsFile("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n", "week.ics");
    expect(file.name).toBe("week.ics");
    expect(file.type).toBe("text/calendar;charset=utf-8");
    expect(await file.text()).toContain("BEGIN:VCALENDAR");
  });
});
