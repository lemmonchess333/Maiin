// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp, type Firestore } from "firebase/firestore";
import {
  normalizeProgramState,
  type ProgramState,
} from "@/features/program/programTypes";
import {
  buildExpressSession,
  type SessionVariant,
} from "@/features/program/expressSession";
import { buildTimeBudgetSession } from "@/features/program/liftTimeBudget";
import { buildEasierSession } from "@/features/program/easierToday";
import type { SessionProgression } from "@/features/program/sessionCompletion";
import { projectWorkoutSets } from "@/features/program/workoutSetRecord";
import { advanceWeek } from "@/features/program/programEngine";
import { commitProgramTransition } from "@/features/program/programTransition";
import {
  resetFirestore,
  seedFirestore,
  readDoc,
} from "@/test/firestoreHarness";
import { workoutTonnageKg, type Workout } from "@/hooks/useWorkouts";
import {
  commitWorkoutCompletion,
  workoutCompletionDayIdentity,
} from "../workoutCompletion";
import { correctSavedWorkout, type WorkoutEdits } from "../workoutCorrection";
import { liftWeekLabel } from "../liftWeekLabel";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "u1" } },
}));
const db = {} as Firestore;
const programPath = "users/u1/programState/current";
const path = (id: string) => `users/u1/workouts/${id}`;
const storedPlan = () => readDoc(programPath) as unknown as ProgramState;

function programme() {
  return normalizeProgramState({
    weekNumber: 1,
    goal: "recomp",
    currentPhase: "base",
    splitType: "full_body",
    settings: { autoProgression: true, smallPlates: false },
    fatigueScore: 0,
    weekHistory: [],
    updatedAt: 0,
    workouts: [
      {
        dayName: "Full body",
        dayType: "full_body",
        completed: false,
        exercises: [
          ["bench-press", "horizontal_push", false, 100],
          ["bicep-curl", "isolation", true, 20],
          ["squat", "knee_dominant", false, 80],
          ["leg-extension", "isolation", true, 30],
        ].map(([exerciseId, movementCategory, isAccessory, weight], i) => ({
          instanceId: `lift-${i}`,
          exerciseId,
          name: exerciseId,
          movementCategory,
          isAccessory,
          sets: 8,
          reps: 8,
          weight,
          progressionType: "linear",
          restSeconds: 300,
        })),
      },
    ],
  } as unknown as ProgramState);
}

function session(
  state: ProgramState,
  id: string,
  variant: SessionVariant = "full"
): SessionProgression {
  const day = state.workouts[0];
  const execution =
    variant === "easier_today"
      ? buildEasierSession(day)
      : variant === "time_budget"
        ? buildTimeBudgetSession(day, 30)
        : buildExpressSession(day, variant);
  return {
    completionId: id,
    date: "2026-09-07",
    ...(variant === "full" ? {} : { sessionVariant: variant }),
    prescription: {
      exercises: execution.exercises,
      // As WorkoutSession pairs them: each exercise run with its stored row.
      progressionBaseline: execution.exercises.map(
        (ex) =>
          day.exercises.find((stored) => stored.instanceId === ex.instanceId) ??
          ex
      ),
    },
    setLogs: execution.exercises.map((ex) =>
      Array.from({ length: ex.sets }, () => ({
        weight: ex.weight,
        reps: ex.reps,
        completed: true,
        type: "working",
      }))
    ),
  };
}

async function finish(state: ProgramState, input: SessionProgression) {
  const exercises = input.prescription.exercises.map((ex, i) => ({
    exerciseId: ex.exerciseId,
    exerciseName: ex.name,
    category: ex.movementCategory,
    plannedSetCount: ex.sets,
    caloriesBurned: 0,
    sets: projectWorkoutSets(input.setLogs[i], {
      sets: ex.sets,
      reps: ex.reps,
      weightKg: ex.weight,
    }),
  }));
  await commitWorkoutCompletion(
    db,
    "u1",
    input.completionId,
    {
      date: input.date,
      createdAt: Timestamp.now(),
      exercises,
      durationMinutes: 30,
      totalCalories: 200,
      burnContext: { bodyweightKg: 80 },
      totalVolume: workoutTonnageKg({ exercises }),
      ...(input.sessionVariant ? { sessionVariant: input.sessionVariant } : {}),
    },
    {
      dayIndex: 0,
      weekNumber: state.weekNumber,
      dayIdentity: workoutCompletionDayIdentity(state.workouts[0])!,
      progression: input,
    }
  );
}
function editsFor(id: string, reps: number): WorkoutEdits {
  const saved = readDoc(path(id)) as unknown as Workout;
  return {
    durationMinutes: saved.durationMinutes,
    exercises: saved.exercises.map((ex) => ({
      sets: ex.sets.map((set) => ({ weightKg: set.weightKg, reps })),
    })),
  };
}
beforeEach(() => {
  resetFirestore();
  seedFirestore({
    [programPath]: programme() as unknown as Record<string, unknown>,
  });
});

describe("saved lifting work, correction, and the next prescription", () => {
  it.each(["full", "time_budget", "express30", "easier_today"] as const)(
    "%s preserves its chosen prescription and replays corrections only for eligible lifts",
    async (variant) => {
      const before = storedPlan();
      const input = session(before, variant, variant);
      await finish(before, input);
      const saved = readDoc(path(variant)) as unknown as Workout;
      expect(saved.exercises.map((ex) => ex.exerciseId)).toEqual(
        input.prescription.exercises.map((ex) => ex.exerciseId)
      );
      saved.exercises.forEach((ex, i) => {
        expect(ex.plannedSetCount).toBe(input.prescription.exercises[i].sets);
        expect(ex.sets).toHaveLength(ex.plannedSetCount!);
        expect(ex.sets[0].plannedWeightKg).toBe(
          input.prescription.exercises[i].weight
        );
      });
      if (variant === "time_budget" || variant === "express30") {
        expect(saved.exercises.length).toBeLessThan(
          before.workouts[0].exercises.length
        );
        expect(
          input.prescription.exercises.some(
            (ex, i) => ex.sets < input.prescription.progressionBaseline[i].sets
          )
        ).toBe(true);
      }
      const committed = storedPlan();
      await correctSavedWorkout(
        db,
        "u1",
        variant,
        0,
        "fix-reps",
        editsFor(variant, 6)
      );
      const corrected = storedPlan();
      for (const [i, baseline] of before.workouts[0].exercises.entries()) {
        const executed = input.prescription.exercises.find(
          (ex) => ex.instanceId === baseline.instanceId
        );
        // Sets cut short count like any others (Lift4 (8)); an easier
        // session can't move a weight down, so its correction holds.
        const held = !executed || variant === "easier_today";
        const next = corrected.workouts[0].exercises[i];
        expect(next.instanceId).toBe(baseline.instanceId);
        if (held) {
          expect(committed.workouts[0].exercises[i]).toEqual(baseline);
          expect(next).toEqual(baseline);
        } else {
          expect(committed.workouts[0].exercises[i].weight).toBeGreaterThan(
            baseline.weight
          );
          expect(next.weight).toBe(baseline.weight);
          expect(next.consecutiveFailures).toBe(1);
          expect(next.lastPerformance).toMatchObject({
            reps: 6,
            weight: baseline.weight,
            completed: false,
          });
          expect(next.performanceHistory).toHaveLength(1);
        }
      }
      // The saved target is immutable; later correction changes performed facts.
      expect(
        (readDoc(path(variant)) as unknown as Workout).exercises[0].sets[0]
      ).toMatchObject({ reps: 6, plannedReps: 8 });
    }
  );
  it("judges a session cut short on the sets done, never on the rows left", async () => {
    const baseline = storedPlan().workouts[0].exercises;
    const state = storedPlan();
    const input = session(state, "partial");
    input.setLogs = input.setLogs.map((logs) =>
      logs.map((log, j) => ({ ...log, completed: j < 2 }))
    );
    await finish(state, input);
    // Two of eight sets, both at the target: a step, not six missed rows.
    storedPlan().workouts[0].exercises.forEach((ex, i) => {
      expect(ex.weight).toBeGreaterThan(baseline[i].weight);
      expect(ex.consecutiveFailures).toBe(0);
    });
    const saved = readDoc(path(input.completionId)) as unknown as Workout;
    expect(saved.exercises[0].plannedSetCount).toBe(8);
    expect(saved.exercises[0].sets).toHaveLength(2);
    // The same two sets corrected to 6 reps are a miss at the plan's weight.
    await correctSavedWorkout(
      db,
      "u1",
      input.completionId,
      0,
      "correct",
      editsFor(input.completionId, 6)
    );
    storedPlan().workouts[0].exercises.forEach((ex, i) => {
      expect(ex.weight).toBe(baseline[i].weight);
      expect(ex.consecutiveFailures).toBe(1);
      expect(ex.lastPerformance).toMatchObject({ reps: 6, completed: false });
    });
  });
  it("keeps warm-ups and drop sets out of progression and retains an RPE hold after correction", async () => {
    const state = storedPlan();
    const input = session(state, "set-types");
    input.setLogs[0].at(-1)!.rpe = 10;
    input.setLogs[0].unshift({
      weight: 20,
      reps: 12,
      completed: true,
      type: "warmup",
    });
    input.setLogs[0].push({
      weight: 50,
      reps: 12,
      completed: true,
      type: "dropset",
    });
    await finish(state, input);
    expect(storedPlan().workouts[0].exercises[0]).toMatchObject({
      weight: 100,
      consecutiveFailures: 0,
    });
    await correctSavedWorkout(
      db,
      "u1",
      "set-types",
      0,
      "fix",
      editsFor("set-types", 10)
    );
    expect(storedPlan().workouts[0].exercises[0]).toMatchObject({
      weight: 100,
      consecutiveFailures: 0,
      lastPerformance: { weight: 100, reps: 10 },
    });
    expect(
      storedPlan().workouts[0].exercises[0].performanceHistory
    ).toHaveLength(1);
  });
  it("carries corrected performance into the next week, then protects that newer prescription", async () => {
    const state = storedPlan();
    await finish(state, session(state, "full"));
    await correctSavedWorkout(
      db,
      "u1",
      "full",
      0,
      "correct",
      editsFor("full", 6)
    );
    const corrected = storedPlan();
    await commitProgramTransition(
      db,
      "u1",
      corrected,
      advanceWeek(corrected, "intermediate", "2026-09-14")
    );
    const next = storedPlan();
    expect(next.weekNumber).toBe(2);
    expect(next.workouts[0].completed).toBe(false);
    expect(next.workouts[0].exercises[0]).toMatchObject({
      weight: 100,
      lastPerformance: { weight: 100, reps: 6 },
      consecutiveFailures: 1,
    });
    expect(liftWeekLabel(next, "2026-09-14")).toContain("Week 2 of 4");
    await correctSavedWorkout(
      db,
      "u1",
      "full",
      1,
      "older-correction",
      editsFor("full", 8)
    );
    expect(storedPlan()).toEqual(next);
  });
});
