/**
 * Rep floors by lift type, and an injury swap's reps (training deep dive,
 * D2 and D5). Swept over 2,700 plans before this change (three levels, five
 * goals, two to six days, three kits, four injury sets, three lengths):
 * 3,168 dumbbell or one-leg slots asked under six reps ("Bulgarian Split
 * Squat 3 × 5", "Dumbbell RDL 3 × 5"), and a sore knee's split squat took
 * the squat's fixed five in 780. After it: none under six, and a lift held
 * for an injury asks 8 to 12 where its slot asked fewer.
 */
import { describe, expect, it } from "vitest";
import {
  hasSixRepFloor,
  injurySwapReps,
  roleRepsFor,
  SIX_REP_FLOOR,
} from "../roleTable";
import { repFloorFor } from "../programEngine";
import { buildPlan, type PlanBuilderInput } from "../planBuilder";
import { getExerciseById } from "@/lib/exercises";

describe("the six-rep floor", () => {
  it("is for dumbbells, kettlebells and one leg at a time", () => {
    expect(hasSixRepFloor("db-bench")).toBe(true);
    expect(hasSixRepFloor("kettlebell-swing")).toBe(true);
    expect(hasSixRepFloor("bulgarian-split")).toBe(true);
    expect(hasSixRepFloor("barbell-step-ups")).toBe(true);
    expect(hasSixRepFloor("bench-press")).toBe(false);
    expect(hasSixRepFloor("squat")).toBe(false);
  });

  it("raises a strength plan's fixed five to six on a dumbbell main lift", () => {
    expect(
      roleRepsFor("strength", { exerciseId: "squat" }, "intermediate")
    ).toEqual({ sets: 4, bottom: 5 });
    expect(
      roleRepsFor("strength", { exerciseId: "db-bench" }, "intermediate")
    ).toEqual({ sets: 4, bottom: SIX_REP_FLOOR });
  });

  it("leaves a range already at six or more as it is", () => {
    expect(
      roleRepsFor(
        "hypertrophy",
        { exerciseId: "db-bench", isAccessory: true },
        "intermediate"
      )
    ).toEqual({ sets: 3, bottom: 8, top: 12 });
  });

  it("holds through a heavy day's shift, in a main lift's slot too", () => {
    expect(repFloorFor({ exerciseId: "db-bench" })).toBe(SIX_REP_FLOOR);
    expect(repFloorFor({ exerciseId: "bulgarian-split" })).toBe(SIX_REP_FLOOR);
    expect(repFloorFor({ exerciseId: "squat" })).toBe(3);
  });
});

describe("an injury swap's reps", () => {
  it("asks 8 to 12 where the slot asked fewer", () => {
    expect(
      injurySwapReps(
        "strength",
        { exerciseId: "bulgarian-split" },
        "intermediate"
      )
    ).toEqual({ sets: 4, bottom: 8, top: 12 });
  });

  it("keeps a slot that asks 8 or more", () => {
    expect(
      injurySwapReps(
        "hypertrophy",
        { exerciseId: "dead-bug", isAccessory: true },
        "intermediate"
      )
    ).toEqual(
      roleRepsFor(
        "hypertrophy",
        { exerciseId: "dead-bug", isAccessory: true },
        "intermediate"
      )
    );
  });

  it("keeps a floor deadlift's own row, which never passes eight", () => {
    expect(
      injurySwapReps(
        "strength",
        { exerciseId: "trap-bar-deadlift" },
        "intermediate"
      )
    ).toEqual(
      roleRepsFor(
        "strength",
        { exerciseId: "trap-bar-deadlift" },
        "intermediate"
      )
    );
  });
});

describe("plans built with the floors", () => {
  const input = (over: Partial<PlanBuilderInput> = {}): PlanBuilderInput =>
    ({
      primaryGoal: "strength",
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
      sessionMinutes: 60,
      currentDate: "2026-03-08",
      ...over,
    }) as PlanBuilderInput;
  const lifts = (i: PlanBuilderInput) =>
    buildPlan(i).programState.workouts.flatMap((d) => d.exercises);

  it("gives a sore knee's split squat 8 to 12, not the squat's five", () => {
    const split = lifts(input({ injuries: ["knee"] })).filter(
      (ex) => ex.exerciseId === "bulgarian-split" && ex.swappedFrom
    );
    expect(split.length).toBeGreaterThan(0);
    for (const ex of split) {
      expect(ex.reps).toBe(8);
      expect(ex.repRangeMax).toBe(12);
    }
  });

  it("gives the same on a plan the person has, when the injury is added", () => {
    const existingState = buildPlan(input()).programState;
    const split = lifts(
      input({ injuries: ["knee"], existingState, preserveHistory: true })
    ).filter((ex) => ex.exerciseId === "bulgarian-split" && ex.swappedFrom);
    expect(split.length).toBeGreaterThan(0);
    for (const ex of split) {
      expect(ex.reps).toBe(8);
      expect(ex.repRangeMax).toBe(12);
    }
  });

  it("asks no dumbbell or one-leg lift under six in a home plan", () => {
    for (const goal of ["strength", "running"] as const)
      for (const liftDays of [2, 3, 4]) {
        for (const ex of lifts(
          input({ primaryGoal: goal, liftDays, equipment: "home_gym" })
        )) {
          if (ex.repUnit === "seconds") continue;
          const kit = getExerciseById(ex.exerciseId)?.equipment;
          if (kit === "Bodyweight") continue;
          if (hasSixRepFloor(ex.exerciseId))
            expect(
              ex.reps,
              `${goal} ${String(liftDays)}d ${ex.exerciseId}`
            ).toBeGreaterThanOrEqual(6);
        }
      }
  });
});
