/**
 * A finished session, as pure steps (Phase 1, item 2 of the training-engine
 * pass): the prescription the workout screen holds (`sessionPrescription`),
 * what it hands the plan (`toSessionProgression`), and the day marked done
 * (`markDayDone`). The save's transaction and the app's copy before the save
 * lands now share these instead of each writing them out, and a simulator
 * calls the same ones.
 *
 * Before the move, the app's copy marked the day before the progression and
 * the transaction after it. The two orders give the same plan because the
 * progression changes only the day's lifts; the last test here holds that.
 */
import { describe, it, expect } from "vitest";
import {
  applySessionProgression,
  sessionPrescription,
  toSessionProgression,
} from "../sessionCompletion";
import { markDayDone } from "@/lib/workoutCompletion";
import {
  normalizeProgramState,
  type ProgramExercise,
  type ProgramState,
} from "../programTypes";

const squat: ProgramExercise = {
  instanceId: "squat-1",
  exerciseId: "squat",
  name: "Squat",
  movementCategory: "knee_dominant",
  sets: 3,
  reps: 5,
  weight: 100,
  progressionType: "linear",
} as ProgramExercise;

const bench: ProgramExercise = {
  instanceId: "bench-1",
  exerciseId: "bench-press",
  name: "Bench press",
  movementCategory: "horizontal_push",
  sets: 3,
  reps: 8,
  weight: 60,
  progressionType: "double",
} as ProgramExercise;

const plan = (override?: number): ProgramState =>
  normalizeProgramState({
    weekNumber: 2,
    goal: "recomp",
    currentPhase: "progression",
    splitType: "full_body",
    workouts: [
      {
        dayName: "A",
        dayType: "full_body",
        completed: false,
        exercises: [squat],
      },
      {
        dayName: "B",
        dayType: "full_body",
        completed: false,
        exercises: [bench],
      },
    ],
    settings: { autoProgression: true, smallPlates: false },
    fatigueScore: 0,
    weekHistory: [],
    updatedAt: 0,
    ...(override === undefined ? {} : { nextWorkoutOverride: override }),
  } as unknown as ProgramState);

describe("markDayDone", () => {
  it("marks the day done by the saved session, and not skipped", () => {
    const before = plan();
    before.workouts[0] = { ...before.workouts[0], skipped: true };
    const after = markDayDone(before, 0, "programme-c1");
    expect(after.workouts[0]).toMatchObject({
      completed: true,
      skipped: false,
      completedWorkoutId: "programme-c1",
    });
    expect(after.workouts[1]).toBe(before.workouts[1]);
    // The lifts are the same objects: the transaction tells the lifts the
    // session moved by comparing them with the plan it read.
    expect(after.workouts[0].exercises).toBe(before.workouts[0].exercises);
  });

  it("stops the day being the one chosen to come next, and only that day", () => {
    expect("nextWorkoutOverride" in markDayDone(plan(0), 0, "w")).toBe(false);
    expect(markDayDone(plan(1), 0, "w").nextWorkoutOverride).toBe(1);
  });

  it("leaves the plan it is given as it was", () => {
    const before = plan(0);
    const copy = JSON.stringify(before);
    markDayDone(before, 0, "w");
    expect(JSON.stringify(before)).toBe(copy);
  });
});

describe("sessionPrescription", () => {
  it("sets out the day's lifts as planned, as a copy of its own", () => {
    const day = plan().workouts[0];
    const prescription = sessionPrescription(day, "c1");
    expect(prescription.dayName).toBe("A");
    expect(prescription.exercises).toEqual(day.exercises);
    expect(prescription.progressionBaseline).toEqual(day.exercises);
    prescription.exercises[0].weight = 1;
    expect(day.exercises[0].weight).toBe(100);
  });

  it("undoes an older draft's provisional progression for the same session", () => {
    const moved = {
      ...squat,
      weight: 102.5,
      sessionProgression: { id: "c1", baseline: squat },
    } as ProgramExercise;
    const prescription = sessionPrescription(
      { dayName: "A", exercises: [moved] },
      "c1"
    );
    expect(prescription.exercises[0].weight).toBe(100);
    expect(prescription.exercises[0].sessionProgression).toBeUndefined();
    expect(prescription.progressionBaseline[0]).toEqual(squat);
    // Another session's leftovers are only dropped, not undone.
    const other = sessionPrescription(
      { dayName: "A", exercises: [moved] },
      "c2"
    );
    expect(other.exercises[0].weight).toBe(102.5);
  });

  it("judges progression against Train's baseline where it passes one", () => {
    const lighter = { ...squat, weight: 95 };
    const prescription = sessionPrescription(
      { dayName: "A", exercises: [squat, bench] },
      "c1",
      [lighter]
    );
    expect(prescription.progressionBaseline).toEqual([lighter, bench]);
    expect(prescription.exercises[0].weight).toBe(100);
  });
});

describe("toSessionProgression", () => {
  const prescription = sessionPrescription(plan().workouts[0], "c1");
  const setLogs = [[{ weight: 100, reps: 5, completed: true }]];

  it("hands the plan the session's own day, sets and variant", () => {
    expect(
      toSessionProgression({
        completionId: "c1",
        date: "2026-09-10",
        prescription,
        setLogs,
        sessionVariant: "express45",
      })
    ).toEqual({
      completionId: "c1",
      date: "2026-09-10",
      prescription,
      setLogs,
      sessionVariant: "express45",
    });
  });

  it("says after a hard run only when there was one", () => {
    const progression = (afterHardRun?: boolean) =>
      toSessionProgression({
        completionId: "c1",
        date: "2026-09-10",
        prescription,
        setLogs,
        afterHardRun,
      });
    expect(progression(true)?.afterHardRun).toBe(true);
    expect(progression(false)).not.toHaveProperty("afterHardRun");
    expect(progression(undefined)).not.toHaveProperty("afterHardRun");
  });

  it("hands over nothing for a day marked done without a session", () => {
    expect(
      toSessionProgression({ completionId: "c1", date: "2026-09-10", setLogs })
    ).toBeUndefined();
  });
});

describe("a finished session, applied", () => {
  it.each([
    ["every set at the target", [5, 5, 5]],
    ["a set short", [5, 5, 4]],
    ["every set short", [4, 4, 4]],
  ])(
    "gives the same plan marked before or after its progression (%s)",
    (_label, reps) => {
      const before = plan(0);
      const progression = toSessionProgression({
        completionId: "c1",
        date: "2026-09-10",
        prescription: sessionPrescription(before.workouts[0], "c1"),
        setLogs: [reps.map((r) => ({ weight: 100, reps: r, completed: true }))],
      })!;
      const progressedFirst = markDayDone(
        applySessionProgression(before, 0, progression),
        0,
        "programme-c1"
      );
      const markedFirst = applySessionProgression(
        markDayDone(before, 0, "programme-c1"),
        0,
        progression
      );
      expect(markedFirst).toEqual(progressedFirst);
      expect(progressedFirst.workouts[0].completed).toBe(true);
      // Not a vacuous agreement: the session moved the lift's record.
      expect(progressedFirst.workouts[0].exercises[0]).not.toEqual(
        before.workouts[0].exercises[0]
      );
    }
  );
});
