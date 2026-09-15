import { describe, expect, it } from "vitest";
import { homeProgramSnapshot } from "../homeProgramSnapshot";
import { generateSchedule } from "@/lib/scheduleUtils";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "../programTypes";

const profile = {
  runMode: "freeform",
  weekSchedule: generateSchedule(2, 0),
  weekScheduleVersion: 1,
  weeklyWorkoutsTarget: 2,
} as UserProfile;
const date = "2026-09-15";
const clean = homeProgramSnapshot(
  {
    goal: "recomp",
    weekNumber: 3,
    currentPhase: "base",
    splitType: "full_body",
    workouts: [],
    fatigueScore: 0,
    updatedAt: 1,
  } as ProgramState,
  profile,
  date
).programState!;

describe("Home programme maintenance boundary", () => {
  it("keeps a current migrated programme on the read-only path", () => {
    expect(homeProgramSnapshot(clean, profile, date).needsMaintenance).toBe(
      false
    );
  });
  it("loads maintenance for a real lift-week rollover", () => {
    expect(
      homeProgramSnapshot(clean, profile, "2026-09-21").needsMaintenance
    ).toBe(true);
  });
  it("repairs missing anchors without silently advancing a legacy programme", () => {
    const legacy = { ...clean, liftWeekKey: undefined };
    const result = homeProgramSnapshot(legacy, profile, date);
    expect(result.needsMaintenance).toBe(true);
    expect(result.programState?.weekNumber).toBe(clean.weekNumber);
    expect(result.programState?.liftWeekKey).toBe("2026-09-14");
  });
  it("requires maintenance for missing documents and retired run modes", () => {
    expect(homeProgramSnapshot(null, profile, date).needsMaintenance).toBe(
      true
    );
    expect(
      homeProgramSnapshot(clean, { ...profile, runMode: "structured" }, date)
        .needsMaintenance
    ).toBe(true);
  });
  it("checks malformed run-day shapes even at the latest schema version", () => {
    const result = homeProgramSnapshot(
      {
        ...clean,
        runDays: [
          {
            dayIndex: 2,
            templateId: "easy_30",
            type: "easy",
            completed: false,
          },
        ],
      },
      profile,
      date
    );
    expect(result.needsMaintenance).toBe(true);
    expect(result.programState?.runDays?.[0].id).toBeTruthy();
  });
});
