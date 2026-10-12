/**
 * Lift5: Train's Replace and Add take their role's numbers (the role table,
 * Lift4 (5)), as the equipment and injury swaps do. A Replace keeps the
 * slot's numbers within a role, so a person's own stay; across one, the
 * replacement takes its role's, no more sets than the slot had. An Add takes
 * its role's unless the command brings its own. Swap for today is the
 * session's, and untouched here.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { applyProgramCommand } = require("../lib/programCommands");

const CMD = "cmd_rolenumbers0123456";
const SIG = "Upper|inst-bench|inst-row";

function plan(goal = "hypertrophy") {
  return {
    goal: "recomp",
    primaryGoal: goal,
    currentPhase: "progression",
    weekNumber: 3,
    splitType: "upper_lower",
    fatigueScore: 0,
    updatedAt: 1000,
    settings: { autoProgression: true, smallPlates: false },
    weekHistory: [],
    workouts: [
      {
        dayName: "Upper",
        dayType: "upper",
        completed: false,
        skipped: false,
        dayRole: "moderate",
        exercises: [
          {
            name: "Bench Press",
            exerciseId: "bench-press",
            instanceId: "inst-bench",
            movementCategory: "horizontal_push",
            sets: 4,
            reps: 5,
            baseReps: 5,
            weight: 100,
            progressionType: "linear",
          },
          {
            name: "Barbell Row",
            exerciseId: "barbell-row",
            instanceId: "inst-row",
            movementCategory: "horizontal_pull",
            isAccessory: true,
            sets: 3,
            reps: 9,
            baseReps: 8,
            repRangeMax: 12,
            weight: 60,
            progressionType: "double",
          },
        ],
      },
    ],
  };
}

function run(command, state = plan(), experience = "intermediate") {
  return applyProgramCommand({
    state,
    profile: { experience },
    command: {
      commandId: CMD,
      dayIndex: 0,
      expectedWeekNumber: 3,
      expectedDaySignature: SIG,
      ...command,
    },
    now: 2_000_000,
  }).state.workouts[0].exercises;
}

describe("Replace (Lift5)", () => {
  it("takes the new role's numbers across roles", () => {
    // A fixed 4 × 5 main replaced with a lateral raise: Build muscle's side
    // delts take 12–20, three sets (no more than the slot's four).
    const [raise] = run({
      kind: "replaceExercise",
      oldInstanceId: "inst-bench",
      replacementExerciseId: "lateral-raise",
      replacementWeight: 10,
    });
    expect(raise).toMatchObject({
      exerciseId: "lateral-raise",
      sets: 3,
      reps: 12,
      baseReps: 12,
      repRangeMax: 20,
      progressionType: "double",
    });
    // The seeded load moves from the slot's 5 reps to 12, by Epley.
    expect(raise.weight).toBeLessThan(10);
  });

  it("keeps the slot's numbers within a role", () => {
    const [press] = run({
      kind: "replaceExercise",
      oldInstanceId: "inst-bench",
      replacementExerciseId: "incline-db-press",
      replacementWeight: 30,
    });
    expect(press).toMatchObject({
      exerciseId: "incline-db-press",
      sets: 4,
      reps: 5,
      baseReps: 5,
      progressionType: "linear",
      weight: 30,
    });
    expect(press.repRangeMax).toBeUndefined();
  });

  it("keeps an other compound's climb within its role", () => {
    const [, row] = run({
      kind: "replaceExercise",
      oldInstanceId: "inst-row",
      replacementExerciseId: "incline-db-press",
      replacementWeight: 25,
    });
    expect(row).toMatchObject({
      sets: 3,
      reps: 9,
      baseReps: 8,
      repRangeMax: 12,
      progressionType: "double",
    });
  });
});

describe("Add (Lift5)", () => {
  it("gives an isolation its role's numbers", () => {
    const added = run({
      kind: "addExercises",
      exercises: [{ exerciseId: "barbell-curl" }],
    })[2];
    // Build muscle's isolations: 10–15, three sets from intermediate up.
    expect(added).toMatchObject({
      exerciseId: "barbell-curl",
      sets: 3,
      reps: 10,
      repRangeMax: 15,
      progressionType: "double",
      weight: 0,
    });
  });

  it("gives a compound a main lift's numbers, as an unmarked compound counts", () => {
    const added = run({
      kind: "addExercises",
      exercises: [{ exerciseId: "barbell-row" }],
    })[2];
    expect(added).toMatchObject({
      sets: 3,
      reps: 6,
      repRangeMax: 10,
      progressionType: "double",
    });
  });

  it("gives a beginner's added isolation two sets", () => {
    const added = run(
      { kind: "addExercises", exercises: [{ exerciseId: "barbell-curl" }] },
      plan(),
      "beginner"
    )[2];
    expect(added.sets).toBe(2);
  });

  it("keeps the numbers a command brings", () => {
    const added = run({
      kind: "addExercises",
      exercises: [{ exerciseId: "barbell-curl", sets: 4, reps: 6 }],
    })[2];
    expect(added).toMatchObject({ sets: 4, reps: 6 });
  });
});
