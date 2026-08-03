/**
 * Cold-start load is seeded for the rep target the programme prescribes.
 *
 * ── The defect ───────────────────────────────────────────────────────────
 *
 * `startingWeightForExercise` took no rep argument, so a 5-rep `strength`
 * main, an 8-rep `hypertrophy` main and a 12-rep `fat_loss` main were all
 * seeded at the same weight. The rep number was a label with no effect on
 * load, which meant a goal's prescribed INTENSITY was delivered by nothing.
 *
 * That is why a rep-range change cannot make training heavier on its own:
 * `represcribe.scaleLoadForReps` deliberately refuses to raise load when reps
 * fall (right there — silently adding weight to an existing prescription is
 * unsafe) and the generator carries an existing weight verbatim on
 * regenerate. So prescribing fewer reps, alone, hands the user a strictly
 * EASIER session — the inverse of the intent.
 *
 * ── What is asserted ─────────────────────────────────────────────────────
 *
 * Direction and ordering, not the arithmetic. Recomputing the Epley term and
 * comparing would pin consistency rather than behaviour, and would survive
 * the ratio being inverted. The tests below fail if the scaling is dropped,
 * inverted, or applied per-slot instead of per-programme.
 */
import { describe, it, expect } from "vitest";

import { buildPlan } from "../planBuilder";
import { repScaledSeed, startingWeightForExercise } from "../startingLoads";
import { goalProfileFor } from "../programEngine";
import type { PrimaryGoal, ProgramExercise } from "../programTypes";

const CTX = {
  bodyweightKg: 80,
  experience: "intermediate" as const,
  sex: "male",
};

function plan(primaryGoal: PrimaryGoal) {
  return buildPlan({
    primaryGoal,
    nutritionPhase: "recomp",
    experience: "intermediate",
    bodyweightKg: 80,
    sex: "male",
    liftDays: 3,
    preferredSplit: "auto",
    runMode: "freeform",
    weeklyRunDays: 0,
    equipment: "full_gym",
    injuries: [],
    currentDate: "2026-03-08",
  });
}

/** Every prescribed slot for one exercise across the generated week. */
function slotsFor(primaryGoal: PrimaryGoal, exerciseId: string) {
  const out: ProgramExercise[] = [];
  for (const day of plan(primaryGoal).programState.workouts ?? []) {
    for (const ex of day.exercises)
      if (ex.exerciseId === exerciseId) out.push(ex);
  }
  return out;
}

function seedFor(primaryGoal: PrimaryGoal, exerciseId: string): number {
  const slots = slotsFor(primaryGoal, exerciseId);
  expect(
    slots.length,
    `${primaryGoal}: ${exerciseId} not prescribed`
  ).toBeGreaterThan(0);
  return slots[0].weight;
}

describe("the seed answers to the rep target", () => {
  it("fewer prescribed reps means a heavier cold-start load", () => {
    // The whole point. `running` mains are 4-6, `hypertrophy` 8-12,
    // `fat_loss` 12-15 — so the seeded bar weight must be ordered the other
    // way round. Pre-fix all three were identical.
    const bench = {
      running: seedFor("running", "bench-press"),
      hypertrophy: seedFor("hypertrophy", "bench-press"),
      fat_loss: seedFor("fat_loss", "bench-press"),
    };
    expect(bench.running).toBeGreaterThan(bench.hypertrophy);
    expect(bench.hypertrophy).toBeGreaterThan(bench.fat_loss);
  });

  it("strength was already mis-seeded, and is fixed by the same change", () => {
    // `strength` has prescribed 5-rep mains for a long time while being
    // seeded at the ~8-rep anchor — a pre-existing instance of this defect
    // that the running change happens to resolve. Worth pinning so it can't
    // silently regress back.
    expect(goalProfileFor("strength").mainReps).toBeLessThan(
      goalProfileFor("hypertrophy").mainReps
    );
    expect(seedFor("strength", "bench-press")).toBeGreaterThan(
      seedFor("hypertrophy", "bench-press")
    );
  });

  it("the anchor goal is unchanged — the table is calibrated at ~8 reps", () => {
    // `hypertrophy` mains sit exactly on the anchor, so its seeds must be
    // byte-identical to the rep-blind behaviour. This is what makes the
    // change safe to reason about: only goals that prescribe away from 8
    // move at all.
    expect(goalProfileFor("hypertrophy").mainReps).toBe(8);
    expect(repScaledSeed(100, 8)).toBe(100);
    expect(
      startingWeightForExercise("bench-press", "horizontal_push", CTX, false, 8)
    ).toBe(
      startingWeightForExercise("bench-press", "horizontal_push", CTX, false)
    );
  });

  it("one lift keeps ONE load across the week", () => {
    // The anchor is per-PROGRAMME, not per-slot. Seeding runs after
    // `applyDayRoles`, so a per-slot rep target would be the undulated
    // per-day value; and some builders prescribe accessory reps on slots they
    // do not flag `isAccessory` (bench-press is a main on one hypertrophy/3d
    // day and an accessory on another). Either input splits a lift's load in
    // two. `generatorAudit` covers this across the whole sweep; this pins the
    // specific case that broke during implementation.
    for (const goal of [
      "running",
      "hypertrophy",
      "strength",
      "fat_loss",
    ] as const) {
      const slots = slotsFor(goal, "bench-press");
      const weights = new Set(slots.map((s) => s.weight));
      // The undulated rep targets genuinely differ...
      expect(new Set(slots.map((s) => s.reps)).size).toBeGreaterThanOrEqual(1);
      // ...but the load does not.
      expect(weights.size, `${goal}: bench-press ${[...weights]}`).toBe(1);
    }
  });
});

describe("repScaledSeed is bounded and total", () => {
  it("scales up below the anchor and down above it", () => {
    expect(repScaledSeed(100, 4)).toBeGreaterThan(100);
    expect(repScaledSeed(100, 8)).toBe(100);
    expect(repScaledSeed(100, 12)).toBeLessThan(100);
  });

  it("is monotone in the rep target", () => {
    let prev = Infinity;
    for (let reps = 1; reps <= 20; reps++) {
      const w = repScaledSeed(100, reps);
      expect(w, `reps=${reps}`).toBeLessThanOrEqual(prev);
      prev = w;
    }
  });

  it("clamps, so a garbage rep target cannot invent a load", () => {
    // The ~8-rep anchor is approximate; an unbounded Epley term would let an
    // absurd input produce a seed the table never intended.
    for (const reps of [1, 2, 100, 1000]) {
      const w = repScaledSeed(100, reps);
      expect(w).toBeLessThanOrEqual(125);
      expect(w).toBeGreaterThanOrEqual(75);
    }
  });

  it("leaves timed work alone entirely", () => {
    // A 45-second plank is not 45 reps; running the ratio on it would read as
    // a 5.6x rep target and halve the load.
    expect(repScaledSeed(100, 45, "seconds")).toBe(100);
    expect(repScaledSeed(100, 20, "seconds")).toBe(100);
  });

  it("passes through when there is no usable target", () => {
    expect(repScaledSeed(100, undefined)).toBe(100);
    expect(repScaledSeed(100, 0)).toBe(100);
    expect(repScaledSeed(100, NaN)).toBe(100);
    expect(repScaledSeed(100, -5)).toBe(100);
  });
});

describe("both seeding passes agree", () => {
  it("planBuilder's final seeder uses the same anchor as generateProgram", () => {
    // `planBuilder` re-seeds after `generateProgram` and runs LAST, so it is
    // the one that decides the final weight — including on the preserve
    // branch, which never reaches generateProgram at all. During
    // implementation it was left rep-blind, and a `running` plan rendered 4-6
    // reps at the unchanged 8-rep weight: the "tested copy vs running copy"
    // shape with both copies in one feature directory.
    //
    // Asserted through buildPlan (the path that runs both) against the pure
    // function, so a future edit to either pass has to keep them agreeing.
    for (const goal of ["running", "strength", "fat_loss"] as const) {
      const anchor = goalProfileFor(goal).mainReps;
      const expected = startingWeightForExercise(
        "bench-press",
        "horizontal_push",
        CTX,
        false,
        anchor
      );
      expect(seedFor(goal, "bench-press"), goal).toBe(expected);
    }
  });
});
