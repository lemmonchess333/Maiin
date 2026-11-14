/**
 * Train's "Rebuild for N min" (slice 4 of
 * `docs/training-deep-dive-2026-11/build-plan.md`): a plan someone has,
 * whose days have grown past their length, has its lift days built again
 * for that length. The week, its done days and its history stay, and a
 * lift the new day holds keeps its weight.
 */
import { describe, expect, it } from "vitest";
import {
  buildPlan,
  keepWeekProgress,
  type PlanBuilderInput,
} from "../planBuilder";
import { estimateSessionMinutes } from "../expressSession";
import { hasOutgrown } from "../outgrownDay";
import type { ProgramState, WorkoutDay } from "../programTypes";

function makeInput(
  overrides: Partial<PlanBuilderInput> = {}
): PlanBuilderInput {
  return {
    primaryGoal: "hypertrophy",
    nutritionPhase: "recomp",
    experience: "intermediate",
    liftDays: 4,
    preferredSplit: "upper_lower",
    runMode: "freeform",
    weeklyRunDays: 0,
    equipment: "full_gym",
    injuries: [],
    sessionMinutes: 45,
    bodyweightKg: 80,
    sex: "male",
    currentDate: "2026-05-14",
    ...overrides,
  };
}

/** A plan in its fifth week whose first day the person filled with every
 *  lift of the week, its first day done and a week behind it. */
function grownPlan(): ProgramState {
  const state = structuredClone(buildPlan(makeInput()).programState);
  const extra = state.workouts
    .slice(1)
    .flatMap((day) => day.exercises)
    .map((ex, i) => ({ ...ex, instanceId: `added-${String(i)}` }));
  state.workouts[0] = {
    ...state.workouts[0],
    exercises: [...state.workouts[0].exercises, ...extra],
    completed: true,
    completedWorkoutId: "saved-1",
  };
  state.workouts[1] = { ...state.workouts[1], skipped: true };
  state.weekNumber = 5;
  state.weekHistory = [
    { weekNumber: 4, workouts: structuredClone(state.workouts) },
  ];
  return state;
}

const minutes = (day: WorkoutDay) =>
  estimateSessionMinutes(day.exercises, { sessionMinutes: 45 });

describe("Rebuild for the length", () => {
  it("starts from a day the notice would name", () => {
    expect(hasOutgrown(minutes(grownPlan().workouts[0]), 45)).toBe(true);
  });

  it("keeps a grown day as it is on an ordinary save", () => {
    const existingState = grownPlan();
    const out = buildPlan(
      makeInput({ existingState, preserveHistory: true })
    ).programState;
    expect(out.workouts[0].exercises).toHaveLength(
      existingState.workouts[0].exercises.length
    );
  });

  it("builds the days again to fit, every day within its length", () => {
    const existingState = grownPlan();
    const out = buildPlan(
      makeInput({ existingState, preserveHistory: true, rebuildLiftDays: true })
    ).programState;
    expect(out.workouts).toHaveLength(existingState.workouts.length);
    expect(out.sessionMinutes).toBe(45);
    for (const day of out.workouts) {
      expect(hasOutgrown(minutes(day), 45)).toBe(false);
    }
    expect(out.workouts[0].exercises.length).toBeLessThan(
      existingState.workouts[0].exercises.length
    );
  });

  it("keeps the week, its history, and the days done or skipped", () => {
    const existingState = grownPlan();
    const out = buildPlan(
      makeInput({ existingState, preserveHistory: true, rebuildLiftDays: true })
    ).programState;
    expect(out.weekNumber).toBe(5);
    expect(out.weekHistory).toEqual(existingState.weekHistory);
    expect(out.workouts[0].completed).toBe(true);
    expect(out.workouts[0].completedWorkoutId).toBe("saved-1");
    expect(out.workouts[1].skipped).toBe(true);
    expect(out.workouts.slice(2).every((d) => !d.completed && !d.skipped)).toBe(
      true
    );
  });

  it("keeps the weight of a lift the new day still holds", () => {
    const existingState = grownPlan();
    const main = existingState.workouts[0].exercises[0];
    // A lift the person has trained: its history carries load.
    existingState.workouts[0].exercises[0] = {
      ...main,
      weight: 102.5,
      performanceHistory: [
        { date: "2026-05-11", weight: 100, repsCompleted: 8, repsTarget: 8 },
      ],
    };
    const out = buildPlan(
      makeInput({ existingState, preserveHistory: true, rebuildLiftDays: true })
    ).programState;
    const same = out.workouts[0].exercises.find(
      (ex) => ex.exerciseId === main.exerciseId
    );
    expect(same?.weight).toBe(102.5);
  });
});

describe("keepWeekProgress", () => {
  const day = (dayName: string, extra: Partial<WorkoutDay> = {}): WorkoutDay =>
    ({
      dayName,
      dayType: "lift",
      exercises: [],
      completed: false,
      ...extra,
    }) as WorkoutDay;

  it("gives a done day's state to the new day of its name", () => {
    const out = keepWeekProgress(
      [
        day("Upper A"),
        day("Lower A", { completed: true, completedWorkoutId: "w1" }),
      ],
      [day("Lower A"), day("Upper A")]
    );
    expect(out[0]).toMatchObject({ completed: true, completedWorkoutId: "w1" });
    expect(out[1].completed).toBe(false);
  });

  it("falls back to the day in its place when the name has gone", () => {
    const out = keepWeekProgress(
      [day("Arms", { completed: true }), day("Legs", { skipped: true })],
      [day("Upper A"), day("Lower A")]
    );
    expect(out[0].completed).toBe(true);
    expect(out[1].skipped).toBe(true);
  });

  it("never lets a day matched by place take another's name", () => {
    const out = keepWeekProgress(
      [day("Arms", { completed: true }), day("Upper A", { skipped: true })],
      [day("Upper A"), day("Lower A")]
    );
    expect(out[0].skipped).toBe(true);
    expect(out[0].completed).toBe(false);
    expect(out[1].completed).toBe(true);
  });

  it("clears what the built days carried", () => {
    const out = keepWeekProgress(
      [day("Upper A")],
      [
        day("Upper A", {
          completed: true,
          skipped: true,
          completedWorkoutId: "x",
        }),
      ]
    );
    expect(out[0].completed).toBe(false);
    expect(out[0]).not.toHaveProperty("skipped");
    expect(out[0]).not.toHaveProperty("completedWorkoutId");
  });
});
