import { describe, it, expect } from "vitest";
import { resolveRunPlan, resolveRunPlanSurface } from "../runPlanResolver";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "@/features/program/programTypes";

const RACE = { distance: "marathon", targetDate: "2026-07-11" } as const;

function profile(over: Partial<UserProfile> = {}): UserProfile {
  return { runMode: "freeform", raceGoal: null, ...over } as UserProfile;
}
function program(runPlan: Record<string, unknown> | null): ProgramState {
  return { runPlan } as unknown as ProgramState;
}

describe("resolveRunPlan — store reconciliation (R4)", () => {
  it("freeform when neither store has a race goal", () => {
    const r = resolveRunPlan(profile(), program(null), "2026-07-01");
    expect(r.surface.kind).toBe("freeform");
    expect(r.runMode).toBe("freeform");
    expect(r.raceGoal).toBeNull();
  });

  it("race_goal when only the PROFILE has the goal (mirror not yet written)", () => {
    // The R4 case: profile.raceGoal set, programState.runPlan.raceGoal not yet
    // mirrored. The old surface resolver read only the mirror → dropped the
    // overlay. Now the canonical (profile) goal wins.
    const r = resolveRunPlan(
      profile({ runMode: "race_prep", raceGoal: RACE }),
      program(null),
      "2026-07-01"
    );
    expect(r.surface.kind).toBe("race_goal");
    expect(r.runMode).toBe("race_prep");
    expect(r.raceGoal).toEqual(RACE);
  });

  it("race_goal when only the MIRROR has the goal (profile lagging)", () => {
    const r = resolveRunPlan(
      profile({ runMode: "freeform", raceGoal: null }),
      program({ raceGoal: RACE }),
      "2026-07-01"
    );
    expect(r.surface.kind).toBe("race_goal");
    expect(r.runMode).toBe("race_prep");
  });

  it("runMode is MATERIALIZED from the goal, never the stored toggle", () => {
    // Stored runMode says race_prep but there's no goal anywhere → freeform.
    const r = resolveRunPlan(
      profile({ runMode: "race_prep", raceGoal: null }),
      program(null),
      "2026-07-01"
    );
    expect(r.runMode).toBe("freeform");
    expect(r.surface.kind).toBe("freeform");
  });
});

describe("resolveRunPlan — elapsed (R1, unified)", () => {
  it("NOT elapsed during race day itself (local compare)", () => {
    const r = resolveRunPlan(
      profile({ runMode: "race_prep", raceGoal: RACE }),
      program({ raceGoal: RACE, currentWeek: 3, totalWeeks: 12 }),
      "2026-07-11" // race day
    );
    expect(r.isElapsed).toBe(false);
  });

  it("elapsed the day AFTER race day", () => {
    const r = resolveRunPlan(
      profile({ runMode: "race_prep", raceGoal: RACE }),
      program({ raceGoal: RACE }),
      "2026-07-12"
    );
    expect(r.isElapsed).toBe(true);
  });

  it("elapsed when the plan ran out of weeks (currentWeek >= totalWeeks)", () => {
    const r = resolveRunPlan(
      profile({ runMode: "race_prep", raceGoal: RACE }),
      program({ raceGoal: RACE, currentWeek: 12, totalWeeks: 12 }),
      "2026-07-01" // before race day
    );
    expect(r.isElapsed).toBe(true);
  });

  it("never elapsed for a freeform user", () => {
    const r = resolveRunPlan(profile(), program(null), "2099-01-01");
    expect(r.isElapsed).toBe(false);
  });
});

describe("resolveRunPlan — recovery window (unified)", () => {
  const recovering = program({
    raceGoal: RACE,
    phase: "recovery",
    recoveryEndDate: "2026-07-25",
  });

  it("inRecovery before recoveryEndDate", () => {
    const r = resolveRunPlan(
      profile({ runMode: "race_prep", raceGoal: RACE }),
      recovering,
      "2026-07-20"
    );
    expect(r.inRecovery).toBe(true);
    expect(r.recoveryEnded).toBe(false);
  });

  it("recoveryEnded on/after recoveryEndDate", () => {
    const r = resolveRunPlan(
      profile({ runMode: "race_prep", raceGoal: RACE }),
      recovering,
      "2026-07-25"
    );
    expect(r.inRecovery).toBe(false);
    expect(r.recoveryEnded).toBe(true);
  });

  it("neither when not in the recovery phase", () => {
    const r = resolveRunPlan(
      profile({ runMode: "race_prep", raceGoal: RACE }),
      program({ raceGoal: RACE, phase: null, recoveryEndDate: null }),
      "2026-07-20"
    );
    expect(r.inRecovery).toBe(false);
    expect(r.recoveryEnded).toBe(false);
  });
});

describe("resolveRunPlanSurface — back-compat, reconciliation-aware", () => {
  it("returns race_goal from the profile goal even with an empty mirror (R4)", () => {
    expect(
      resolveRunPlanSurface(
        profile({ runMode: "race_prep", raceGoal: RACE }),
        program(null)
      ).kind
    ).toBe("race_goal");
  });

  it("freeform for null profile / programState", () => {
    expect(resolveRunPlanSurface(null, null).kind).toBe("freeform");
  });
});
