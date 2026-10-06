// @vitest-environment jsdom
/**
 * "Swap for today" through the real finish (Lift4 (11)): the swapped
 * exercise's sets say nothing about the lift it stood in for, so a swap
 * Finish doesn't keep leaves that lift as it was, and a kept one takes its
 * place, slot and all, with today's sets as its first session. Deleting
 * the session then puts the planned lift back, as a delete puts back
 * everything a session changed (Lift4 (14)).
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
  type ProgramExercise,
  type ProgramState,
} from "@/features/program/programTypes";
import {
  keptSwap,
  swappedForToday,
  type SessionSwap,
} from "@/features/program/sessionSwap";
import { applySessionProgression } from "@/features/program/sessionCompletion";
import {
  readDoc,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";

vi.mock("firebase/firestore");
const owner = vi.hoisted(() => ({ currentUser: { uid: "u1" } }));
vi.mock("@/lib/firebase", () => ({ db: {}, auth: owner }));
const db = {} as Firestore;
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
            performanceHistory: [
              {
                date: "2026-09-03",
                weight: 100,
                repsCompleted: 5,
                repsTarget: 5,
              },
            ],
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

const bench = (state: ProgramState) => state.workouts[0].exercises[0];

/** Today's session: dumbbell bench in the bench's place, every set done. */
function session(state: ProgramState, swaps: SessionSwap[]) {
  const swapped = swappedForToday(bench(state), "db-bench", {
    lastWeight: 30,
  });
  return {
    completionId: "session",
    date: "2026-09-10",
    prescription: {
      exercises: [swapped, state.workouts[0].exercises[1]],
      progressionBaseline: state.workouts[0].exercises,
      swaps,
    },
    setLogs: [
      Array.from({ length: 3 }, () => ({
        weight: 30,
        reps: 5,
        completed: true,
      })),
      Array.from({ length: 3 }, () => ({
        weight: 20,
        reps: 12,
        completed: true,
      })),
    ],
  };
}

describe("swappedForToday — the exercise done in a lift's place", () => {
  const planned = () => bench(plan());

  it("keeps the slot and the planned sets and reps, and none of the history", () => {
    const swapped = swappedForToday(planned(), "db-bench", { lastWeight: 30 });
    expect(swapped).toMatchObject({
      instanceId: "bench-1",
      exerciseId: "db-bench",
      sets: 3,
      reps: 5,
      weight: 30,
      performanceHistory: [],
      consecutiveFailures: 0,
    });
    expect(swapped.name).not.toBe("Bench Press");
    expect(swapped.swappedFrom).toBeUndefined();
  });

  it("starts a movement never lifted from the planned lift's weight", () => {
    const swapped = swappedForToday(planned(), "db-bench");
    expect(swapped.weight).toBeGreaterThan(0);
    expect(swapped.weight).toBeLessThan(100);
  });

  it("gives a hold its seconds when the unit changes", () => {
    const swapped = swappedForToday(planned(), "plank");
    expect(swapped.repUnit).toBe("seconds");
    expect(swapped.reps).toBe(30);
  });

  it("leaves a kept swap at the plan's sets, with a fresh record", () => {
    const shortened = { ...planned(), sets: 2 };
    const kept = keptSwap(
      { ...planned(), sets: 4, baseSets: 4 },
      swappedForToday(shortened, "db-bench", { lastWeight: 30 })
    );
    expect(kept).toMatchObject({
      instanceId: "bench-1",
      exerciseId: "db-bench",
      sets: 4,
      baseSets: 4,
      performanceHistory: [],
    });
  });
});

describe("a swap at Finish", () => {
  it("leaves the planned lift as it was when the swap isn't kept", () => {
    const state = plan();
    for (const swaps of [[{ index: 0, keep: false }], [{ index: 0 }]]) {
      const next = applySessionProgression(state, 0, session(state, swaps));
      expect(bench(next)).toBe(bench(state));
      // The other lift still moves on its own sets.
      expect(next.workouts[0].exercises[1]).not.toBe(
        state.workouts[0].exercises[1]
      );
    }
  });

  it("puts a kept swap in the lift's place, moved by today's sets", () => {
    const state = plan();
    const next = applySessionProgression(
      state,
      0,
      session(state, [{ index: 0, keep: true }])
    );
    const kept = bench(next);
    expect(kept.instanceId).toBe("bench-1");
    expect(kept.exerciseId).toBe("db-bench");
    expect(kept.sets).toBe(3);
    // Every set at the target: the weight goes up a step from 30 kg.
    expect(kept.weight).toBeGreaterThan(30);
    expect(kept.performanceHistory).toHaveLength(1);
  });

  it("keeps a kept swap in an easier session too", () => {
    const state = plan();
    const next = applySessionProgression(state, 0, {
      ...session(state, [{ index: 0, keep: true }]),
      sessionVariant: "easier_today" as const,
    });
    expect(bench(next).exerciseId).toBe("db-bench");
    expect(bench(next).weight).toBe(30);
  });
});

describe("deleting a session whose swap was kept", () => {
  beforeEach(() => {
    resetFirestore();
    owner.currentUser = { uid: "u1" };
  });

  it("puts the planned lift back", async () => {
    const state = plan();
    seedFirestore({
      [programPath]: state as unknown as Record<string, unknown>,
    });
    await commitWorkoutCompletion(
      db,
      "u1",
      "saved",
      {
        createdAt: Timestamp.fromDate(new Date("2026-09-10T12:00:00Z")),
        date: "2026-09-10",
        exercises: [],
      },
      {
        dayIndex: 0,
        weekNumber: 2,
        dayIdentity: workoutCompletionDayIdentity(state.workouts[0])!,
        progression: session(state, [{ index: 0, keep: true }]),
      }
    );
    const saved = readDoc(programPath) as unknown as ProgramState;
    expect(bench(saved).exerciseId).toBe("db-bench");

    await deleteLoggedSession({ uid: "u1", kind: "workout", id: "saved" });

    const after = readDoc(programPath) as unknown as ProgramState;
    const restored: ProgramExercise = bench(after);
    expect(restored.exerciseId).toBe("bench-press");
    expect(restored.weight).toBe(100);
    expect(restored.performanceHistory).toEqual(
      bench(state).performanceHistory
    );
  });
});
