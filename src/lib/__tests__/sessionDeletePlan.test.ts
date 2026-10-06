// @vitest-environment jsdom
/**
 * Deleting a plan day's latest session puts the plan back when nothing has
 * moved on since (Lift4 (14), ADR-0012's fifth amendment), through the
 * check a correction makes (`sessionStillInPlan`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp, type Firestore } from "firebase/firestore";
import {
  commitWorkoutCompletion,
  workoutCompletionDayIdentity,
} from "../workoutCompletion";
import { deleteLoggedSession } from "../sessionDelete";
import {
  normalizeProgramState,
  type ProgramState,
} from "@/features/program/programTypes";
import {
  allPaths,
  readDoc,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";

vi.mock("firebase/firestore");
const owner = vi.hoisted(() => ({ currentUser: { uid: "u1" } }));
vi.mock("@/lib/firebase", () => ({ db: {}, auth: owner }));
const db = {} as Firestore;
const workoutPath = "users/u1/workouts/saved";
const programPath = "users/u1/programState/current";

const plan = () =>
  normalizeProgramState({
    weekNumber: 2,
    goal: "recomp",
    currentPhase: "progression",
    splitType: "ppl",
    workouts: [
      {
        dayName: "Push",
        dayType: "upper",
        completed: false,
        exercises: [
          {
            instanceId: "bench-1",
            exerciseId: "bench-press",
            name: "Bench Press",
            sets: 3,
            reps: 5,
            weight: 100,
            progressionType: "linear",
          },
          {
            instanceId: "fly-1",
            exerciseId: "cable-fly",
            name: "Cable Fly",
            sets: 3,
            reps: 12,
            weight: 20,
            progressionType: "linear",
          },
        ],
      },
    ],
    settings: { autoProgression: true, smallPlates: false },
    fatigueScore: 0,
    weekHistory: [],
    updatedAt: 0,
  } as unknown as ProgramState);

const workout = () => ({
  id: "saved",
  createdAt: Timestamp.fromDate(new Date("2026-09-10T12:00:00Z")),
  date: "2026-09-10",
  durationMinutes: 40,
  exercises: [
    {
      exerciseId: "bench-press",
      exerciseName: "Bench Press",
      sets: Array.from({ length: 3 }, (_, i) => ({
        setNumber: i + 1,
        weightKg: 100,
        reps: 5,
        type: "working" as const,
      })),
    },
    {
      exerciseId: "cable-fly",
      exerciseName: "Cable Fly",
      sets: Array.from({ length: 3 }, (_, i) => ({
        setNumber: i + 1,
        weightKg: 20,
        reps: 12,
        type: "working" as const,
      })),
    },
  ],
});

/** Saves the session through the real completion, which steps both lifts. */
async function saveSession(): Promise<ProgramState> {
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
        date: "2026-09-10",
        prescription: {
          exercises: state.workouts[0].exercises,
          progressionBaseline: state.workouts[0].exercises,
        },
        setLogs: [
          Array.from({ length: 3 }, () => ({
            weight: 100,
            reps: 5,
            completed: true,
          })),
          Array.from({ length: 3 }, () => ({
            weight: 20,
            reps: 12,
            completed: true,
          })),
        ],
      },
    }
  );
  return state;
}

const storedPlan = () => readDoc(programPath) as unknown as ProgramState;
const lift = (state: ProgramState, id: string) =>
  state.workouts[0].exercises.find((ex) => ex.instanceId === id)!;

beforeEach(() => {
  resetFirestore();
  owner.currentUser = { uid: "u1" };
});

describe("deleting a programme session", () => {
  it("puts the plan back when nothing has moved on since", async () => {
    const before = await saveSession();
    const saved = storedPlan();
    // The session stepped both lifts and marked its day done.
    expect(lift(saved, "bench-1").weight).toBeGreaterThan(100);
    expect(saved.workouts[0].completed).toBe(true);

    await deleteLoggedSession({ uid: "u1", kind: "workout", id: "saved" });

    const after = storedPlan();
    expect(allPaths()).not.toContain(workoutPath);
    expect(after.workouts[0].completed).toBe(false);
    expect(after.workouts[0].completedWorkoutId).toBeUndefined();
    for (const id of ["bench-1", "fly-1"]) {
      expect(lift(after, id).weight).toBe(lift(before, id).weight);
      expect(lift(after, id).reps).toBe(lift(before, id).reps);
      expect(lift(after, id).performanceHistory).toEqual(
        lift(before, id).performanceHistory
      );
    }
  });

  it("leaves the plan as it is once the week has moved on", async () => {
    await saveSession();
    const moved = { ...storedPlan(), weekNumber: 3 };
    seedFirestore({
      [programPath]: moved as unknown as Record<string, unknown>,
    });

    await deleteLoggedSession({ uid: "u1", kind: "workout", id: "saved" });

    expect(allPaths()).not.toContain(workoutPath);
    expect(storedPlan()).toEqual(moved);
  });

  it("keeps a lift the person changed since, and puts the rest back", async () => {
    const before = await saveSession();
    const saved = storedPlan();
    const edited = {
      ...saved,
      workouts: saved.workouts.map((day) => ({
        ...day,
        exercises: day.exercises.map((ex) =>
          ex.instanceId === "fly-1" ? { ...ex, weight: 27.5 } : ex
        ),
      })),
    };
    seedFirestore({
      [programPath]: edited as unknown as Record<string, unknown>,
    });

    await deleteLoggedSession({ uid: "u1", kind: "workout", id: "saved" });

    const after = storedPlan();
    expect(lift(after, "fly-1").weight).toBe(27.5);
    expect(lift(after, "bench-1").weight).toBe(lift(before, "bench-1").weight);
    expect(after.workouts[0].completed).toBe(false);
  });
});
