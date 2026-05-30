/**
 * runProgrammeViewModel — pure view-model contract for the Programme
 * Run cockpit. Locked 2-state model (Run9a): freeform substrate +
 * optional race-goal overlay. No structured mode.
 */
import { describe, it, expect } from "vitest";
import {
  raceDistanceLabel,
  compactRunLabel,
  compactLiftLabel,
  buildRaceCockpitViewModel,
  buildHybridWeekItems,
  resolveRunPlanSurface,
} from "@/lib/runProgrammeViewModel";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import type { UserProfile } from "@/lib/auth";
import type {
  ProgramState,
  ScheduledRunDay,
  WorkoutDay,
} from "@/features/program/programTypes";
import type { ClaimState } from "@/lib/scheduledRunCompletion";

const tmpl = (id: string) => RUN_TEMPLATES.find((t) => t.id === id)!;
const emptyClaims = new Map<string, ClaimState>();

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

describe("compactLiftLabel", () => {
  it("strips the qualifier after a dash/middot", () => {
    expect(compactLiftLabel("Push — Chest Focus")).toBe("Push");
    expect(compactLiftLabel("Pull · Back")).toBe("Pull");
    expect(compactLiftLabel("Legs")).toBe("Legs");
  });
  it("truncates very long heads and handles empty", () => {
    expect(compactLiftLabel("Upperbodyday")).toBe("Upperbo…");
    expect(compactLiftLabel(undefined)).toBe("Lift");
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
});

// ── buildHybridWeekItems ──────────────────────────────────────────
function makeProfile(
  schedule: { day: number; type: "lift" | "run" | "both" | "rest" }[]
): UserProfile {
  return {
    uid: "u",
    displayName: "T",
    email: "t@e.com",
    weekSchedule: schedule,
  } as UserProfile;
}

function makeRunDay(o: Partial<ScheduledRunDay>): ScheduledRunDay {
  return {
    id: "rd",
    dayIndex: 1,
    templateId: "easy_30",
    type: "easy",
    completed: false,
    status: "planned",
    date: "2026-05-11",
    weekKey: "2026-05-10",
    ...o,
  };
}

function makeWorkout(o: Partial<WorkoutDay> = {}): WorkoutDay {
  return {
    dayName: "Push — Chest",
    dayType: "lift",
    exercises: [],
    completed: false,
    ...o,
  };
}

function makeProgram(
  runDays: ScheduledRunDay[],
  workouts: WorkoutDay[]
): ProgramState {
  return {
    goal: "recomp",
    currentPhase: "base",
    weekNumber: 1,
    splitType: "ppl",
    workouts,
    fatigueScore: 0,
    updatedAt: 0,
    settings: { autoProgression: true, microloading: true },
    weekHistory: [],
    programSchemaVersion: 2,
    runDays,
  } as ProgramState;
}

describe("buildHybridWeekItems", () => {
  it("renders BOTH a run lane and a lift lane on a combined day", () => {
    // Monday (dayIndex 1) is a "both" day: a long run + a lift.
    const schedule = Array.from({ length: 7 }, (_, i) => ({
      day: i,
      type: i === 1 ? ("both" as const) : ("rest" as const),
    }));
    const items = buildHybridWeekItems({
      profile: makeProfile(schedule),
      programState: makeProgram(
        [
          makeRunDay({
            dayIndex: 1,
            templateId: "long_15k",
            date: "2026-05-11",
          }),
        ],
        [makeWorkout({ dayName: "Push — Chest" })]
      ),
      claimMap: emptyClaims,
      currentWeekKey: "2026-05-10",
      todayKey: "2026-05-11",
      anchorWeekKey: "2026-05-10",
    });
    const monday = items[1];
    expect(monday.run).toBeDefined();
    expect(monday.lift).toBeDefined();
    // Compact labels, NOT the full truncated names.
    expect(monday.run!.shortLabel).toBe("15K");
    expect(monday.run!.title).toBe("Long 15K");
    expect(monday.lift!.shortLabel).toBe("Push");
    expect(monday.isToday).toBe(true);
  });

  it("does NOT invent runs for a freeform lifter (no runDays) but keeps lift lanes", () => {
    const schedule = Array.from({ length: 7 }, (_, i) => ({
      day: i,
      type: i === 1 ? ("lift" as const) : ("rest" as const),
    }));
    const items = buildHybridWeekItems({
      profile: makeProfile(schedule),
      programState: makeProgram([], [makeWorkout({ dayName: "Legs" })]),
      claimMap: emptyClaims,
      currentWeekKey: "2026-05-10",
      todayKey: "2026-05-11",
      anchorWeekKey: "2026-05-10",
    });
    expect(items.every((d) => d.run === undefined)).toBe(true);
    expect(items[1].lift?.shortLabel).toBe("Legs");
  });

  it("maps a race-day runDay to a race lane flagged isRace", () => {
    const schedule = Array.from({ length: 7 }, (_, i) => ({
      day: i,
      type: i === 1 ? ("run" as const) : ("rest" as const),
    }));
    const items = buildHybridWeekItems({
      profile: makeProfile(schedule),
      programState: makeProgram(
        [
          makeRunDay({
            dayIndex: 1,
            templateId: "marathon_race",
            date: "2026-05-11",
            status: "race_no_show",
          }),
        ],
        []
      ),
      claimMap: emptyClaims,
      currentWeekKey: "2026-05-10",
      todayKey: "2026-05-11",
      anchorWeekKey: "2026-05-10",
    });
    expect(items[1].run?.isRace).toBe(true);
    expect(items[1].run?.shortLabel).toBe("Race");
    expect(items[1].run?.status).toBe("race_no_show");
  });
});
