/**
 * An exercise added in a session (Mob1 call 1) takes the numbers Train's
 * Add gives an added lift (Lift5 (b)), starts from the weight it was last
 * lifted at, and never reaches the plan.
 */
import { describe, expect, it } from "vitest";
import { exerciseAddedToday } from "../sessionAdd";
import { roleRepsFor } from "../roleTable";
import { addedExerciseWeight } from "../startingLoads";
import { applySessionProgression } from "../sessionCompletion";
import {
  normalizeExercise,
  type ProgramState,
  type ProgramExercise,
} from "../programTypes";

describe("exerciseAddedToday", () => {
  it("an isolation takes an isolation's numbers, not a 3 × 10", () => {
    const raise = exerciseAddedToday("lateral-raise", {
      instanceId: "today-1",
      goal: "hypertrophy",
      experience: "intermediate",
    });
    const role = roleRepsFor(
      "hypertrophy",
      { exerciseId: "lateral-raise" },
      "intermediate"
    );
    expect(raise).toMatchObject({
      exerciseId: "lateral-raise",
      name: "Lateral Raise",
      instanceId: "today-1",
      sets: role.sets,
      reps: role.bottom,
    });
    expect(raise.reps).toBeGreaterThanOrEqual(12);
  });

  it("a compound takes a main lift's numbers", () => {
    const squat = exerciseAddedToday("squat", {
      instanceId: "today-2",
      goal: "strength",
      experience: "intermediate",
    });
    const role = roleRepsFor(
      "strength",
      { exerciseId: "squat" },
      "intermediate"
    );
    expect(squat.sets).toBe(role.sets);
    expect(squat.reps).toBe(role.bottom);
  });

  it("starts from the weight it was last lifted at", () => {
    const curl = exerciseAddedToday("db-curl", {
      instanceId: "today-3",
      goal: "hypertrophy",
      experience: "beginner",
      lastWeight: 14,
    });
    expect(curl.weight).toBe(14);
  });

  it("with no history, starts from Train's first guess for an added lift", () => {
    const ctx = { bodyweightKg: 80, experience: "beginner" as const };
    const bench = exerciseAddedToday("bench-press", {
      instanceId: "today-4",
      goal: "general",
      experience: "beginner",
      loadContext: ctx,
    });
    expect(bench.weight).toBeGreaterThan(0);
    expect(bench.weight).toBeLessThanOrEqual(
      addedExerciseWeight("bench-press", ctx)
    );
  });

  it("a hold is counted in seconds", () => {
    const plank = exerciseAddedToday("plank", {
      instanceId: "today-5",
      goal: "general",
      experience: "beginner",
    });
    expect(plank.repUnit).toBe("seconds");
    expect(plank.reps).toBe(30);
  });

  it("its sets move nothing in the plan", () => {
    const planned: ProgramExercise = normalizeExercise({
      name: "Bench Press",
      exerciseId: "bench-press",
      instanceId: "plan-bench",
      sets: 3,
      reps: 8,
      weight: 60,
    });
    const added = exerciseAddedToday("lateral-raise", {
      instanceId: "today-6",
      goal: "hypertrophy",
      experience: "beginner",
    });
    const state = {
      workouts: [
        {
          dayName: "Push",
          dayType: "push",
          exercises: [planned],
          completed: false,
        },
      ],
      settings: { autoProgression: true },
    } as unknown as ProgramState;
    const after = applySessionProgression(state, 0, {
      completionId: "c1",
      date: "2026-10-20",
      prescription: {
        dayName: "Push",
        exercises: [planned, added],
        progressionBaseline: [planned],
      },
      // The plan's lift not done; the added one done in full.
      setLogs: [
        [],
        Array.from({ length: added.sets }, () => ({
          weight: 8,
          reps: 20,
          completed: true,
        })),
      ],
    });
    expect(after.workouts[0].exercises).toHaveLength(1);
    expect(after.workouts[0].exercises[0]).toEqual(planned);
  });
});
