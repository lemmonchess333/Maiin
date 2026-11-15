import { describe, it, expect } from "vitest";
import { repairRunPrescriptions } from "../runPrescriptionRepair";
import { homeProgramSnapshot } from "../homeProgramSnapshot";
import { scheduleRecoveryWeekV2 } from "../runScheduler";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "../programTypes";

const schedule = Array.from({ length: 7 }, (_, day) => ({
  day,
  type: "run" as const,
}));
const profile = {
  runMode: "race_prep",
  weekSchedule: schedule,
  raceGoal: { distance: "marathon", targetDate: "2026-11-08" },
} as UserProfile;
const base = {
  goal: "recomp",
  currentPhase: "base",
  weekNumber: 1,
  splitType: "full_body",
  workouts: [],
  updatedAt: 0,
  settings: {},
  weekHistory: [],
  liftWeekKey: "2026-11-09",
  runPlan: {
    mode: "race_prep",
    phase: "recovery",
    raceGoal: profile.raceGoal,
    recoveryEndDate: "2026-12-06",
  },
  runDays: scheduleRecoveryWeekV2({
    weekSchedule: schedule,
    weekStart: "2026-11-09",
  }),
} as unknown as ProgramState;

describe("beginner prescription repair", () => {
  it("prunes a same-week seven-run beginner race plan without resetting its stage or history", () => {
    const novice = {
      ...profile,
      runFrequency: "new",
      onboardingCompletedAt: {
        toMillis: () => new Date("2026-11-09T12:00:00").getTime(),
      },
      raceGoal: { distance: "10k", targetDate: "2027-01-31" },
    } as UserProfile;
    const state = {
      ...base,
      runPlan: {
        mode: "race_prep",
        raceGoal: novice.raceGoal,
        totalWeeks: 12,
        currentWeek: 0,
      },
    } as ProgramState;
    const next = repairRunPrescriptions(state, novice, "2026-11-09");
    expect(next.runDays).toHaveLength(3);
    expect(next.runPlan).toBe(state.runPlan);
    expect(next.runDays?.map((row) => row.dayIndex)).toEqual([1, 3, 5]);
    expect(repairRunPrescriptions(next, novice, "2026-11-09")).toBe(next);
    expect(
      repairRunPrescriptions(
        state,
        { ...novice, runFrequency: "regular" },
        "2026-11-09"
      )
    ).toBe(state);
  });
  it("keeps a run the person moved off the starter slots", () => {
    const novice = { ...profile, runMode: "starter" } as UserProfile;
    const state = {
      ...base,
      runPlan: { mode: "starter", stage: 3 },
    } as ProgramState;
    const pruned = repairRunPrescriptions(state, novice, "2026-11-09");
    const wednesday = pruned.runDays!.find((d) => d.date === "2026-11-11")!;
    expect(wednesday).toBeDefined();
    // On Monday, Wednesday's run is moved to Thursday (moveRunDay).
    const moved = {
      ...wednesday,
      date: "2026-11-12",
      dayIndex: 4,
      movedFromDate: "2026-11-11",
      movedToDate: "2026-11-12",
    };
    const withMove = {
      ...pruned,
      runDays: pruned.runDays!.map((d) => (d === wednesday ? moved : d)),
    } as ProgramState;
    const next = repairRunPrescriptions(withMove, novice, "2026-11-09");
    expect(next.runDays).toContain(moved);
    expect(next.runDays!.filter((d) => d.date === "2026-11-12")).toHaveLength(
      1
    );
  });

  it("keeps today's planned slot because saved activity claims are not loaded here", () => {
    const novice = { ...profile, runMode: "starter" } as UserProfile;
    const state = {
      ...base,
      runPlan: { mode: "starter", stage: 3 },
    } as ProgramState;
    const today = state.runDays!.find((day) => day.date === "2026-11-10")!;
    const next = repairRunPrescriptions(state, novice, "2026-11-10");
    expect(next.runDays).toContain(today);
    expect(next.runDays).toContain(state.runDays![0]);
    expect(next.runPlan).toBe(state.runPlan);
    expect(next.runDays?.some((day) => day.date === "2026-11-11")).toBe(false);
  });
  it("projects beginner repair on Home and requests persistence without changing raw data", () => {
    const novice = { ...profile, runMode: "starter" } as UserProfile;
    const state = {
      ...base,
      runPlan: { mode: "starter", stage: 3, stageWeekKey: "2026-11-09" },
    } as ProgramState;
    const before = structuredClone(state);
    const result = homeProgramSnapshot(state, novice, "2026-11-09");
    expect(result.programState?.runDays).toHaveLength(3);
    expect(result.needsMaintenance).toBe(true);
    expect(state).toEqual(before);
  });
  it("preserves manual/completed rows and does not apply beginner changes during recovery", () => {
    const novice = { ...profile, runMode: "starter" } as UserProfile;
    const state = {
      ...base,
      runPlan: { mode: "starter", stage: 3 },
      manualCompletions: { [base.runDays![1].id!]: true },
      runDays: base.runDays!.map((row, i) =>
        i === 3 ? { ...row, status: "completed_exact" as const } : row
      ),
    } as unknown as ProgramState;
    const next = repairRunPrescriptions(state, novice, "2026-11-09");
    expect(next.runDays).toContain(state.runDays![1]);
    expect(next.runDays).toContain(state.runDays![3]);
    expect(repairRunPrescriptions(base, novice, "2026-11-09")).toBe(base);
  });
});
