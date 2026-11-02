/**
 * The Run-tab header line, with the store-reconciliation case pinned.
 *
 * This lived as an inline IIFE in Program.tsx and had no test — which is how
 * it kept a bug that told users to redo work they had already done. The
 * regeneration-window case below is the one that matters; the rest exist so
 * the extraction can't quietly change the other lines.
 */
import { describe, it, expect } from "vitest";
import { runHeaderLine } from "../runHeaderLine";
import { resolveRunPlan } from "../runPlanResolver";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "@/features/program/programTypes";

const RACE = { distance: "10k", targetDate: "2027-04-18" };
/** A day well before RACE. */
const TODAY = "2027-01-01";

describe("runHeaderLine", () => {
  it("leads with distance and week-of-M once the plan is built", () => {
    expect(
      runHeaderLine({
        runMode: "race_prep",
        raceGoal: RACE,
        currentWeek: 2,
        totalWeeks: 12,
        runsTarget: 3,
        todayKey: TODAY,
      })
      // currentWeek is 0-based on the wire and 1-based in the copy.
    ).toBe("Race prep · 10K · Week 3/12");
  });

  it("falls back to distance alone when the plan has no week counts yet", () => {
    // The race is known but the plan is not built — say the distance, don't
    // invent a week number.
    expect(
      runHeaderLine({
        runMode: "race_prep",
        raceGoal: RACE,
        currentWeek: null,
        totalWeeks: null,
        runsTarget: 3,
        todayKey: TODAY,
      })
    ).toBe("Race prep · 10K");
  });

  it("prompts for a goal only when there genuinely is none", () => {
    expect(
      runHeaderLine({
        runMode: "race_prep",
        raceGoal: null,
        runsTarget: 3,
        todayKey: TODAY,
      })
    ).toBe("Race prep · Set your race goal");
  });

  // `structured` is legacy — Run9a locked the model to freeform + race
  // overlay — but it is NOT dead. `run9Migration.migrateRunStateToRun9` sits
  // in KNOWN_ORPHAN_EXPORTS, never wired, so unmigrated profiles still carry
  // it. That is why this function takes the profile's own runMode rather
  // than `resolveRunPlan`'s `RunMode` (which is freeform | race_prep): the
  // narrower type would compile only by relabelling every such user
  // "Free running · Start whenever". Keep this case until the migration runs.
  it("pluralises the structured line", () => {
    expect(
      runHeaderLine({
        runMode: "structured",
        raceGoal: null,
        runsTarget: 1,
        todayKey: TODAY,
      })
    ).toBe("Structured · 1 run/week");
    expect(
      runHeaderLine({
        runMode: "structured",
        raceGoal: null,
        runsTarget: 4,
        todayKey: TODAY,
      })
    ).toBe("Structured · 4 runs/week");
  });

  it("is calm for freeform", () => {
    expect(
      runHeaderLine({
        runMode: "freeform",
        raceGoal: null,
        runsTarget: 0,
        todayKey: TODAY,
      })
    ).toBe("Free running · Start whenever");
  });
});

/* Owner, 1 Nov 2026: "Race prep · Marathon · Week 15/15" two weeks after
   the marathon. The plan's counter stays on race week once race day has
   passed; past it the line counts the recovery's week, or none. */
describe("runHeaderLine — after race day", () => {
  const MARATHON = { distance: "marathon", targetDate: "2026-10-17" };
  const lastWeek = { currentWeek: 14, totalWeeks: 15 };

  it("still counts the plan's last week on race day", () => {
    expect(
      runHeaderLine({
        runMode: "race_prep",
        raceGoal: MARATHON,
        ...lastWeek,
        todayKey: "2026-10-17",
        runsTarget: 4,
      })
    ).toBe("Race prep · Marathon · Week 15/15");
  });

  it("counts no week once race day has passed with no recovery", () => {
    expect(
      runHeaderLine({
        runMode: "race_prep",
        raceGoal: MARATHON,
        ...lastWeek,
        todayKey: "2026-11-01",
        runsTarget: 4,
      })
    ).toBe("Race prep · Marathon");
  });

  it("counts the recovery's week while it runs", () => {
    const recovering = {
      runMode: "race_prep" as const,
      raceGoal: MARATHON,
      ...lastWeek,
      phase: "recovery",
      recoveryEndDate: "2026-11-14",
      runsTarget: 4,
    };
    expect(runHeaderLine({ ...recovering, todayKey: "2026-10-18" })).toBe(
      "Race prep · Marathon · Recovery week 1/4"
    );
    expect(runHeaderLine({ ...recovering, todayKey: "2026-11-01" })).toBe(
      "Race prep · Marathon · Recovery week 3/4"
    );
    expect(runHeaderLine({ ...recovering, todayKey: "2026-11-13" })).toBe(
      "Race prep · Marathon · Recovery week 4/4"
    );
    // The recovery is over: no week to count.
    expect(runHeaderLine({ ...recovering, todayKey: "2026-11-14" })).toBe(
      "Race prep · Marathon"
    );
  });
});

describe("runHeaderLine — fed by the resolver (the R4 regression)", () => {
  /**
   * The window between "profile saved" and "plan regenerated": the profile
   * carries the race goal, the programState mirror does not yet.
   *
   * The old inline version took `runMode` from the profile and `raceGoal`
   * from the mirror, so this exact state rendered "Set your race goal" at a
   * user who had just set one. Going through `resolveRunPlan` — which makes
   * the profile canonical and lets the mirror only backfill — is what fixes
   * it, so the test drives the real resolver rather than hand-built args.
   */
  const profile = { runMode: "race_prep", raceGoal: RACE } as UserProfile;

  it("names the race when only the profile has it", () => {
    const programState = {
      runPlan: { mode: "race_prep", totalWeeks: 12, currentWeek: 0 },
    } as ProgramState;
    const resolved = resolveRunPlan(profile, programState, "2027-01-01");

    expect(
      runHeaderLine({
        // Mode from the profile (canonical already), goal from the resolver
        // — the exact split the call sites use.
        runMode: profile.runMode!,
        raceGoal: resolved.raceGoal,
        currentWeek: programState.runPlan?.currentWeek,
        totalWeeks: programState.runPlan?.totalWeeks,
        runsTarget: 3,
        todayKey: TODAY,
      })
    ).toBe("Race prep · 10K · Week 1/12");
  });

  it("still names the race when there is no runPlan at all yet", () => {
    // The earliest moment: goal saved, nothing generated. Distance-only is
    // correct here; "Set your race goal" would be a lie.
    const resolved = resolveRunPlan(profile, null, "2027-01-01");
    expect(
      runHeaderLine({
        runMode: profile.runMode!,
        raceGoal: resolved.raceGoal,
        runsTarget: 3,
        todayKey: TODAY,
      })
    ).toBe("Race prep · 10K");
  });

  it("prompts only when NEITHER store has a goal", () => {
    const resolved = resolveRunPlan(
      { runMode: "race_prep" } as UserProfile,
      { runPlan: { mode: "race_prep" } } as ProgramState,
      "2027-01-01"
    );
    // deriveRunMode has no goal to work from, so this is the genuine
    // "nothing set anywhere" state the prompt is written for.
    expect(
      runHeaderLine({
        runMode: "race_prep",
        raceGoal: resolved.raceGoal,
        runsTarget: 3,
        todayKey: TODAY,
      })
    ).toBe("Race prep · Set your race goal");
  });
});
