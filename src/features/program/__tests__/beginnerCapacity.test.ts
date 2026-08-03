/**
 * Beginner bodyweight-floor gate (2026-08-03 beginner coach-read).
 *
 * The audit read every beginner programme as a coach and found the pull
 * slots anchored on 8-15-rep pull-up sets — a movement whose MINIMUM load
 * is the lifter's whole bodyweight, which is exactly the load a novice
 * cannot yet pull. Every reference novice programme prescribes the
 * pulldown or row regression instead. The same read found home/minimal
 * beginners handed the HANGING leg raise as their first core substitute.
 *
 * These are end-to-end pins through `buildPlan` — the split, gate,
 * injury, equipment and seeding passes all run — so they fail no matter
 * which pass regresses. The intermediate counter-pins are as load-bearing
 * as the beginner ones: the floor rule is a BEGINNER rule, and silently
 * taking pull-ups away from intermediates would be its own defect.
 */
import { describe, it, expect } from "vitest";

import { buildPlan } from "../planBuilder";
import { offerableTo } from "../experienceModel";
import type { PlanBuilderInput } from "../planBuilder";
import type { PrimaryGoal, WorkoutDay } from "../programTypes";

const GOALS: PrimaryGoal[] = [
  "hypertrophy",
  "strength",
  "fat_loss",
  "general",
  "running",
];

function input(
  liftDays: number,
  equipment: string,
  primaryGoal: PrimaryGoal,
  experience: string
): PlanBuilderInput {
  return {
    primaryGoal,
    nutritionPhase: "recomp",
    experience,
    bodyweightKg: 80,
    sex: "male",
    liftDays,
    preferredSplit: "auto",
    runMode: "freeform",
    weeklyRunDays: 0,
    equipment,
    injuries: [],
    currentDate: "2026-03-08",
  } as PlanBuilderInput;
}

function allIds(days: readonly WorkoutDay[]): string[] {
  return days.flatMap((d) => d.exercises.map((e) => e.exerciseId));
}

describe("offerableTo — the one predicate both the gate and the filter use", () => {
  it("rejects bodyweight-floor options for beginners only", () => {
    expect(offerableTo("beginner", { bodyweightFloor: true })).toBe(false);
    expect(offerableTo("intermediate", { bodyweightFloor: true })).toBe(true);
    expect(offerableTo("advanced", { bodyweightFloor: true })).toBe(true);
  });

  it("still enforces complexity for everyone it applied to before", () => {
    expect(offerableTo("beginner", { complexity: "technical" })).toBe(false);
    expect(offerableTo("intermediate", { complexity: "technical" })).toBe(true);
    expect(offerableTo("intermediate", { complexity: "advanced" })).toBe(false);
  });
});

describe("beginner plans never prescribe a bodyweight-floor pull", () => {
  it("full gym, every goal × day count: no pull-ups/chin-ups; pulldowns instead", () => {
    for (const goal of GOALS) {
      for (let days = 2; days <= 6; days++) {
        const { programState } = buildPlan(
          input(days, "full_gym", goal, "beginner")
        );
        const ids = allIds(programState.workouts);
        expect(
          ids.filter((id) => id === "pull-ups" || id === "chin-ups"),
          `${goal} × ${days}d prescribes a bodyweight-floor pull to a beginner`
        ).toHaveLength(0);
        // The slot is REPLACED, not deleted: some scalable vertical pull
        // must exist wherever the intermediate plan had one (2d+ always
        // carries at least one vertical-pull slot).
        expect(
          ids.some(
            (id) => id === "lat-pulldown" || id === "straight-arm-pulldown"
          ),
          `${goal} × ${days}d lost its vertical pull entirely`
        ).toBe(true);
      }
    }
  });

  it("home/minimal: the floor slot lands on the inverted row, never back on pull-ups", () => {
    for (const equipment of ["home_gym", "minimal"]) {
      for (let days = 2; days <= 4; days++) {
        const { programState } = buildPlan(
          input(days, equipment, "hypertrophy", "beginner")
        );
        const ids = allIds(programState.workouts);
        expect(
          ids.filter((id) => id === "pull-ups" || id === "chin-ups"),
          `${equipment} × ${days}d handed the beginner a floor pull back`
        ).toHaveLength(0);
        expect(
          ids,
          `${equipment} × ${days}d has no inverted row landing spot`
        ).toContain("inverted-row");
      }
    }
  });

  it("intermediates keep their pull-ups (the floor rule is beginner-only)", () => {
    const { programState } = buildPlan(
      input(5, "full_gym", "hypertrophy", "intermediate")
    );
    expect(allIds(programState.workouts)).toContain("pull-ups");
  });
});

describe("beginner core at home/minimal is floor-appropriate", () => {
  it("the floor crunch replaces the cable crunch — never the hanging leg raise", () => {
    // The crunch specifically (operator review): recognisable to every
    // novice AND loadable over time (dumbbell at the chest — both home
    // tiers guarantee dumbbells), the same virtue as the cable crunch it
    // stands in for. Dead bug was rejected on recognisability.
    for (const equipment of ["home_gym", "minimal"]) {
      const { programState } = buildPlan(
        input(3, equipment, "hypertrophy", "beginner")
      );
      const ids = allIds(programState.workouts);
      expect(
        ids,
        `${equipment}: hanging leg raise prescribed to a beginner`
      ).not.toContain("leg-raise");
      expect(ids, `${equipment}: no core slot survived`).toContain("crunches");
    }
  });

  it("intermediates still get the hanging leg raise as the core substitute", () => {
    const { programState } = buildPlan(
      input(4, "home_gym", "hypertrophy", "intermediate")
    );
    expect(allIds(programState.workouts)).toContain("leg-raise");
  });
});
