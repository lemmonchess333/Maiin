/**
 * With a race plan the lighter week falls on the run plan's step-back week
 * (Lift4 (9)), so the lifting eases off in the week the running does.
 *
 * The first block pins the step-back rule to the weeks the run plan really
 * steps back in, read from its long-run ramp rather than from the rule's own
 * arithmetic: if the ramp's cutbacks move, the lifting's lighter weeks have
 * to move with them.
 */
import { describe, it, expect } from "vitest";
import { advanceWeek, generateProgram } from "../programEngine";
import { longRunKmForWeek } from "../runScheduler";
import {
  getPhaseForWeek,
  isRunStepBackWeek,
  TAPER_WEEKS_BY_DISTANCE,
} from "../runPlanTiming";
import {
  calendarLighterWeek,
  raceBlockWeek,
  type RaceBlockWeek,
} from "../weekPrescription";
import type { ProgramState, RunPlan } from "../programTypes";

const DISTANCES = ["5k", "10k", "half", "marathon"] as const;

describe("the run plan's step-back weeks", () => {
  it("are the base and build weeks its long run steps back in", () => {
    for (const distance of DISTANCES) {
      for (const totalWeeks of [4, 6, 8, 12, 16, 20, 24]) {
        const taperWeeks = TAPER_WEEKS_BY_DISTANCE[distance];
        const km = (w: number) =>
          longRunKmForWeek({
            weekIndex: w,
            totalWeeks,
            baseLongKm: 14,
            peakLongKm: 32,
            taperWeeks,
            volume: "standard",
          });
        for (let w = 1; w < totalWeeks; w++) {
          const phase = getPhaseForWeek(w, totalWeeks, distance);
          if (phase !== "base" && phase !== "build") {
            expect(isRunStepBackWeek(w, totalWeeks, distance)).toBe(false);
            continue;
          }
          expect(
            isRunStepBackWeek(w, totalWeeks, distance),
            `${distance}, ${totalWeeks} weeks, week ${w}`
          ).toBe(km(w) < km(w - 1));
        }
      }
    }
  });

  it("include none in the taper or race week", () => {
    // A 16-week half: taper weeks 13 and 14, the race in week 15.
    for (const w of [13, 14, 15]) {
      expect(isRunStepBackWeek(w, 16, "half")).toBe(false);
    }
    expect(
      Array.from({ length: 16 }, (_, w) => w).filter((w) =>
        isRunStepBackWeek(w, 16, "half")
      )
    ).toEqual([3, 7, 11]);
  });
});

const racePlan = (over: Partial<RunPlan> = {}): RunPlan => ({
  mode: "race_prep",
  raceGoal: { distance: "half", targetDate: "2026-12-20" },
  currentWeek: 5,
  totalWeeks: 16,
  ...over,
});

describe("raceBlockWeek — the race block a plan's lighter weeks follow", () => {
  it("reads the run plan's week", () => {
    expect(raceBlockWeek(racePlan())).toEqual({
      weekIndex: 5,
      totalWeeks: 16,
      distance: "half",
    });
  });

  it("is null without a race block to follow", () => {
    expect(raceBlockWeek(undefined)).toBeNull();
    expect(raceBlockWeek(racePlan({ mode: "structured" }))).toBeNull();
    // The recovery after the race has no block left.
    expect(raceBlockWeek(racePlan({ phase: "recovery" }))).toBeNull();
    expect(raceBlockWeek(racePlan({ raceGoal: undefined }))).toBeNull();
    expect(
      raceBlockWeek(
        racePlan({ raceGoal: { distance: "ultra", targetDate: "2026-12-20" } })
      )
    ).toBeNull();
    expect(raceBlockWeek(racePlan({ currentWeek: undefined }))).toBeNull();
    expect(raceBlockWeek(racePlan({ currentWeek: 16 }))).toBeNull();
    expect(raceBlockWeek(racePlan({ currentWeek: 2.5 }))).toBeNull();
  });
});

describe("calendarLighterWeek", () => {
  const half = (weekIndex: number): RaceBlockWeek => ({
    weekIndex,
    totalWeeks: 16,
    distance: "half",
  });

  it("follows the run plan's step-back weeks while a race plan runs", () => {
    expect(calendarLighterWeek(5, half(7))).toBe(true);
    // Week 8 of the lifting would be a lighter week without the race.
    expect(calendarLighterWeek(8, half(6))).toBe(false);
  });

  it("is every 4th week without one", () => {
    expect(calendarLighterWeek(8, null)).toBe(true);
    expect(calendarLighterWeek(7, null)).toBe(false);
  });
});

describe("advanceWeek with a race plan", () => {
  /** A trained 3-day week at lifting week 5, so the cycle alone would not
   *  bring a lighter week next. */
  const week5 = (over: Partial<ProgramState> = {}): ProgramState => {
    const { workouts } = generateProgram(3, undefined, "general");
    return {
      goal: "recomp",
      currentPhase: "progression",
      weekNumber: 5,
      splitType: "full_body",
      workouts: workouts.map((d) => ({ ...d, completed: true })),
      fatigueScore: 0,
      updatedAt: 0,
      ...over,
    } as ProgramState;
  };
  const stepBack: RaceBlockWeek = {
    weekIndex: 7,
    totalWeeks: 16,
    distance: "half",
  };
  const build: RaceBlockWeek = { ...stepBack, weekIndex: 6 };

  it("makes the run plan's step-back week the lighter one", () => {
    const out = advanceWeek(week5(), "intermediate", undefined, stepBack);
    expect(out.currentPhase).toBe("deload");
    expect(out.workouts[0].exercises[0].sets).toBeLessThan(
      week5().workouts[0].exercises[0].sets
    );
  });

  it("leaves a week the run plan builds through full, whatever the cycle", () => {
    // Lifting week 8 would be the cycle's lighter week.
    const out = advanceWeek(
      week5({ weekNumber: 7 }),
      "intermediate",
      undefined,
      build
    );
    expect(out.weekNumber).toBe(8);
    expect(out.currentPhase).toBe("progression");
  });

  it("keeps the rules on who gets lighter weeks and one at a time", () => {
    expect(
      advanceWeek(week5(), "beginner", undefined, stepBack).currentPhase
    ).toBe("progression");
    expect(
      advanceWeek(
        week5({ workouts: week5().workouts.slice(0, 2) }),
        "intermediate",
        undefined,
        stepBack
      ).currentPhase
    ).toBe("progression");
    expect(
      advanceWeek(
        week5({ currentPhase: "deload" }),
        "intermediate",
        undefined,
        stepBack
      ).currentPhase
    ).toBe("progression");
    // A week with no session in it brings none.
    const untrained = week5();
    untrained.workouts = untrained.workouts.map((d) => ({
      ...d,
      completed: false,
    }));
    expect(
      advanceWeek(untrained, "intermediate", undefined, stepBack).currentPhase
    ).toBe("progression");
  });

  it("goes back to the cycle without one", () => {
    const out = advanceWeek(week5({ weekNumber: 7 }), "intermediate");
    expect(out.currentPhase).toBe("deload");
  });
});
