/**
 * Tests for shape-repair migrations · P0-A · spec v7.
 *
 * Invariants:
 *   - migrateProgramState is idempotent (run twice = same result)
 *   - migrateProgramState preserves ALL existing fields
 *   - Status is derived from legacy `completed` boolean
 *   - id/date/weekKey are deterministically derived
 *   - backfillWeekScheduleIfMissing returns null when nothing to do
 *   - Migration NEVER calls planBuilder (no regeneration)
 */

import { describe, it, expect } from "vitest";
import {
  migrateProgramState,
  backfillWeekScheduleIfMissing,
} from "../migrations";
import { CURRENT_PROGRAM_SCHEMA_VERSION, CURRENT_WEEKSCHEDULE_VERSION } from "../programTypes";
import type { ProgramState, ScheduledRunDay } from "../programTypes";

function makeLegacyProgramState(overrides: Partial<ProgramState> = {}): ProgramState {
  return {
    goal: "recomp",
    currentPhase: "Hypertrophy",
    weekNumber: 3,
    splitType: "upper_lower",
    workouts: [],
    fatigueScore: 0,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function legacyRunDay(overrides: Partial<ScheduledRunDay> = {}): ScheduledRunDay {
  return {
    dayIndex: 2,
    templateId: "tempo_run",
    type: "tempo",
    completed: false,
    ...overrides,
  };
}

describe("migrateProgramState", () => {
  it("returns input unchanged when already at current version", () => {
    const upToDate = makeLegacyProgramState({
      programSchemaVersion: CURRENT_PROGRAM_SCHEMA_VERSION,
      runDays: [
        { ...legacyRunDay(), id: "runday_2026-05-10_2_tempo", date: "2026-05-12", weekKey: "2026-05-10", status: "planned" },
      ],
    });
    const migrated = migrateProgramState(upToDate, "2026-05-10");
    expect(migrated).toBe(upToDate); // referentially equal (no work done)
  });

  it("adds id/date/weekKey/status to legacy runDays", () => {
    const legacy = makeLegacyProgramState({
      runDays: [legacyRunDay({ dayIndex: 2, templateId: "tempo_run", completed: false })],
    });
    const migrated = migrateProgramState(legacy, "2026-05-10");
    expect(migrated.runDays![0].id).toBeTruthy();
    expect(migrated.runDays![0].date).toBe("2026-05-12"); // Sun May 10 + dayIndex 2 = Tue May 12
    expect(migrated.runDays![0].weekKey).toBe("2026-05-10");
    expect(migrated.runDays![0].status).toBe("planned");
  });

  it("sets status='completed_exact' for legacy runDays with completed=true", () => {
    const legacy = makeLegacyProgramState({
      runDays: [legacyRunDay({ completed: true })],
    });
    const migrated = migrateProgramState(legacy, "2026-05-10");
    expect(migrated.runDays![0].status).toBe("completed_exact");
  });

  it("sets status='planned' for legacy runDays with completed=false", () => {
    const legacy = makeLegacyProgramState({
      runDays: [legacyRunDay({ completed: false })],
    });
    const migrated = migrateProgramState(legacy, "2026-05-10");
    expect(migrated.runDays![0].status).toBe("planned");
  });

  it("preserves all existing fields (templateId, userOverride, completed, type)", () => {
    const legacy = makeLegacyProgramState({
      runDays: [
        legacyRunDay({
          dayIndex: 3,
          templateId: "long_8k",
          type: "long",
          completed: true,
          userOverride: "override_template_id",
        }),
      ],
    });
    const migrated = migrateProgramState(legacy, "2026-05-10");
    const rd = migrated.runDays![0];
    expect(rd.dayIndex).toBe(3);
    expect(rd.templateId).toBe("long_8k");
    expect(rd.type).toBe("long");
    expect(rd.completed).toBe(true);
    expect(rd.userOverride).toBe("override_template_id"); // STRING preserved, not boolean
  });

  it("is idempotent — running twice produces the same result", () => {
    const legacy = makeLegacyProgramState({
      runDays: [legacyRunDay()],
    });
    const once = migrateProgramState(legacy, "2026-05-10");
    const twice = migrateProgramState(once, "2026-05-10");
    expect(twice).toEqual(once);
  });

  it("sets programSchemaVersion to current after migration", () => {
    const legacy = makeLegacyProgramState();
    const migrated = migrateProgramState(legacy, "2026-05-10");
    expect(migrated.programSchemaVersion).toBe(CURRENT_PROGRAM_SCHEMA_VERSION);
  });

  it("handles missing runDays gracefully", () => {
    const legacy = makeLegacyProgramState({ runDays: undefined });
    const migrated = migrateProgramState(legacy, "2026-05-10");
    expect(migrated.runDays).toEqual([]);
    expect(migrated.programSchemaVersion).toBe(CURRENT_PROGRAM_SCHEMA_VERSION);
  });

  it("preserves runDays that are already partially migrated (partial v2 fields)", () => {
    // A runDay that has `id` but not `date` — the migration should fill in
    // the missing fields without overwriting the existing id.
    const legacy = makeLegacyProgramState({
      runDays: [{ ...legacyRunDay(), id: "explicit_existing_id" }],
    });
    const migrated = migrateProgramState(legacy, "2026-05-10");
    expect(migrated.runDays![0].id).toBe("explicit_existing_id");
    expect(migrated.runDays![0].date).toBeTruthy();
  });

  it("preserves workouts and other ProgramState fields untouched", () => {
    const legacy = makeLegacyProgramState({
      workouts: [
        {
          dayName: "Push A",
          dayType: "push",
          exercises: [],
          completed: false,
        },
      ],
      currentPhase: "Strength",
      weekNumber: 5,
    });
    const migrated = migrateProgramState(legacy, "2026-05-10");
    expect(migrated.workouts).toEqual(legacy.workouts);
    expect(migrated.currentPhase).toBe("Strength");
    expect(migrated.weekNumber).toBe(5);
  });
});

describe("backfillWeekScheduleIfMissing", () => {
  it("returns null when weekSchedule is current", () => {
    const result = backfillWeekScheduleIfMissing({
      weekSchedule: [
        { day: 0, type: "rest" }, { day: 1, type: "lift" }, { day: 2, type: "run" },
        { day: 3, type: "lift" }, { day: 4, type: "rest" }, { day: 5, type: "lift" },
        { day: 6, type: "rest" },
      ],
      weekScheduleVersion: CURRENT_WEEKSCHEDULE_VERSION,
    });
    expect(result).toBeNull();
  });

  it("derives weekSchedule from targets when missing", () => {
    const result = backfillWeekScheduleIfMissing({
      weeklyWorkoutsTarget: 3,
      weeklyRunDaysTarget: 2,
    });
    expect(result).not.toBeNull();
    expect(result!.weekSchedule).toHaveLength(7);
    expect(result!.weekScheduleVersion).toBe(CURRENT_WEEKSCHEDULE_VERSION);
  });

  it("backfills when weekScheduleVersion is missing (legacy doc)", () => {
    const result = backfillWeekScheduleIfMissing({
      weekSchedule: [
        { day: 0, type: "rest" }, { day: 1, type: "lift" }, { day: 2, type: "run" },
        { day: 3, type: "lift" }, { day: 4, type: "rest" }, { day: 5, type: "lift" },
        { day: 6, type: "rest" },
      ],
      // no version
    });
    expect(result).not.toBeNull();
    expect(result!.weekScheduleVersion).toBe(CURRENT_WEEKSCHEDULE_VERSION);
  });

  it("falls back to weeklyRunsTarget when weeklyRunDaysTarget missing", () => {
    const result = backfillWeekScheduleIfMissing({
      weeklyWorkoutsTarget: 4,
      weeklyRunsTarget: 1,
    });
    expect(result).not.toBeNull();
    expect(result!.weekSchedule).toHaveLength(7);
  });

  it("defaults to 0 run days when both targets missing", () => {
    const result = backfillWeekScheduleIfMissing({
      weeklyWorkoutsTarget: 3,
    });
    expect(result).not.toBeNull();
    const runCount = (result!.weekSchedule ?? []).filter(
      (d) => d.type === "run" || d.type === "both",
    ).length;
    expect(runCount).toBe(0);
  });

  it("returns valid 7-entry array even with no targets at all (lift defaults to 3)", () => {
    const result = backfillWeekScheduleIfMissing({});
    expect(result).not.toBeNull();
    expect(result!.weekSchedule).toHaveLength(7);
  });
});
