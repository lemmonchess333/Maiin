/**
 * runProgrammeViewModel — pure view-model contract for the Programme
 * Run cockpit. Locked 2-state model (Run9a): freeform substrate +
 * optional race-goal overlay. No structured mode.
 */
import { describe, it, expect } from "vitest";
import {
  raceDistanceLabel,
  compactRunLabel,
  buildRaceCockpitViewModel,
  resolveRunPlanSurface,
  hasHybridInterference,
} from "@/lib/runProgrammeViewModel";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import type { ProgramState } from "@/features/program/programTypes";

const tmpl = (id: string) => RUN_TEMPLATES.find((t) => t.id === id)!;

describe("raceDistanceLabel", () => {
  it("renders readable labels, not MARATHON machine text", () => {
    expect(raceDistanceLabel("marathon")).toBe("Marathon");
    expect(raceDistanceLabel("half")).toBe("Half Marathon");
    expect(raceDistanceLabel("10k")).toBe("10K");
    expect(raceDistanceLabel("5k")).toBe("5K");
  });
  it("passes through unknown distances unchanged", () => {
    expect(raceDistanceLabel("ultra")).toBe("ultra");
  });
});

describe("compactRunLabel", () => {
  it("collapses templates to short tile tokens (not full truncated names)", () => {
    expect(compactRunLabel(tmpl("easy_30"))).toBe("30m");
    expect(compactRunLabel(tmpl("tempo_20"))).toBe("Tempo");
    expect(compactRunLabel(tmpl("5x1k"))).toBe("5×1K");
    expect(compactRunLabel(tmpl("8x400"))).toBe("8×400");
    expect(compactRunLabel(tmpl("long_15k"))).toBe("15K");
    expect(compactRunLabel(tmpl("long_10k"))).toBe("10K");
    expect(compactRunLabel(tmpl("marathon_race"))).toBe("Race");
  });
  it("falls back to 'Run' when no template", () => {
    expect(compactRunLabel(null)).toBe("Run");
  });
});

describe("resolveRunPlanSurface", () => {
  it("is freeform with no race goal", () => {
    expect(resolveRunPlanSurface({ runMode: "freeform" }, null)).toEqual({
      kind: "freeform",
      hasRaceGoal: false,
    });
  });
  it("is race_goal only when race_prep AND a goal exists", () => {
    const ps = {
      runPlan: { raceGoal: { distance: "10k", targetDate: "2027-01-01" } },
    } as ProgramState;
    expect(resolveRunPlanSurface({ runMode: "race_prep" }, ps)).toEqual({
      kind: "race_goal",
      hasRaceGoal: true,
    });
  });
  it("a legacy structured user collapses to freeform (no structured surface)", () => {
    expect(
      resolveRunPlanSurface({ runMode: "structured" as never }, null)
    ).toEqual({ kind: "freeform", hasRaceGoal: false });
  });
});

describe("buildRaceCockpitViewModel", () => {
  it("returns null without a race goal", () => {
    expect(
      buildRaceCockpitViewModel({
        raceGoal: null,
        currentWeek: 0,
        totalWeeks: 12,
        compressed: false,
        todayKey: "2026-05-30",
      })
    ).toBeNull();
  });

  it("computes days-out and phase from week/total", () => {
    const vm = buildRaceCockpitViewModel({
      raceGoal: { distance: "marathon", targetDate: "2026-06-09" },
      currentWeek: 0,
      totalWeeks: 12,
      compressed: false,
      todayKey: "2026-05-30",
    })!;
    expect(vm.distanceLabel).toBe("Marathon");
    expect(vm.daysToRace).toBe(10);
    expect(vm.currentWeek).toBe(0);
    expect(vm.totalWeeks).toBe(12);
    // Week 0 of a 12-week marathon is the Base phase.
    expect(vm.phaseLabel).toBe("Base");
  });

  it("never returns a negative countdown for a past race", () => {
    const vm = buildRaceCockpitViewModel({
      raceGoal: { distance: "10k", targetDate: "2026-05-01" },
      currentWeek: 5,
      totalWeeks: 6,
      compressed: true,
      todayKey: "2026-05-30",
    })!;
    expect(vm.daysToRace).toBe(0);
    expect(vm.compressed).toBe(true);
  });

  /**
   * `belowFloor` never reached the cockpit until 2026-08-04, so a
   * finish-safely plan sat under the COMPRESSED copy — which promises
   * "interval work trimmed and the long-run progression shortened". A
   * below-floor plan has no long-run progression: measured, a marathon 3
   * weeks out emits `easy_30` x3 in every non-race week. The card described
   * training the plan did not contain, permanently, while the honest wording
   * existed only in the transient realign toast.
   */
  it("carries belowFloor so the card can say something different", () => {
    const vm = buildRaceCockpitViewModel({
      raceGoal: { distance: "marathon", targetDate: "2026-06-20" },
      currentWeek: 0,
      totalWeeks: 3,
      compressed: true,
      belowFloor: true,
      todayKey: "2026-05-30",
    })!;
    // Both, not either: belowFloor IMPLIES compressed, and a consumer that
    // switched on compressed alone is exactly what produced the wrong copy.
    expect(vm.compressed).toBe(true);
    expect(vm.belowFloor).toBe(true);
  });

  it("defaults belowFloor to false when the caller does not know", () => {
    // A caller that omits it cannot claim the plan is below the floor. The
    // degenerate answer is the safe one — show the compressed copy, not the
    // finish-safely one.
    const vm = buildRaceCockpitViewModel({
      raceGoal: { distance: "half", targetDate: "2026-06-20" },
      currentWeek: 1,
      totalWeeks: 8,
      compressed: true,
      todayKey: "2026-05-30",
    })!;
    expect(vm.belowFloor).toBe(false);
  });
});

describe("hasHybridInterference (scheduler's 'UI can flag it' note, wired)", () => {
  it("flags quality runs sharing a day with a lift", () => {
    for (const runType of ["tempo", "intervals", "long"] as const) {
      expect(hasHybridInterference({ hasLift: true, runType })).toBe(true);
    }
  });

  it("never flags easy runs, race day, run-only or lift-only days", () => {
    expect(hasHybridInterference({ hasLift: true, runType: "easy" })).toBe(
      false
    );
    expect(hasHybridInterference({ hasLift: true, runType: "race" })).toBe(
      false
    );
    expect(hasHybridInterference({ hasLift: false, runType: "long" })).toBe(
      false
    );
    expect(hasHybridInterference({ hasLift: true, runType: null })).toBe(false);
  });
});
