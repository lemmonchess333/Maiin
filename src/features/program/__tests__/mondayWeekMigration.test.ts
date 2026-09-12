import { computeClaims } from "@/lib/scheduledRunCompletion";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { migrateProgramState } from "../migrations";
import type { ProgramState, ScheduledRunDay } from "../programTypes";
import { computePlanMetadata } from "@/lib/runPlanMetadata";
import { computeRunMove } from "@/lib/runReschedule";
import { localWeekKey, parseLocalDate } from "@/lib/dateHelpers";

function run(overrides: Partial<ScheduledRunDay> = {}): ScheduledRunDay {
  return {
    id: "runday_2026-09-06_2_easy_30",
    date: "2026-09-08",
    weekKey: "2026-09-06",
    dayIndex: 2,
    templateId: "easy_30",
    type: "easy",
    status: "planned",
    completed: false,
    ...overrides,
  };
}

function state(overrides: Partial<ProgramState> = {}): ProgramState {
  return {
    programSchemaVersion: 3,
    liftWeekKey: "2026-09-06",
    goal: "recomp",
    currentPhase: "Strength",
    weekNumber: 3,
    splitType: "upper_lower",
    fatigueScore: 17,
    updatedAt: 123,
    workouts: [],
    runDays: [run()],
    ...overrides,
  };
}

describe("v3 to Monday weeks", () => {
  it.each([
    ["2026-09-07", "2026-09-06", "2026-09-07"],
    ["2026-09-12", "2026-09-06", "2026-09-07"],
    ["2026-09-13", "2026-09-06", "2026-09-07"],
    ["2026-09-13", "2026-09-13", "2026-09-14"],
    ["2026-09-14", "2026-09-13", "2026-09-14"],
    ["2027-01-01", "2026-12-27", "2026-12-28"],
  ])(
    "does not make a current plan stale on %s",
    (today, oldAnchor, expected) => {
      const current = localWeekKey(parseLocalDate(today));
      const out = migrateProgramState(
        state({ liftWeekKey: oldAnchor, runDays: [] }),
        current
      );
      expect(out.liftWeekKey).toBe(expected);
      expect(out.liftWeekKey! >= current).toBe(true);
      expect(out.weekNumber).toBe(3);
      expect(out.weekHistory).toBeUndefined();
    }
  );

  it("preserves a real absence rather than reseeding its anchor to today", () => {
    const out = migrateProgramState(
      state({ liftWeekKey: "2026-08-30" }),
      "2026-09-14"
    );
    expect(out.liftWeekKey).toBe("2026-08-31");
  });

  it("keeps run dates, order, movement and completion while re-keying all references", () => {
    const sunday = run({
      id: "runday_2026-09-06_0_10k_race",
      date: "2026-09-06",
      dayIndex: 0,
      templateId: "10k_race",
      type: "race",
      status: "completed_exact",
      completed: true,
    });
    const moved = run({
      date: "2026-09-11",
      dayIndex: 5,
      movedFromDate: "2026-09-08",
      movedToDate: "2026-09-11",
      userOverride: "easy_40",
    });
    const original = state({
      runDays: [sunday, moved],
      manualCompletions: {
        [moved.id!]: { completedAt: new Date("2026-09-11T12:00:00Z") },
        "unmapped-history": { completedAt: new Date("2026-08-01T12:00:00Z") },
      },
      runPlan: {
        mode: "race_prep",
        currentWeek: 5,
        totalWeeks: 8,
        phase: "recovery",
        recoveryEndDate: "2026-09-20",
        completedRaces: [sunday.id!, "earlier-race"],
      },
      weekHistory: [{ weekNumber: 2, workouts: [] }],
    });
    const before = structuredClone(original);
    const out = migrateProgramState(original, "2026-09-07");
    const [race, runDay] = out.runDays!;
    expect(race).toMatchObject({
      date: "2026-09-06",
      weekKey: "2026-08-31",
      id: "runday_2026-08-31_0_10k_race",
      status: "completed_exact",
      completed: true,
    });
    expect(runDay).toMatchObject({
      date: "2026-09-11",
      weekKey: "2026-09-07",
      id: "runday_2026-09-07_5_easy_30",
      legacyIds: [moved.id],
      movedFromDate: "2026-09-08",
      movedToDate: "2026-09-11",
      userOverride: "easy_40",
    });
    expect(out.manualCompletions).toEqual({
      [runDay.id!]: original.manualCompletions![moved.id!],
      "unmapped-history": original.manualCompletions!["unmapped-history"],
    });
    expect(out.runPlan).toEqual({
      ...original.runPlan,
      completedRaces: [race.id, "earlier-race"],
    });
    expect(out.weekHistory).toBe(original.weekHistory);
    expect(out.liftWeekKey).toBe("2026-09-07");
    expect(original).toEqual(before);
    expect(migrateProgramState(out, "2026-09-07")).toBe(out);

    // The original Tuesday URL still selects the moved Friday run and
    // yields its canonical ID for subsequent writes.
    const decision = computePlanMetadata({
      displayUnit: "km",
      profileRunMode: "race_prep",
      todayDayIndex: 3,
      todayDate: "2026-09-09",
      runDays: out.runDays,
      runPlan: {
        mode: "race_prep",
        raceGoal: { distance: "10k", targetDate: "2099-10-01" },
      },
      urlTemplateId: null,
      urlType: null,
      urlScheduledRunId: moved.id,
    });
    expect(decision.metadata.scheduledRunId).toBe(runDay.id);
    expect(decision.metadata.plannedRunDayIndex).toBe(5);
    expect(computeRunMove(runDay, 2, [])).toMatchObject({
      date: "2026-09-08",
      movedFromDate: undefined,
      movedToDate: undefined,
    });
  });

  it("reconstructs missing dates using the stored Sunday anchor first", () => {
    const out = migrateProgramState(
      state({ runDays: [run({ date: undefined, dayIndex: 0 })] }),
      "2026-09-07"
    );
    expect(out.runDays![0]).toMatchObject({
      date: "2026-09-06",
      weekKey: "2026-08-31",
      dayIndex: 0,
    });
  });

  it("keeps a pre-anchor run plan's real age for its next rollover", () => {
    const out = migrateProgramState(
      state({ liftWeekKey: undefined }),
      "2026-09-21"
    );
    expect(out.liftWeekKey).toBe("2026-09-07");
  });

  it("does not rerun the v3 coverage backfill when upgrading a v3 plan", () => {
    const original = state({
      workouts: [
        {
          dayName: "My push day",
          dayType: "push",
          completed: true,
          exercises: [
            {
              name: "Overhead Press",
              exerciseId: "overhead-press",
              movementCategory: "vertical_push",
              sets: 3,
              baseSets: 3,
              reps: 8,
              weight: 40,
              lastSuccessfulWeight: 40,
              repUnit: "reps",
              instanceId: "keep-this-exercise",
            },
          ],
        },
      ] as ProgramState["workouts"],
    });
    const out = migrateProgramState(original, "2026-09-07");
    expect(out.workouts).toBe(original.workouts);
    expect(out.workouts[0].exercises).toHaveLength(1);
  });

  it("never mistakes the preserved previous Sunday for today's planned run", () => {
    const out = migrateProgramState(
      state({ runDays: [run({ date: "2026-09-06", dayIndex: 0 })] }),
      "2026-09-07"
    );
    const decision = computePlanMetadata({
      displayUnit: "km",
      profileRunMode: "race_prep",
      todayDayIndex: 0,
      todayDate: "2026-09-13",
      runDays: out.runDays,
      runPlan: {
        mode: "race_prep",
        raceGoal: { distance: "10k", targetDate: "2099-10-01" },
      },
      urlTemplateId: null,
      urlType: null,
    });
    expect(decision.metadata.scheduledRunId).toBeNull();
  });
});

it.each(["ease", "deload"] as const)(
  "keeps %s undo attached when the active run has changed template and date",
  (kind) => {
    const require = createRequire(import.meta.url);
    const { applyProgramCommand } =
      require("../../../../functions/lib/programCommands") as {
        applyProgramCommand: (args: unknown) => { state: ProgramState };
      };
    const originalRun = run({ templateId: "tempo_20", type: "tempo" });
    const activeRun = run({
      date: "2026-09-11",
      dayIndex: 5,
      userOverride: "easy_30",
    });
    const base = state({ runDays: [activeRun] });
    if (kind === "ease")
      base.easeSnapshot = {
        weekNumber: 3,
        appliedAt: 100,
        runDays: [originalRun],
      };
    else
      base.deloadSnapshot = {
        weekNumber: 3,
        appliedAt: 100,
        runDays: [originalRun],
        workouts: [],
        currentPhase: "Strength",
        fatigueScore: 17,
      };
    const migrated = migrateProgramState(base, "2026-09-07");
    const result = applyProgramCommand({
      state: migrated,
      profile: {},
      now: 200,
      command: {
        kind: kind === "ease" ? "revertEaseWeek" : "revertDeloadWeek",
        commandId: "undo-after-migration",
        expectedWeekNumber: 3,
      },
    }).state;
    expect(result.runDays![0]).toMatchObject({
      id: migrated.runDays![0].id,
      date: "2026-09-08",
      templateId: "tempo_20",
      type: "tempo",
      weekKey: "2026-09-07",
      legacyIds: [originalRun.id],
    });
    expect(result.easeSnapshot).toBeUndefined();
    expect(result.deloadSnapshot).toBeUndefined();
  }
);

it("keeps the saved-run claim attached to its actual date after re-keying", () => {
  const migrated = migrateProgramState(state(), "2026-09-07");
  const claims = computeClaims(
    migrated.runDays!,
    [{ id: "saved-run-before-upgrade", date: "2026-09-08", distance: 5000 }],
    {},
    "2026-09-09",
    {
      paceBucketFor: () => "easy",
      templateQualityBucket: { easy_30: "easy" },
      plannedDistanceFor: () => 4000,
    }
  );
  expect(claims.get(migrated.runDays![0].id!)?.claimedSavedRunId).toBe(
    "saved-run-before-upgrade"
  );
});
