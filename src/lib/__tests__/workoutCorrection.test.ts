// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp, type Firestore } from "firebase/firestore";
import {
  correctedWorkout,
  correctSavedWorkout,
  type WorkoutEdits,
} from "../workoutCorrection";
import {
  commitWorkoutCompletion,
  workoutCompletionDayIdentity,
} from "../workoutCompletion";
import {
  normalizeProgramState,
  type ProgramState,
} from "@/features/program/programTypes";
import { workoutTonnageKg, type Workout } from "@/hooks/useWorkouts";
import { estimateLiftBurn } from "../workoutBurn";
import {
  resetFirestore,
  seedFirestore,
  readDoc,
  writeLog,
  failNextFirestore,
} from "@/test/firestoreHarness";

vi.mock("firebase/firestore");
const owner = vi.hoisted(() => ({ currentUser: { uid: "u1" } }));
vi.mock("@/lib/firebase", () => ({ db: {}, auth: owner }));
const db = {} as Firestore;
const path = "users/u1/workouts/saved";
const programPath = "users/u1/programState/current";
const recordsPath = "users/u1/stats/prMap";
const workout = (): Workout =>
  ({
    id: "saved",
    createdAt: Timestamp.fromDate(new Date("2026-09-10T12:00:00Z")),
    date: "2026-09-10",
    notes: "Original prescription",
    durationMinutes: 40,
    totalCalories: 240,
    burnContext: { bodyweightKg: 80 },
    exercises: [
      {
        exerciseId: "bench",
        exerciseName: "Bench",
        category: "push",
        plannedSetCount: 3,
        caloriesBurned: 0,
        sets: Array.from({ length: 3 }, (_, i) => ({
          setNumber: i + 1,
          weightKg: 100,
          reps: 8,
          plannedWeightKg: 100,
          plannedReps: 8,
          type: "working" as const,
        })),
      },
    ],
  }) as Workout;
const edits = (reps = 6): WorkoutEdits => ({
  durationMinutes: 30,
  exercises: [
    { sets: Array.from({ length: 3 }, () => ({ weightKg: 100, reps })) },
  ],
});
const plan = () =>
  normalizeProgramState({
    weekNumber: 2,
    goal: "recomp",
    currentPhase: "base",
    splitType: "ppl",
    workouts: [
      {
        dayName: "Push",
        dayType: "upper",
        completed: false,
        exercises: [
          {
            instanceId: "bench-1",
            exerciseId: "bench",
            name: "Bench",
            sets: 3,
            reps: 8,
            weight: 100,
          },
        ],
      },
    ],
    settings: { autoProgression: true, microloading: true },
    fatigueScore: 0,
    weekHistory: [],
    updatedAt: 0,
  } as unknown as ProgramState);
async function saveProgrammeWorkout() {
  const state = plan();
  seedFirestore({ [programPath]: state as unknown as Record<string, unknown> });
  await commitWorkoutCompletion(
    db,
    "u1",
    "saved",
    workout() as unknown as Record<string, unknown>,
    {
      dayIndex: 0,
      weekNumber: 2,
      dayIdentity: workoutCompletionDayIdentity(state.workouts[0])!,
      progression: {
        completionId: "session",
        date: workout().date,
        prescription: {
          exercises: state.workouts[0].exercises,
          progressionBaseline: state.workouts[0].exercises,
        },
        setLogs: [
          Array.from({ length: 3 }, () => ({
            weight: 100,
            reps: 8,
            completed: true,
          })),
        ],
      },
    }
  );
}
const storedPlan = () => readDoc(programPath) as unknown as ProgramState;
beforeEach(() => {
  resetFirestore();
  owner.currentUser = { uid: "u1" };
});

describe("saved workout corrections", () => {
  it("keeps identity, date and planned facts while recomputing the performed totals and burn", () => {
    const original = workout();
    const next = correctedWorkout(original, edits());
    expect(next).toMatchObject({
      id: original.id,
      date: original.date,
      notes: original.notes,
      durationMinutes: 30,
    });
    expect(next.exercises[0].sets[0]).toMatchObject({
      reps: 6,
      weightKg: 100,
      plannedReps: 8,
      plannedWeightKg: 100,
    });
    expect(workoutTonnageKg(next)).toBe(1800);
    expect(next.totalCalories).toBe(
      estimateLiftBurn({
        durationMinutes: 30,
        bodyweightKg: 80,
        tonnageKg: 1800,
        completedSetCount: 3,
      })
    );
    expect(original.exercises[0].sets[0].reps).toBe(8);
  });
  it("keeps timed holds out of lifted tonnage", () => {
    const original = workout();
    original.exercises[0].repUnit = "seconds";
    const next = correctedWorkout(original, edits(120));
    expect(next.exercises[0].sets[0].reps).toBe(120);
    expect(workoutTonnageKg(next)).toBe(0);
  });
  it.each([NaN, -1, 0, 1.5, 101])(
    "rejects invalid reps %s before any write",
    async (reps) => {
      seedFirestore({
        [path]: workout() as unknown as Record<string, unknown>,
      });
      await expect(
        correctSavedWorkout(db, "u1", "saved", 0, "edit", edits(reps))
      ).rejects.toThrow();
      expect(writeLog()).toHaveLength(0);
    }
  );
  it("commits once, refuses stale edits and leaves no partial writes on failure", async () => {
    seedFirestore({ [path]: workout() as unknown as Record<string, unknown> });
    failNextFirestore("commit");
    await expect(
      correctSavedWorkout(db, "u1", "saved", 0, "edit", edits())
    ).rejects.toThrow();
    expect(readDoc(path)?.revision).toBeUndefined();
    expect(readDoc(recordsPath)).toBeUndefined();
    await correctSavedWorkout(db, "u1", "saved", 0, "edit", edits());
    const count = writeLog().length;
    await correctSavedWorkout(db, "u1", "saved", 0, "edit", edits(7));
    expect(writeLog()).toHaveLength(count);
    expect(readDoc(path)).toMatchObject({ revision: 1, totalVolume: 1800 });
    expect(readDoc(recordsPath)).toMatchObject({
      invalidated: true,
      revision: 1,
    });
    await expect(
      correctSavedWorkout(db, "u1", "saved", 0, "other", edits(7))
    ).rejects.toThrow("changed elsewhere");
  });
  it("replaces the latest workout's progression once, including when corrected again", async () => {
    await saveProgrammeWorkout();
    expect(storedPlan().workouts[0].exercises[0].weight).toBeGreaterThan(100);
    await correctSavedWorkout(db, "u1", "saved", 0, "correction1", edits(6));
    expect(storedPlan().workouts[0].exercises[0]).toMatchObject({
      weight: 100,
      consecutiveFailures: 1,
    });
    expect(
      storedPlan().workouts[0].exercises[0].performanceHistory
    ).toHaveLength(1);
    await correctSavedWorkout(db, "u1", "saved", 1, "correction2", edits(8));
    const exercise = storedPlan().workouts[0].exercises[0];
    expect(exercise.weight).toBeGreaterThan(100);
    expect(exercise.consecutiveFailures).toBe(0);
    expect(exercise.performanceHistory).toHaveLength(1);
    expect(exercise.performanceHistory[0].date).toBe(workout().date);
  });
  it.each(["week", "target", "replacement", "settings"])(
    "preserves a newer %s when correcting history",
    async (change) => {
      await saveProgrammeWorkout();
      const current = storedPlan();
      if (change === "week") current.weekNumber++;
      if (change === "settings") current.settings!.autoProgression = false;
      if (change === "target") current.workouts[0].exercises[0].weight = 110;
      if (change === "replacement")
        current.workouts[0].exercises[0].instanceId = "replacement";
      seedFirestore({
        [programPath]: current as unknown as Record<string, unknown>,
      });
      await correctSavedWorkout(db, "u1", "saved", 0, "edit", edits());
      await correctSavedWorkout(db, "u1", "saved", 1, "edit-again", edits(7));
      expect(storedPlan()).toEqual(current);
      expect(readDoc(path)?.totalVolume).toBe(2100);
    }
  );
  it("keeps correction independent of a server-owned feed summary", async () => {
    seedFirestore({
      [path]: { ...workout(), sharedActivityId: "shared" },
      "activities/shared": {
        authorId: "u1",
        caption: "My session",
        visibility: "followers",
        totalVolume: 2400,
      },
    });
    await correctSavedWorkout(db, "u1", "saved", 0, "edit", edits());
    expect(readDoc(path)?.totalVolume).toBe(1800);
    expect(
      writeLog().every((write) => !write.path.startsWith("activities/"))
    ).toBe(true);
  });
  it("refuses another account and does not recreate a deleted workout", async () => {
    owner.currentUser = { uid: "u2" };
    await expect(
      correctSavedWorkout(db, "u1", "saved", 0, "edit", edits())
    ).rejects.toThrow("Sign in");
    owner.currentUser = { uid: "u1" };
    await expect(
      correctSavedWorkout(db, "u1", "saved", 0, "edit", edits())
    ).rejects.toThrow("no longer available");
    expect(writeLog()).toHaveLength(0);
  });
});
