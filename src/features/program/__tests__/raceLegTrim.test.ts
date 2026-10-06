/**
 * The race build's leg trim (Lift4 (10)): race setup asks "Lighten leg
 * sessions while your runs build?", and on a yes the leg lifts have a
 * third fewer sets, at the same weights, in the run plan's build weeks.
 * Inside any lighter week the lighter week's recipe applies to the plan's
 * sets instead, so the two never stack (the precedence table in the
 * lifting handoff).
 */
import { describe, it, expect } from "vitest";
import {
  advanceWeek,
  easeBackIn,
  raceLegSets,
  withRaceLegTrim,
} from "../programEngine";
import { isRaceBuildWeek, type RaceBlockWeek } from "../weekPrescription";
import type {
  ProgramExercise,
  ProgramState,
  WorkoutDay,
} from "../programTypes";
import { RACE_BUILD_LEGS, liftSessionPurpose } from "@/lib/liftSessionPurpose";

/** A 16-week half: base weeks 0–5, build 6–12 (step-backs in 3, 7 and
 *  11), the last two before the race 13 and 14, race week 15. */
const half = (weekIndex: number): RaceBlockWeek => ({
  weekIndex,
  totalWeeks: 16,
  distance: "half",
});

function lift(over: Partial<ProgramExercise>): ProgramExercise {
  return {
    name: "Squat",
    exerciseId: "squat",
    instanceId: "squat",
    movementCategory: "knee_dominant",
    sets: 3,
    reps: 5,
    weight: 100,
    progressionType: "linear",
    lastSuccessfulWeight: 100,
    lastAttemptedWeight: 100,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    ...over,
  };
}

const day = (dayName: string, completed = true): WorkoutDay => ({
  dayName,
  dayType: "full_body",
  completed,
  exercises: [
    lift({ instanceId: `${dayName}-squat` }),
    lift({
      name: "Romanian Deadlift",
      exerciseId: "romanian-deadlift",
      instanceId: `${dayName}-rdl`,
      movementCategory: "hip_dominant",
      sets: 4,
    }),
    lift({
      name: "Bench Press",
      exerciseId: "bench-press",
      instanceId: `${dayName}-bench`,
      movementCategory: "horizontal_push",
      weight: 80,
    }),
  ],
});

/** A trained intermediate week on three days, at lifting week 5, so the
 *  cycle alone brings no lighter week next. */
function week(over: Partial<ProgramState> = {}): ProgramState {
  return {
    goal: "recomp",
    currentPhase: "progression",
    weekNumber: 5,
    splitType: "full_body",
    workouts: [day("A"), day("B"), day("C")],
    fatigueScore: 0,
    updatedAt: 0,
    ...over,
  } as ProgramState;
}

const yes = { raceLegTrim: true };
const setsOf = (s: Pick<ProgramState, "workouts">) =>
  s.workouts[0].exercises.map((e) => e.sets);

describe("raceLegSets", () => {
  it("takes a third off, never below two sets", () => {
    expect([1, 2, 3, 4, 5, 6].map(raceLegSets)).toEqual([1, 2, 2, 3, 3, 4]);
  });
});

describe("isRaceBuildWeek", () => {
  it("is the run plan's build weeks only", () => {
    const build = Array.from({ length: 16 }, (_, w) => w).filter((w) =>
      isRaceBuildWeek(half(w))
    );
    expect(build).toEqual([6, 7, 8, 9, 10, 11, 12]);
    expect(isRaceBuildWeek(null)).toBe(false);
  });
});

describe("the rollover into a build week", () => {
  it("trims the leg lifts on a yes, at the same weights", () => {
    const out = advanceWeek(week(), "intermediate", undefined, half(6), yes);
    expect(out.raceWeek).toBe("build");
    expect(out.currentPhase).toBe("progression");
    // Squat 3 → 2, RDL 4 → 3; the bench keeps its sets.
    expect(setsOf(out)).toEqual([2, 3, 3]);
    expect(out.workouts[0].exercises.map((e) => e.baseSets)).toEqual([3, 4, 3]);
    expect(out.workouts[0].exercises.map((e) => e.weight)).toEqual([
      100, 100, 80,
    ]);
  });

  it("leaves the legs whole without a yes, and in the base weeks", () => {
    const no = advanceWeek(week(), "intermediate", undefined, half(6));
    expect(setsOf(no)).toEqual([3, 4, 3]);
    expect(no.raceWeek).toBeUndefined();
    const base = advanceWeek(week(), "intermediate", undefined, half(4), yes);
    expect(setsOf(base)).toEqual([3, 4, 3]);
    expect(base.raceWeek).toBeUndefined();
  });

  it("gives the sets back when the build ends", () => {
    const build = advanceWeek(week(), "intermediate", undefined, half(6), yes);
    const next = advanceWeek(
      {
        ...build,
        workouts: build.workouts.map((d) => ({ ...d, completed: true })),
      },
      "intermediate",
      undefined,
      half(13),
      yes
    );
    // The last two weeks before the race: half the plan's sets, not half
    // the trimmed ones.
    expect(next.raceWeek).toBe("taper");
    expect(setsOf(next)).toEqual([2, 2, 2]);
  });

  it("never stacks on a lighter week", () => {
    // Lifting week 8 is the cycle's lighter week without a race; with one,
    // the run plan's step-back week is (Lift4 (9)).
    const stepBack = advanceWeek(
      week({ weekNumber: 6 }),
      "intermediate",
      undefined,
      half(7),
      yes
    );
    expect(stepBack.currentPhase).toBe("deload");
    expect(stepBack.raceWeek).toBeUndefined();
    // Half the plan's sets: 3 → 2, 4 → 2, 3 → 2.
    expect(setsOf(stepBack)).toEqual([2, 2, 2]);
  });

  it("waits out the first week back after a break", () => {
    const eased = easeBackIn(week(), 0.1);
    const idle = {
      ...eased,
      workouts: eased.workouts.map((d) => ({ ...d, completed: false })),
    };
    const out = advanceWeek(idle, "intermediate", undefined, half(6), yes);
    // Still the first week back: one set fewer on every lift, no trim.
    expect(setsOf(out)).toEqual([2, 3, 2]);
    expect(out.raceWeek).toBeUndefined();
  });
});

describe("withRaceLegTrim", () => {
  it("changes only sessions not yet done", () => {
    const workouts = [day("A", true), day("B", false)];
    const on = withRaceLegTrim(workouts, true);
    expect(setsOf({ workouts: on })).toEqual([3, 4, 3]);
    expect(on[1].exercises.map((e) => e.sets)).toEqual([2, 3, 3]);
    const off = withRaceLegTrim(on, false);
    expect(off[1].exercises.map((e) => e.sets)).toEqual([3, 4, 3]);
  });
});

describe("what a trimmed build week says", () => {
  const trimmedWeek = advanceWeek(
    week(),
    "intermediate",
    undefined,
    half(6),
    yes
  );
  const programme = {
    ...trimmedWeek,
    primaryGoal: "running" as const,
    runPlan: {
      mode: "race_prep" as const,
      raceGoal: { distance: "half" as const, targetDate: "2026-12-20" },
      currentWeek: 6,
      totalWeeks: 16,
    },
  };
  const why = (day: WorkoutDay) =>
    liftSessionPurpose(programme, day, "2026-09-10", "intermediate");

  it("says why a session's leg lifts have fewer sets", () => {
    expect(why(trimmedWeek.workouts[0])).toContain(RACE_BUILD_LEGS);
  });

  it("says nothing of it on a day whose legs kept their sets", () => {
    const upper: WorkoutDay = {
      ...trimmedWeek.workouts[0],
      exercises: trimmedWeek.workouts[0].exercises.filter(
        (e) => e.movementCategory === "horizontal_push"
      ),
    };
    expect(why(upper)).not.toContain(RACE_BUILD_LEGS);
    const twoSetLegs: WorkoutDay = {
      ...trimmedWeek.workouts[0],
      exercises: [lift({ sets: 2, baseSets: 2 })],
    };
    expect(why(twoSetLegs)).not.toContain(RACE_BUILD_LEGS);
  });
});
