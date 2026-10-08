/**
 * A bodyweight lift on a fixed target climbs a rep when every set hits it
 * (Lift4 (6), on the axis (7) lowers it on: reps, D-LIFT-11's "+1 per
 * success"). Fixed targets are the role table's for strength and running
 * main lifts, so pull-ups as a Get stronger or Support my running main sat
 * at their first target for good: the linear path climbed only on a 2-rep
 * overshoot, and then a single rep, so a lifter doing what the plan asked,
 * or a rep more, never moved. A range-less double already climbed one past
 * what was done (`impliedDoubleRangeMax`); the fixed target now does too.
 */
import { describe, expect, it } from "vitest";
import { applySessionSets } from "../programEngine";
import type { ProgramExercise } from "../programTypes";
import { readSessionSets } from "../sessionSets";

function pullUps(over: Partial<ProgramExercise> = {}): ProgramExercise {
  return {
    name: "Pull-Ups",
    exerciseId: "pull-ups",
    movementCategory: "vertical_pull",
    sets: 4,
    reps: 7,
    baseReps: 7,
    weight: 0,
    progressionType: "linear",
    lastSuccessfulWeight: 0,
    lastAttemptedWeight: 0,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    ...over,
  };
}

/** A session of the lift's sets at no added load, one rep count each. */
function session(ex: ProgramExercise, reps: number[]): ProgramExercise {
  const read = readSessionSets(
    reps.map((r) => ({ completed: true, type: "working", weight: 0, reps: r })),
    ex.sets
  );
  if (!read) throw new Error("no working set");
  return applySessionSets(ex, read, false);
}

describe("a bodyweight lift on a fixed target", () => {
  it("climbs a rep from a session at exactly the target", () => {
    const out = session(pullUps(), [7, 7, 7, 7]);
    expect(out.reps).toBe(8);
    expect(out.weight).toBe(0);
  });

  it("keeps climbing for a lifter who does what the plan asks", () => {
    let ex = pullUps();
    for (let i = 0; i < 10; i++) ex = session(ex, Array(4).fill(ex.reps));
    expect(ex.reps).toBe(17);
  });

  it("climbs one past what every set reached", () => {
    expect(session(pullUps(), [9, 8, 8, 8]).reps).toBe(9);
  });

  it("holds when a set falls short, without a miss", () => {
    const out = session(pullUps(), [8, 7, 7, 6]);
    expect(out.reps).toBe(7);
    expect(out.consecutiveFailures).toBe(0);
  });

  it("climbs back after the plan lowered it", () => {
    const lowered = session(pullUps({ consecutiveFailures: 1 }), [6, 5, 5, 5]);
    expect(lowered.reps).toBe(6);
    expect(session(lowered, [6, 6, 6, 6]).reps).toBe(7);
  });

  it("stops at 20 reps, where the plan asks for added load", () => {
    const out = session(pullUps({ reps: 20 }), [20, 20, 20, 20]);
    expect(out.reps).toBe(20);
    expect(out.notes).toMatch(/add load/i);
  });
});
