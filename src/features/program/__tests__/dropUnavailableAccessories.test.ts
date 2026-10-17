/**
 * Lift14 — a new plan drops a supporting lift the person's kit can't do when
 * its day already trains the same muscle with one it can. A main lift, or a
 * supporting lift whose muscle nothing else on the day trains, keeps the
 * equipment filter's flag.
 */
import { describe, it, expect } from "vitest";
import { dropUnavailableAccessories } from "../matchTemplate";
import { buildOnboardingPlan } from "@/lib/onboardingPlan";
import { getExerciseById } from "@/lib/exercises";
import type {
  MovementCategory,
  ProgramExercise,
  WorkoutDay,
} from "../programTypes";

const ex = (
  exerciseId: string,
  movementCategory: MovementCategory,
  isAccessory = true
): ProgramExercise =>
  ({
    name: exerciseId,
    exerciseId,
    movementCategory,
    isAccessory,
    sets: 2,
    reps: 12,
  }) as ProgramExercise;

const day = (...exercises: ProgramExercise[]): WorkoutDay =>
  ({
    dayName: "Push",
    dayType: "push",
    completed: false,
    exercises,
  }) as WorkoutDay;

const ids = (days: WorkoutDay[]) =>
  days.map((d) => d.exercises.map((e) => e.exerciseId));

describe("dropUnavailableAccessories", () => {
  const press = ex("db-shoulder-press", "vertical_push", false);
  const pushdown = ex("rope-tricep-pushdown", "arms_triceps");
  const kickback = ex("tricep-kickback", "arms_triceps");

  it("drops a cable pushdown at home when kickbacks already train the triceps", () => {
    expect(
      ids(
        dropUnavailableAccessories([day(press, pushdown, kickback)], "home_gym")
      )
    ).toEqual([["db-shoulder-press", "tricep-kickback"]]);
  });

  it("drops a cable pulldown at home beside dumbbell rows, a lat lift too", () => {
    const rows = ex("db-row", "horizontal_pull", false);
    const pulldown = ex("lat-pulldown", "vertical_pull");
    expect(
      ids(dropUnavailableAccessories([day(rows, pulldown)], "minimal"))
    ).toEqual([["db-row"]]);
  });

  it("keeps it, flagged, when nothing else on the day trains its muscle", () => {
    const week = [day(press, pushdown)];
    expect(dropUnavailableAccessories(week, "home_gym")[0]).toBe(week[0]);
  });

  it("keeps a main lift the kit can't do", () => {
    const landmine = ex("landmine-press", "vertical_push", false);
    const week = [day(landmine, press)];
    expect(ids(dropUnavailableAccessories(week, "home_gym"))).toEqual([
      ["landmine-press", "db-shoulder-press"],
    ]);
  });

  it("keeps what a full gym, or a barbell at home, can do", () => {
    const thrust = ex("hip-thrust", "hip_dominant");
    const bridge = ex("glute-bridge", "hip_dominant");
    const week = [day(thrust, bridge)];
    expect(dropUnavailableAccessories(week, "full_gym")[0]).toBe(week[0]);
    expect(dropUnavailableAccessories(week, "home_gym", true)[0]).toBe(week[0]);
    expect(ids(dropUnavailableAccessories(week, "home_gym"))).toEqual([
      ["glute-bridge"],
    ]);
  });
});

describe("a new plan with an injury holds no supporting lift its kit can't do", () => {
  it.each([
    ["hypertrophy", "beginner", 5, ["elbow"]],
    ["general", "intermediate", 4, ["elbow"]],
    ["hypertrophy", "intermediate", 6, ["knee", "lower_back"]],
  ] as const)("%s %s, %i days, %j at home", (goal, level, days, injuries) => {
    for (const equipment of ["home_gym", "minimal"]) {
      const plan = buildOnboardingPlan(
        {
          primaryGoal: goal,
          daysPerWeek: days,
          sessionMinutes: 60,
          equipment,
          runFrequency: "none",
          runMode: "freeform",
          weeklyRunDays: 0,
          raceDistance: "10k",
          raceTargetDate: "",
          injuries: [...injuries],
          gender: "male",
          weightKg: 90,
          experience: level,
        } as never,
        "recomp",
        "2026-09-07"
      );
      const outOfKit = plan.programState.workouts.flatMap((d) =>
        d.exercises.filter((e) => {
          const eq = getExerciseById(e.exerciseId)?.equipment;
          return (
            e.isAccessory &&
            eq !== undefined &&
            !["Dumbbells", "Bodyweight", "Kettlebell"].includes(eq)
          );
        })
      );
      expect(
        outOfKit.map((e) => e.exerciseId),
        equipment
      ).toEqual([]);
    }
  });
});
