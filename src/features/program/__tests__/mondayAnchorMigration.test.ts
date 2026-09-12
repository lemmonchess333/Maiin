/**
 * The Monday flip must not walk anyone's programme forward (RunWk2 v4).
 *
 * This is the one property of the anchor change a user could actually be
 * harmed by, and it is not obvious from the diff. Both rollovers decide
 * whether to advance by comparing a STORED week key against a freshly
 * computed one, as strings:
 *
 *   useProgram.ts   if (anchor >= todayKey) return;          // lift
 *   useProgram.ts   if (runDayWeekKey >= todayKeyG) return;  // run
 *
 * Every key written under the Sunday anchor sorts BEFORE the Monday key
 * for the same span ("2026-09-06" < "2026-09-07"), so without a remap
 * both guards fall through on the first open after the flip and each
 * user is advanced a week — new loads, a mesocycle step, possibly a
 * deload — for nothing they did.
 *
 * These tests assert the guard's own condition against a migrated state,
 * rather than driving the hook: the condition IS the contract, and
 * stating it here keeps the test honest about what it covers.
 */
import { describe, it, expect } from "vitest";
import { migrateProgramState } from "../migrations";
import { CURRENT_PROGRAM_SCHEMA_VERSION } from "../programTypes";
import type { ProgramState, ScheduledRunDay } from "../programTypes";
import { localWeekKey, parseLocalDate } from "@/lib/dateHelpers";

/** Sun 2026-09-06 opened the last Sunday-anchored week; Mon 2026-09-07
 *  opens the Monday week that shares six of its seven days. */
const LEGACY_SUNDAY_KEY = "2026-09-06";
const MONDAY_KEY = "2026-09-07";

function legacyState(overrides: Partial<ProgramState> = {}): ProgramState {
  return {
    goal: "recomp",
    currentPhase: "Hypertrophy",
    weekNumber: 5,
    splitType: "upper_lower",
    workouts: [],
    fatigueScore: 0,
    updatedAt: 1_700_000_000_000,
    programSchemaVersion: 3,
    liftWeekKey: LEGACY_SUNDAY_KEY,
    ...overrides,
  };
}

function runDay(overrides: Partial<ScheduledRunDay> = {}): ScheduledRunDay {
  return {
    dayIndex: 3,
    templateId: "tempo_run",
    type: "tempo",
    completed: false,
    id: `runday_${LEGACY_SUNDAY_KEY}_3_tempo_run`,
    date: "2026-09-09",
    weekKey: LEGACY_SUNDAY_KEY,
    status: "planned",
    ...overrides,
  };
}

describe("opening the app on flip day advances nobody", () => {
  it("leaves the LIFT anchor at or after this week's key, so the rollover returns early", () => {
    const migrated = migrateProgramState(legacyState(), MONDAY_KEY);
    const todayKey = localWeekKey(parseLocalDate("2026-09-09")); // a Wed
    expect(todayKey).toBe(MONDAY_KEY);
    // The literal guard from useProgram.ts, evaluated against the
    // migrated state. False here means a week gets advanced.
    expect(
      (migrated.liftWeekKey ?? "") >= todayKey,
      "a stale anchor rolls the user forward a week they did not train"
    ).toBe(true);
  });

  it("leaves the RUN anchor at or after this week's key", () => {
    const migrated = migrateProgramState(
      legacyState({ runDays: [runDay()] }),
      MONDAY_KEY
    );
    const todayKey = localWeekKey(parseLocalDate("2026-09-09"));
    expect(
      (migrated.runDays?.[0]?.weekKey ?? "") >= todayKey,
      "a stale run key rolls the plan forward a week"
    ).toBe(true);
  });

  it("would FAIL both guards without the remap — the bug this prevents", () => {
    // Stated explicitly so the tests above cannot pass for a trivial
    // reason (e.g. a fixture key that was already a Monday). This is
    // the untreated value, and it is genuinely stale.
    const todayKey = localWeekKey(parseLocalDate("2026-09-09"));
    expect(LEGACY_SUNDAY_KEY >= todayKey).toBe(false);
  });
});

describe("what the remap does and does not move", () => {
  it("re-anchors both week keys onto the Monday", () => {
    const migrated = migrateProgramState(
      legacyState({ runDays: [runDay()] }),
      MONDAY_KEY
    );
    expect(migrated.liftWeekKey).toBe(MONDAY_KEY);
    expect(migrated.runDays?.[0]?.weekKey).toBe(MONDAY_KEY);
    expect(migrated.programSchemaVersion).toBe(CURRENT_PROGRAM_SCHEMA_VERSION);
  });

  it("does NOT move the run's date — that is the user's training day", () => {
    // Re-deriving dates would shift a Sunday long run by a week and
    // orphan the claim that matches a saved run to its slot BY DATE.
    const migrated = migrateProgramState(
      legacyState({ runDays: [runDay()] }),
      MONDAY_KEY
    );
    expect(migrated.runDays?.[0]?.date).toBe("2026-09-09");
  });

  it("does NOT regenerate the run's id — the server dedupes races on it", () => {
    // `runPlan.completedRaces` holds these exact strings server-side;
    // a regenerated id makes a recorded race look new and invites a
    // second recovery entry.
    const migrated = migrateProgramState(
      legacyState({ runDays: [runDay()] }),
      MONDAY_KEY
    );
    expect(migrated.runDays?.[0]?.id).toBe(
      `runday_${LEGACY_SUNDAY_KEY}_3_tempo_run`
    );
  });

  it("is idempotent — a second pass is referentially equal", () => {
    // It runs on every read. A second pass that changed anything would
    // walk the user forward exactly as the bug above does.
    const once = migrateProgramState(
      legacyState({ runDays: [runDay()] }),
      MONDAY_KEY
    );
    const twice = migrateProgramState(once, MONDAY_KEY);
    expect(twice).toBe(once);
  });

  it("leaves a doc that is already Monday-anchored completely untouched", () => {
    const clean = legacyState({
      programSchemaVersion: CURRENT_PROGRAM_SCHEMA_VERSION,
      liftWeekKey: MONDAY_KEY,
      runDays: [runDay({ weekKey: MONDAY_KEY })],
    });
    expect(migrateProgramState(clean, MONDAY_KEY)).toBe(clean);
  });
});
