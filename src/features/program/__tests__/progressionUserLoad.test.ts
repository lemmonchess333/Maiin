/**
 * Lift2 — what a weight the USER chose means to progression.
 *
 * Independent literals for the two rules the parity suite can only mirror:
 *   - lighter + reps hit HOLDS (no failure counted, no cut, prescription
 *     kept) — the success predicate used to score it as a miss, walking a
 *     deliberately lighter session toward the three-strike 5% cut;
 *   - heavier + reps hit re-anchors on the weight lifted, bounded to
 *     USER_LOAD_ANCHOR_STEPS load steps over the prescription, and the step
 *     logic runs from that anchor.
 * Both engine copies are driven on every case so a rule that lands in one
 * and not the other fails here, not in production.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import {
  applyProgression,
  USER_LOAD_ANCHOR_STEPS,
} from "@/features/program/programEngine";
import type { ProgramExercise } from "@/features/program/programTypes";

const require = createRequire(import.meta.url);
const cf = require("../../../../functions/lib/progressionEngine") as {
  applyProgression: typeof applyProgression;
  USER_LOAD_ANCHOR_STEPS: number;
};

function bench(overrides: Partial<ProgramExercise> = {}): ProgramExercise {
  return {
    name: "Bench Press",
    exerciseId: "bench-press",
    movementCategory: "horizontal_push",
    sets: 3,
    reps: 6,
    baseReps: 6,
    weight: 60,
    progressionType: "double",
    lastSuccessfulWeight: 60,
    lastAttemptedWeight: 60,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    ...overrides,
  };
}

/** Run both copies and assert they agree before returning the client's. */
function both(
  ex: ProgramExercise,
  reps: number,
  weight: number,
  microloading = false
): ProgramExercise {
  const client = applyProgression(ex, reps, weight, "recomp", microloading);
  const server = cf.applyProgression(ex, reps, weight, "recomp", microloading);
  const strip = (e: ProgramExercise) => {
    const { performanceHistory: _h, ...rest } = e;
    return rest;
  };
  expect(strip(server)).toEqual(strip(client));
  return client;
}

describe("Lift2 — lighter by choice, reps hit: HOLD", () => {
  it("counts no failure, cuts nothing, keeps the prescription", () => {
    const out = both(bench({ consecutiveFailures: 2 }), 6, 50);
    expect(out.weight).toBe(60);
    expect(out.reps).toBe(6);
    expect(out.consecutiveFailures).toBe(2); // unchanged — not incremented, not reset
    expect(out.plateauCount).toBe(0);
    expect(out.lastSuccessfulWeight).toBe(50); // the load actually used
    expect(out.lastAttemptedWeight).toBe(50);
    expect(out.notes).toBeUndefined(); // notes is the injury-warning slot
  });

  it("a third strike on a lighter session is NOT a deload", () => {
    // Pre-Lift2 this cut the load 5% — for a session the user chose to run
    // lighter and completed.
    const out = both(bench({ consecutiveFailures: 2 }), 6, 55);
    expect(out.weight).toBe(60);
    expect(out.plateauCount).toBe(0);
  });

  it("lighter AND reps missed is still a miss", () => {
    const out = both(bench(), 4, 50);
    expect(out.consecutiveFailures).toBe(1);
  });

  it("does not apply to bodyweight movements (their weight is 0)", () => {
    const pullUp = bench({
      name: "Pull-Ups",
      exerciseId: "pull-ups",
      movementCategory: "vertical_pull",
      weight: 0,
      lastSuccessfulWeight: 0,
      lastAttemptedWeight: 0,
    });
    const out = both(pullUp, 8, 0);
    expect(out.reps).toBeGreaterThanOrEqual(6); // the bodyweight path ran
  });
});

describe("Lift2 — heavier, reps hit: the anchor moves to what was lifted", () => {
  it("exact reps at a heavier load moves the prescription to that load", () => {
    const out = both(bench(), 6, 65);
    expect(out.weight).toBe(65);
    expect(out.consecutiveFailures).toBe(0);
  });

  it("a 2-rep overshoot at a heavier load steps from the load lifted, not the prescription", () => {
    const out = both(bench(), 8, 65);
    expect(out.weight).toBe(67.5); // 65 + 2.5, not 62.5
    expect(out.reps).toBe(6);
  });

  it("the microloading +1 kg rides on the anchor (linear path)", () => {
    const out = both(
      bench({ progressionType: "linear", weight: 60 }),
      6,
      65,
      true
    );
    expect(out.weight).toBe(66);
  });

  it("a jump beyond four load steps keeps the prescription as anchor (fat-finger guard)", () => {
    expect(cf.USER_LOAD_ANCHOR_STEPS).toBe(USER_LOAD_ANCHOR_STEPS);
    const bound = 60 + USER_LOAD_ANCHOR_STEPS * 2.5; // 70 on a plate-pair lift
    expect(both(bench(), 8, bound).weight).toBe(bound + 2.5); // at the bound: anchored
    expect(both(bench(), 8, 200).weight).toBe(62.5); // a typo: prescription + step
  });

  it("the unchanged case: prescribed load, prescribed reps still accumulates as before", () => {
    const out = both(bench(), 6, 60);
    expect(out.weight).toBe(60);
    expect(out.consecutiveFailures).toBe(0);
  });
});
