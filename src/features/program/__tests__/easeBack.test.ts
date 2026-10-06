/**
 * "Ease back in" after a break (Lift4 (11)), the Welcome back sheet's one
 * plan change: the loads 10% or 20% lighter on each lift's own steps, one
 * set fewer in the first week back, a step back up each session to where
 * the lift was, the miss counts reset, and no calendar lighter week in the
 * return's first two weeks, since the break was the rest.
 */
import { describe, it, expect } from "vitest";
import {
  advanceWeek,
  applySessionSets,
  easeBackIn,
  generateProgram,
} from "../programEngine";
import { lighterWeekAllowed } from "../weekPrescription";
import { readSessionSets } from "../sessionSets";
import type {
  ProgramExercise,
  ProgramState,
  WorkoutDay,
} from "../programTypes";

function ex(over: Partial<ProgramExercise>): ProgramExercise {
  return {
    name: "Bench Press",
    exerciseId: "bench-press",
    instanceId: "bench",
    movementCategory: "horizontal_push",
    sets: 3,
    reps: 8,
    weight: 100,
    progressionType: "double",
    lastSuccessfulWeight: 100,
    lastAttemptedWeight: 100,
    consecutiveFailures: 1,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    ...over,
  };
}

const day = (exercises: ProgramExercise[]): WorkoutDay => ({
  dayName: "Full body",
  dayType: "full_body",
  completed: false,
  exercises,
});

function state(over: Partial<ProgramState> = {}): ProgramState {
  return {
    goal: "recomp",
    currentPhase: "progression",
    weekNumber: 3,
    splitType: "full_body",
    fatigueScore: 0,
    updatedAt: 0,
    workouts: [
      day([
        ex({}),
        ex({
          name: "Pull-ups",
          exerciseId: "pull-ups",
          instanceId: "pull",
          weight: 0,
          reps: 10,
        }),
        ex({
          name: "Plank",
          exerciseId: "plank",
          instanceId: "plank",
          weight: 0,
          reps: 40,
          repUnit: "seconds",
        }),
        ex({
          name: "Romanian Deadlift",
          exerciseId: "romanian-deadlift",
          instanceId: "rdl",
          weight: 0,
        }),
      ]),
    ],
    ...over,
  };
}

const lifts = (s: ProgramState) =>
  Object.fromEntries(s.workouts[0].exercises.map((e) => [e.instanceId, e]));

describe("easeBackIn — what the plan comes down to", () => {
  it("takes the share off a loaded lift on its steps, and keeps where it was", () => {
    const out = lifts(easeBackIn(state(), 0.1));
    expect(out.bench.weight).toBe(90);
    expect(out.bench.lowered).toEqual({
      exerciseId: "bench-press",
      from: 100,
      unit: "kg",
      target: 8,
      shown: true,
    });
    expect(lifts(easeBackIn(state(), 0.2)).bench.weight).toBe(80);
  });

  it("takes at least one step, however small the share", () => {
    const light = state({
      workouts: [day([ex({ weight: 20, exerciseId: "bench-press" })])],
    });
    expect(lifts(easeBackIn(light, 0.1)).bench.weight).toBe(17.5);
  });

  it("shortens a bodyweight lift's reps and a hold's seconds instead", () => {
    const out = lifts(easeBackIn(state(), 0.2));
    expect(out.pull.reps).toBe(8);
    expect(out.pull.weight).toBe(0);
    expect(out.pull.lowered).toBeUndefined();
    // Holds come down in 5-second steps.
    expect(out.plank.reps).toBe(30);
  });

  it("leaves a lift with no weight yet at none", () => {
    const out = lifts(easeBackIn(state(), 0.1));
    expect(out.rdl.weight).toBe(0);
    expect(out.rdl.lowered).toBeUndefined();
  });

  it("takes a set off this week and starts the miss counts again", () => {
    const out = easeBackIn(state(), 0.1);
    for (const lift of out.workouts[0].exercises) {
      expect(lift.sets).toBe(2);
      expect(lift.baseSets).toBe(3);
      expect(lift.consecutiveFailures).toBe(0);
    }
    expect(out.easingBack).toEqual({ weeksLeft: 2 });
  });

  it("keeps climbing to the weight a drop came from, when there was one", () => {
    const dropped = state({
      workouts: [
        day([
          ex({
            weight: 90,
            lowered: {
              exerciseId: "bench-press",
              from: 100,
              unit: "kg",
              target: 8,
              shown: true,
            },
          }),
        ]),
      ],
    });
    const out = lifts(easeBackIn(dropped, 0.1));
    expect(out.bench.weight).toBe(80);
    expect(out.bench.lowered?.from).toBe(100);
  });
});

describe("after easing back", () => {
  it("climbs back a step a session to where the lift was", () => {
    let lift = lifts(easeBackIn(state(), 0.1)).bench;
    const session = (weight: number) =>
      readSessionSets(
        Array.from({ length: lift.sets }, () => ({
          weight,
          reps: lift.reps,
          completed: true,
        })),
        lift.sets
      )!;
    const weights: number[] = [];
    for (let i = 0; i < 6; i++) {
      lift = applySessionSets(lift, session(lift.weight), false);
      weights.push(lift.weight);
    }
    expect(weights.slice(0, 4)).toEqual([92.5, 95, 97.5, 100]);
    // Back where it was, the usual rules take over and the record goes.
    expect(lift.lowered).toBeUndefined();
  });

  const trainedWeek = (s: ProgramState): ProgramState => ({
    ...s,
    workouts: s.workouts.map((d) => ({ ...d, completed: true })),
  });

  it("keeps the set fewer through a week with no training in it", () => {
    const eased = easeBackIn(state(), 0.1);
    const idle = advanceWeek(eased, "intermediate");
    expect(idle.weekNumber).toBe(3);
    expect(idle.easingBack).toEqual({ weeksLeft: 2 });
    expect(idle.workouts[0].exercises[0].sets).toBe(2);
    // The first trained week back gives the set back.
    const next = advanceWeek(trainedWeek(idle), "intermediate");
    expect(next.workouts[0].exercises[0].sets).toBe(3);
    expect(next.easingBack).toEqual({ weeksLeft: 1 });
  });

  it("brings no calendar lighter week in the first two weeks back", () => {
    // Three trained lift days, an intermediate: the cycle's lighter week
    // would come at week 4.
    const { workouts } = generateProgram(3, undefined, "general");
    const eased = easeBackIn(state({ workouts, weekNumber: 3 }), 0.1);
    const week4 = advanceWeek(trainedWeek(eased), "intermediate");
    expect(week4.weekNumber).toBe(4);
    expect(week4.currentPhase).toBe("progression");
    const week5 = advanceWeek(trainedWeek(week4), "intermediate");
    expect(week5.easingBack).toBeUndefined();
    // The return over, the calendar runs as before.
    const week8 = [5, 6, 7].reduce(
      (s) => advanceWeek(trainedWeek(s), "intermediate"),
      week5
    );
    expect(week8.weekNumber).toBe(8);
    expect(week8.currentPhase).toBe("deload");
  });

  it("has no lighter week to take in the first week back", () => {
    const eased = easeBackIn(state(), 0.1);
    expect(lighterWeekAllowed(eased)).toBe(false);
    const second = advanceWeek(trainedWeek(eased), "intermediate");
    expect(lighterWeekAllowed(second)).toBe(true);
  });
});
