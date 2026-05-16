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

// ─── PR-0b-i — shape-aware migration + semantic repair ──────────────

describe("PR-0b-i — migrateProgramState shape-aware repair", () => {
  // The pre-PR-0b-i implementation early-returned whenever
  // programSchemaVersion was current, so a V1-shaped runDay inside
  // a current-version doc would never get repaired. These tests
  // pin the new behaviour: shape and semantics are the gate, not
  // version alone.

  it("migrates current-version doc when a runDay is missing id", () => {
    const state = makeLegacyProgramState({
      programSchemaVersion: CURRENT_PROGRAM_SCHEMA_VERSION,
      runDays: [
        // Current-version doc but the runDay lacks `id` — exact
        // class of corruption the V1 writer can produce.
        {
          ...legacyRunDay({ dayIndex: 2 }),
          date: "2026-05-12",
          weekKey: "2026-05-10",
          status: "planned",
        },
      ],
    });
    const migrated = migrateProgramState(state, "2026-05-10");
    expect(migrated.runDays![0].id).toBeTruthy();
    expect(migrated.runDays![0].id).toMatch(/^runday_2026-05-10_2_/);
    // Schema version stays current — no downgrade.
    expect(migrated.programSchemaVersion).toBe(CURRENT_PROGRAM_SCHEMA_VERSION);
  });

  it("migrates current-version doc when a runDay is missing weekKey", () => {
    const state = makeLegacyProgramState({
      programSchemaVersion: CURRENT_PROGRAM_SCHEMA_VERSION,
      runDays: [
        {
          ...legacyRunDay({ dayIndex: 2 }),
          id: "runday_pre-existing",
          date: "2026-05-12",
          status: "planned",
        },
      ],
    });
    const migrated = migrateProgramState(state, "2026-05-10");
    expect(migrated.runDays![0].weekKey).toBe("2026-05-10");
    // Pre-existing id is preserved — migration is additive.
    expect(migrated.runDays![0].id).toBe("runday_pre-existing");
  });

  it("fully V2 doc returns reference-equal (===) state (zero work)", () => {
    const v2 = makeLegacyProgramState({
      programSchemaVersion: CURRENT_PROGRAM_SCHEMA_VERSION,
      runDays: [
        {
          ...legacyRunDay({ dayIndex: 2, completed: false }),
          id: "runday_2026-05-10_2_tempo",
          date: "2026-05-12",
          weekKey: "2026-05-10",
          status: "planned",
        },
      ],
    });
    const migrated = migrateProgramState(v2, "2026-05-10");
    // Reference equality — proves the persist guard will skip the
    // Firestore write. This is the storm-prevention assertion.
    expect(migrated).toBe(v2);
  });
});

describe("PR-0b-i — migrateProgramState semantic repair", () => {
  it("aligns completed=false when status is a terminal completion", () => {
    // Inconsistent input: status says it's done, completed flag
    // disagrees. status wins per the P0-A enum hierarchy.
    const state = makeLegacyProgramState({
      runDays: [
        {
          ...legacyRunDay({ completed: false }),
          status: "completed_exact",
        },
      ],
    });
    const migrated = migrateProgramState(state, "2026-05-10");
    expect(migrated.runDays![0].status).toBe("completed_exact");
    expect(migrated.runDays![0].completed).toBe(true);
  });

  it("aligns completed=true to false when status is 'skipped'", () => {
    const state = makeLegacyProgramState({
      runDays: [
        {
          ...legacyRunDay({ completed: true }),
          status: "skipped",
        },
      ],
    });
    const migrated = migrateProgramState(state, "2026-05-10");
    expect(migrated.runDays![0].status).toBe("skipped");
    // skipped is NOT completed — the user didn't do the run.
    expect(migrated.runDays![0].completed).toBe(false);
  });

  it("treats race_completed_unlinked as NOT completed (pending link)", () => {
    // race_completed_unlinked has a legal outgoing transition to
    // completed_exact. Until that link resolves, the run is in a
    // pending state, not a done state. completed=false reflects
    // that.
    const state = makeLegacyProgramState({
      runDays: [
        {
          ...legacyRunDay({ completed: true }),
          status: "race_completed_unlinked",
        },
      ],
    });
    const migrated = migrateProgramState(state, "2026-05-10");
    expect(migrated.runDays![0].completed).toBe(false);
  });

  it("treats race_no_show as NOT completed", () => {
    const state = makeLegacyProgramState({
      runDays: [
        {
          ...legacyRunDay({ completed: true }),
          status: "race_no_show",
        },
      ],
    });
    const migrated = migrateProgramState(state, "2026-05-10");
    expect(migrated.runDays![0].completed).toBe(false);
  });
});

describe("PR-0b-i — migrateProgramState weekStart normalisation", () => {
  // Pre-PR-0b-i the default weekStart was `localDateString()` —
  // today's date. For a user opening the app on a Wednesday this
  // produced weekKey="2026-05-13" and date values offset from that
  // Wednesday, splitting the calendar week across two weekKeys.
  // The default is now `localWeekKey()` (Sunday) and callers
  // passing mid-week dates get them normalised back to that
  // week's Sunday.

  it("normalises a Wednesday weekStart to that week's Sunday", () => {
    // 2026-05-13 is a Wednesday. The Sunday on or before is
    // 2026-05-10.
    const state = makeLegacyProgramState({
      runDays: [legacyRunDay({ dayIndex: 2 })],
    });
    const migrated = migrateProgramState(state, "2026-05-13");
    expect(migrated.runDays![0].weekKey).toBe("2026-05-10");
    // dayIndex 2 (Tue) from Sunday May 10 = May 12.
    expect(migrated.runDays![0].date).toBe("2026-05-12");
  });

  it("normalises a Saturday weekStart to that week's Sunday", () => {
    // 2026-05-16 is a Saturday → Sunday May 10.
    const state = makeLegacyProgramState({
      runDays: [legacyRunDay({ dayIndex: 0 })],
    });
    const migrated = migrateProgramState(state, "2026-05-16");
    expect(migrated.runDays![0].weekKey).toBe("2026-05-10");
    expect(migrated.runDays![0].date).toBe("2026-05-10");
  });

  it("does not regenerate workouts (reference equality on workouts)", () => {
    // Migration must be additive on runDays only. Workouts +
    // weekHistory + any other field stays referentially identical.
    const workouts = [
      { dayName: "Push A", dayType: "push", exercises: [], completed: false },
    ];
    const state = makeLegacyProgramState({
      workouts,
      runDays: [legacyRunDay()],
    });
    const migrated = migrateProgramState(state, "2026-05-10");
    expect(migrated.workouts).toBe(workouts);
  });
});

describe("PR-0b-i — migrateScheduledRunDay idempotency", () => {
  it("is reference-stable when input is shape-complete and consistent", () => {
    // Two consecutive runs on a clean V1→V2 migration result.
    // The first run produces a V2-shaped day. The second run
    // should hit the idempotent short-circuit and return the same
    // reference.
    const legacy = makeLegacyProgramState({
      runDays: [legacyRunDay({ completed: false })],
    });
    const once = migrateProgramState(legacy, "2026-05-10");
    const twice = migrateProgramState(once, "2026-05-10");
    expect(twice.runDays![0]).toBe(once.runDays![0]);
    expect(twice).toBe(once);
  });

  it("preserves userOverride string through migration", () => {
    // Critical: P0-A spec made userOverride a STRING (template id
    // override). A boolean here would break the
    // `day.userOverride ?? day.templateId` resolver. Pin the type.
    const legacy = makeLegacyProgramState({
      runDays: [
        legacyRunDay({ userOverride: "tempo_20" }),
      ],
    });
    const migrated = migrateProgramState(legacy, "2026-05-10");
    expect(typeof migrated.runDays![0].userOverride).toBe("string");
    expect(migrated.runDays![0].userOverride).toBe("tempo_20");
  });
});

describe("PR-0b-i — backfillWeekScheduleIfMissing structural validity", () => {
  it("regenerates when weekSchedule has duplicate days", () => {
    // 7-entry array but day 0 appears twice and day 6 is missing.
    // Pre-PR-0b-i this passed the `length === 7` guard.
    const result = backfillWeekScheduleIfMissing({
      weekScheduleVersion: CURRENT_WEEKSCHEDULE_VERSION,
      weekSchedule: [
        { day: 0, type: "rest" },
        { day: 0, type: "lift" }, // duplicate
        { day: 2, type: "run" },
        { day: 3, type: "lift" },
        { day: 4, type: "rest" },
        { day: 5, type: "lift" },
        { day: 1, type: "rest" },
      ],
      weeklyWorkoutsTarget: 3,
      weeklyRunDaysTarget: 2,
    });
    expect(result).not.toBeNull();
    expect(result!.weekSchedule).toHaveLength(7);
  });

  it("regenerates when weekSchedule has an unknown type", () => {
    // 7 entries, days 0..6 unique, but one type isn't in the enum.
    const result = backfillWeekScheduleIfMissing({
      weekScheduleVersion: CURRENT_WEEKSCHEDULE_VERSION,
      weekSchedule: [
        { day: 0, type: "rest" },
        { day: 1, type: "lift" },
        { day: 2, type: "run" },
        { day: 3, type: "long" as never }, // not a DayType
        { day: 4, type: "rest" },
        { day: 5, type: "lift" },
        { day: 6, type: "rest" },
      ],
      weeklyWorkoutsTarget: 3,
    });
    expect(result).not.toBeNull();
  });

  it("regenerates when weekSchedule length is 6 (one day missing)", () => {
    const result = backfillWeekScheduleIfMissing({
      weekScheduleVersion: CURRENT_WEEKSCHEDULE_VERSION,
      weekSchedule: [
        { day: 0, type: "rest" },
        { day: 1, type: "lift" },
        { day: 2, type: "run" },
        { day: 3, type: "lift" },
        { day: 4, type: "rest" },
        { day: 5, type: "lift" },
      ],
      weeklyWorkoutsTarget: 3,
    });
    expect(result).not.toBeNull();
  });
});

describe("PR-0b-i — persist-if-changed integration semantics", () => {
  // Pins the JSON.stringify guard used by useProgram.ts: it must
  // return true (skip write) for healthy V2 docs, false (do write)
  // for V1-shaped docs. The actual setDoc call is mocked away in
  // useProgram itself; here we just verify the diff logic.

  it("healthy V2 doc stringifies identically before/after migration", () => {
    const v2 = makeLegacyProgramState({
      programSchemaVersion: CURRENT_PROGRAM_SCHEMA_VERSION,
      runDays: [
        {
          ...legacyRunDay({ dayIndex: 2, completed: false }),
          id: "runday_2026-05-10_2_tempo",
          date: "2026-05-12",
          weekKey: "2026-05-10",
          status: "planned",
        },
      ],
    });
    const migrated = migrateProgramState(v2, "2026-05-10");
    expect(JSON.stringify(migrated)).toBe(JSON.stringify(v2));
  });

  it("V1-shape doc stringifies differently after migration", () => {
    const v1 = makeLegacyProgramState({
      runDays: [legacyRunDay({ dayIndex: 2 })],
    });
    const migrated = migrateProgramState(v1, "2026-05-10");
    expect(JSON.stringify(migrated)).not.toBe(JSON.stringify(v1));
  });
});
