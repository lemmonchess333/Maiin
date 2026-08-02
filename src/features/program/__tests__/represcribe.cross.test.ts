import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

import {
  assignDayRoles,
  goalProfileFor,
  prescribedRepCeiling,
  repDeltaForRole,
  repFloorFor,
  repRangeMaxFor,
} from "../programEngine";
import { toExperience, usesUndulation } from "../experienceModel";
import {
  BLOCK_AMNESTY_WEEKS,
  represcribeWorkouts,
  scaleLoadForReps,
} from "../represcribe";
import { makeBlockId } from "../trainingBlock";
import type { PrimaryGoal, WorkoutDay } from "../programTypes";
import type { Experience } from "../experienceModel";

/**
 * Parity guard (Blk2 / P6): the goal-prescription engine is now double-sited.
 *
 * A training block re-derives a whole week's rep targets for a new focus, and
 * releasing it applies the SAME transform with `goalBefore` — which is why
 * there is no per-slot snapshot. `startTrainingBlock` and
 * `releaseTrainingBlock` were the last writers holding a document write
 * precisely because this rule had no server copy; now it does
 * (`functions/lib/represcribe.js`), and the server copy is the one that
 * decides what a block actually writes.
 *
 * Drift here is invisible in the worst way: both copies emit a well-formed
 * week. The user would simply be handed different rep targets than the ones
 * they saw when they started the block, with nothing thrown and nothing
 * logged. So this walks the full cross-product rather than sampling — every
 * goal × every experience × week lengths 0-6 — because the undulation delta
 * is per DAY INDEX and only shows up at particular week shapes.
 */
const require = createRequire(import.meta.url);
const cf = require("../../../../functions/lib/represcribe") as {
  BLOCK_AMNESTY_WEEKS: number;
  PRIMARY_GOALS: readonly string[];
  assignDayRoles: (count: number) => string[];
  goalProfileFor: (goal?: string) => Record<string, unknown>;
  makeBlockId: (startDate: string, createdAt: number) => string;
  prescribedRepCeiling: (ex: unknown) => number;
  repDeltaForRole: (role: string) => number;
  repFloorFor: (ex: unknown) => number;
  repRangeMaxFor: (
    ex: unknown,
    reps: number,
    span: number
  ) => number | undefined;
  represcribeWorkouts: (
    workouts: unknown,
    goal: string,
    experience: string | undefined
  ) => WorkoutDay[];
  scaleLoadForReps: (w: number, from: number, to: number) => number;
  toExperience: (v: string | undefined) => string;
  usesUndulation: (e: string | undefined) => boolean;
};

const GOALS: PrimaryGoal[] = [
  "strength",
  "hypertrophy",
  "fat_loss",
  "general",
  "running",
];
const EXPERIENCES: (Experience | undefined)[] = [
  undefined,
  "beginner",
  "intermediate",
  "advanced",
];

/** A slot deliberately covering each branch of the transform. */
function exercise(over: Record<string, unknown> = {}) {
  return {
    name: "Bench Press",
    exerciseId: "bench-press",
    instanceId: "i-1",
    movementCategory: "horizontal_push",
    sets: 3,
    reps: 8,
    baseReps: 8,
    weight: 60,
    progressionType: "double",
    lastSuccessfulWeight: 60,
    lastAttemptedWeight: 60,
    consecutiveFailures: 2,
    plateauCount: 1,
    performanceHistory: [],
    lastPerformance: null,
    ...over,
  };
}

function week(days: number): WorkoutDay[] {
  return Array.from({ length: days }, (_, i) => ({
    dayName: `Day ${i + 1}`,
    dayType: "upper",
    completed: false,
    skipped: false,
    exercises: [
      exercise({ instanceId: `main-${i}` }),
      exercise({
        instanceId: `acc-${i}`,
        exerciseId: "cable-fly",
        isAccessory: true,
        reps: 12,
        baseReps: 12,
        weight: 20,
      }),
      // Bodyweight: a LOWER ceiling (15), the branch a single fixture misses.
      exercise({
        instanceId: `bw-${i}`,
        exerciseId: "pull-ups",
        weight: 0,
      }),
      // Timed hold: must be returned untouched.
      exercise({
        instanceId: `hold-${i}`,
        exerciseId: "plank",
        repUnit: "seconds",
        reps: 45,
        baseReps: 45,
        weight: 0,
      }),
    ],
  })) as unknown as WorkoutDay[];
}

describe("goal-prescription engine — client vs functions mirror", () => {
  it("BLOCK_AMNESTY_WEEKS agrees", () => {
    expect(cf.BLOCK_AMNESTY_WEEKS).toBe(BLOCK_AMNESTY_WEEKS);
  });

  it("goalProfileFor agrees for every goal in the union", () => {
    for (const goal of GOALS) {
      expect(cf.goalProfileFor(goal), goal).toEqual(goalProfileFor(goal));
    }
    // The server's PRIMARY_GOALS list must not drift from the union either,
    // or a new goal would silently resolve to `general` server-side.
    expect(new Set(cf.PRIMARY_GOALS)).toEqual(new Set(GOALS));
  });

  it("goalProfileFor: undefined means general on both sides", () => {
    expect(cf.goalProfileFor(undefined)).toEqual(goalProfileFor(undefined));
  });

  it("an UNKNOWN goal is the one deliberate divergence", () => {
    // Documented in the mirror's header rather than asserted as equality.
    // The client would return undefined and throw on the first property
    // read; the server reads `block.goalBefore` out of stored (untrusted)
    // state, where a throw fails the whole transaction instead of degrading.
    expect(cf.goalProfileFor("not_a_goal")).toEqual(goalProfileFor("general"));
    expect(
      (goalProfileFor as (g?: string) => unknown)("not_a_goal")
    ).toBeUndefined();
  });

  it("assignDayRoles agrees for 0-8 days", () => {
    for (let n = 0; n <= 8; n++) {
      expect(cf.assignDayRoles(n), `${n} days`).toEqual(assignDayRoles(n));
    }
  });

  it("repDeltaForRole agrees", () => {
    for (const role of ["heavy", "moderate", "pump"]) {
      expect(cf.repDeltaForRole(role)).toBe(
        repDeltaForRole(role as "heavy" | "moderate" | "pump")
      );
    }
  });

  it("repFloorFor agrees for main and accessory", () => {
    expect(cf.repFloorFor({})).toBe(repFloorFor({}));
    expect(cf.repFloorFor({ isAccessory: true })).toBe(
      repFloorFor({ isAccessory: true })
    );
  });

  it("prescribedRepCeiling agrees across barbell / bodyweight / timed", () => {
    const cases = [
      { exerciseId: "bench-press" },
      { exerciseId: "pull-ups" },
      { exerciseId: "plank", repUnit: "seconds" },
      {},
    ];
    for (const ex of cases) {
      expect(cf.prescribedRepCeiling(ex), JSON.stringify(ex)).toBe(
        prescribedRepCeiling(ex)
      );
    }
  });

  it("repRangeMaxFor agrees across the clamp boundaries", () => {
    for (const ex of [
      { exerciseId: "bench-press" },
      { exerciseId: "pull-ups" },
    ])
      for (const reps of [3, 8, 12, 15, 18, 20])
        for (const span of [0, 2, 4, 7]) {
          expect(
            cf.repRangeMaxFor(ex, reps, span),
            `${JSON.stringify(ex)} reps=${reps} span=${span}`
          ).toBe(repRangeMaxFor(ex, reps, span));
        }
  });

  it("usesUndulation and toExperience agree", () => {
    for (const e of [...EXPERIENCES, "nonsense" as Experience]) {
      expect(cf.usesUndulation(e), String(e)).toBe(usesUndulation(e));
      expect(cf.toExperience(e as string | undefined), String(e)).toBe(
        toExperience(e as string | undefined)
      );
    }
  });

  it("scaleLoadForReps agrees, including the rounding boundaries", () => {
    const weights = [0, -5, 1, 20, 42.5, 60, 100, 137.5];
    const reps = [1, 3, 5, 8, 12, 15, 20];
    for (const w of weights)
      for (const from of reps)
        for (const to of reps) {
          expect(
            cf.scaleLoadForReps(w, from, to),
            `w=${w} ${from}->${to}`
          ).toBe(scaleLoadForReps(w, from, to));
        }
    // Non-finite inputs take the early returns on both sides.
    expect(cf.scaleLoadForReps(NaN, 8, 12)).toBe(scaleLoadForReps(NaN, 8, 12));
    expect(cf.scaleLoadForReps(60, NaN, 12)).toBe(
      scaleLoadForReps(60, NaN, 12)
    );
  });

  it("makeBlockId agrees", () => {
    expect(cf.makeBlockId("2026-03-02", 1_700_000_000_000)).toBe(
      makeBlockId("2026-03-02", 1_700_000_000_000)
    );
  });

  // ── The composition, which is what actually runs ──────────────────────

  it("represcribeWorkouts agrees for every goal × experience × week length", () => {
    for (const goal of GOALS) {
      for (const experience of EXPERIENCES) {
        for (let days = 0; days <= 6; days++) {
          expect(
            cf.represcribeWorkouts(week(days), goal, experience),
            `goal=${goal} exp=${experience} days=${days}`
          ).toEqual(represcribeWorkouts(week(days), goal, experience));
        }
      }
    }
  });

  it("represcribeWorkouts leaves a timed hold entirely alone on both sides", () => {
    const out = cf.represcribeWorkouts(week(3), "strength", "advanced");
    const hold = out[0].exercises.find((e) => e.instanceId === "hold-0")!;
    expect(hold.reps).toBe(45);
    expect(hold.baseReps).toBe(45);
    // And the counters it did NOT reset, unlike every other slot.
    expect(hold.consecutiveFailures).toBe(2);
    expect(hold.plateauCount).toBe(1);
  });

  it("represcribeWorkouts clears the stale counters on a real slot", () => {
    // Guards the mirror against being simplified to a reps-only rewrite:
    // failure counters accumulated against a retired target are not evidence.
    const out = cf.represcribeWorkouts(week(1), "strength", "advanced");
    const main = out[0].exercises.find((e) => e.instanceId === "main-0")!;
    expect(main.consecutiveFailures).toBe(0);
    expect(main.plateauCount).toBe(0);
    expect(main.baseReps).toBe(main.reps);
  });
});
