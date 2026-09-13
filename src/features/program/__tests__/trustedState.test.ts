// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase/firestore";
import { normalizeProgramState, type ProgramState } from "../programTypes";
import {
  commitWorkoutCompletion,
  workoutCompletionDayIdentity,
} from "@/lib/workoutCompletion";
import { commitProgramTransition } from "../programTransition";
import { createRequire } from "node:module";
import { mergeChangedFields, ProgrammeConflictError } from "../stateTransition";
import {
  resetFirestore,
  seedFirestore,
  readDoc,
  batchLog,
  failNextFirestore,
} from "@/test/firestoreHarness";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "u1" } },
}));
const db = {} as Firestore;
const PROGRAM = "users/u1/programState/current";
const WORKOUT = "users/u1/workouts/programme-final";
function plan(): ProgramState {
  return normalizeProgramState({
    goal: "recomp",
    currentPhase: "base",
    weekNumber: 2,
    splitType: "ppl",
    fatigueScore: 0,
    updatedAt: 0,
    settings: { autoProgression: true, microloading: true },
    weekHistory: [],
    workouts: [
      {
        dayName: "Push",
        dayType: "upper",
        completed: false,
        skipped: false,
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
  } as unknown as ProgramState);
}
function context(state = plan(), completed = [true, true, true]) {
  return {
    weekNumber: state.weekNumber,
    dayIndex: 0,
    dayIdentity: workoutCompletionDayIdentity(state.workouts[0])!,
    progression: {
      completionId: "final",
      date: "2026-09-10",
      prescription: {
        exercises: state.workouts[0].exercises,
        progressionBaseline: state.workouts[0].exercises,
      },
      setLogs: [
        completed.map((done) => ({ weight: 100, reps: 8, completed: done })),
      ],
    },
  };
}
function storedPlan() {
  return readDoc(PROGRAM) as unknown as ProgramState;
}
beforeAll(async () => {
  await import("../sessionCompletion");
});
beforeEach(() => {
  resetFirestore();
  seedFirestore({ [PROGRAM]: plan() as unknown as Record<string, unknown> });
});

describe("workout commitment", () => {
  it("commits progression and the workout once, preserving the first receipt on retry", async () => {
    await commitWorkoutCompletion(
      db,
      "u1",
      "programme-final",
      { notes: "Original", date: "2026-09-10" },
      context()
    );
    const exercise = storedPlan().workouts[0].exercises[0];
    expect(exercise.weight).toBeGreaterThan(100);
    expect(exercise.performanceHistory).toHaveLength(1);
    expect(exercise.performanceHistory[0].date).toBe("2026-09-10");
    expect(storedPlan().workouts[0]).toMatchObject({
      completed: true,
      completedWorkoutId: "programme-final",
    });
    expect(batchLog()[0]).toHaveLength(2);
    await commitWorkoutCompletion(
      db,
      "u1",
      "programme-final",
      { notes: "Retry" },
      context()
    );
    expect(storedPlan().workouts[0].exercises[0]).toEqual(exercise);
    expect(readDoc(WORKOUT)?.notes).toBe("Original");
  });

  it("does not progress an exercise whose last set was undone", async () => {
    await commitWorkoutCompletion(
      db,
      "u1",
      "programme-final",
      { completedSets: 2 },
      context(plan(), [true, true, false])
    );
    expect(storedPlan().workouts[0].exercises[0]).toMatchObject({
      weight: 100,
      performanceHistory: [],
    });
    expect(readDoc(WORKOUT)?.completedSets).toBe(2);
  });

  it("uses the corrected final performance rather than the earlier successful tap", async () => {
    const completion = context();
    completion.progression.setLogs[0][2].reps = 6;
    await commitWorkoutCompletion(db, "u1", "programme-final", {}, completion);
    expect(storedPlan().workouts[0].exercises[0]).toMatchObject({
      weight: 100,
      consecutiveFailures: 1,
    });
    expect(
      storedPlan().workouts[0].exercises[0].performanceHistory
    ).toHaveLength(1);
  });

  it("reconciles an older draft's provisional progression when finishing partially", async () => {
    const state = plan();
    const baseline = structuredClone(state.workouts[0].exercises[0]);
    state.workouts[0].exercises[0] = {
      ...baseline,
      weight: 101,
      sessionProgression: { id: "final", baseline },
    };
    seedFirestore({ [PROGRAM]: state as unknown as Record<string, unknown> });
    await commitWorkoutCompletion(
      db,
      "u1",
      "programme-final",
      {},
      context(plan(), [true, true, false])
    );
    expect(storedPlan().workouts[0].exercises[0]).toEqual(baseline);
  });

  it.each(["week", "target", "day already completed"])(
    "preserves a newer %s while saving history",
    async (change) => {
      const current = plan();
      if (change === "week") current.weekNumber++;
      if (change === "target") current.workouts[0].exercises[0].weight = 110;
      if (change === "day already completed") {
        current.workouts[0].completed = true;
        current.workouts[0].completedWorkoutId = "other-session";
      }
      seedFirestore({
        [PROGRAM]: current as unknown as Record<string, unknown>,
      });
      await commitWorkoutCompletion(
        db,
        "u1",
        "programme-final",
        { date: "2026-09-10" },
        context()
      );
      expect(storedPlan().workouts[0].exercises).toEqual(
        current.workouts[0].exercises
      );
      expect(storedPlan().weekNumber).toBe(current.weekNumber);
      if (change === "day already completed")
        expect(storedPlan().workouts[0].completedWorkoutId).toBe(
          "other-session"
        );
      expect(readDoc(WORKOUT)?.date).toBe("2026-09-10");
    }
  );

  it("rolls back both progression and history if the transaction fails", async () => {
    failNextFirestore("commit");
    await expect(
      commitWorkoutCompletion(db, "u1", "programme-final", {}, context())
    ).rejects.toThrow();
    expect(storedPlan()).toEqual(plan());
    expect(readDoc(WORKOUT)).toBeUndefined();
  });
});

describe("programme transitions", () => {
  it("preserves a completed lift while applying a stale run-layout change", async () => {
    const base = plan();
    const current = plan();
    current.workouts[0].completed = true;
    current.workouts[0].completedWorkoutId = "saved-workout";
    current.fatigueScore = 15;
    seedFirestore({ [PROGRAM]: current as unknown as Record<string, unknown> });
    await commitProgramTransition(db, "u1", base, { ...base, runDays: [] });
    expect(storedPlan().workouts).toEqual(current.workouts);
    expect(storedPlan().fatigueScore).toBe(15);
    expect(storedPlan().runDays).toEqual([]);
  });

  it("rejects replacing a concurrently edited workout array", async () => {
    const current = plan();
    current.workouts[0].completed = true;
    seedFirestore({ [PROGRAM]: current as unknown as Record<string, unknown> });
    await expect(
      commitProgramTransition(db, "u1", plan(), { ...plan(), workouts: [] })
    ).rejects.toBeInstanceOf(ProgrammeConflictError);
    expect(storedPlan()).toEqual(current);
  });

  it.each([false, true])(
    "saves profile and programme atomically (failure=%s)",
    async (fail) => {
      seedFirestore({
        "users/u1": {
          weeklyWorkoutsTarget: 3,
          displayName: "Unrelated latest edit",
        },
      });
      if (fail) failNextFirestore("commit");
      const save = commitProgramTransition(
        db,
        "u1",
        plan(),
        { ...plan(), splitType: "upper_lower" },
        {
          base: { weeklyWorkoutsTarget: 3 },
          patch: { weeklyWorkoutsTarget: 4 },
        }
      );
      if (fail) await expect(save).rejects.toThrow();
      else await save;
      expect(readDoc("users/u1")).toEqual({
        weeklyWorkoutsTarget: fail ? 3 : 4,
        displayName: "Unrelated latest edit",
      });
      expect(storedPlan().splitType).toBe(fail ? "ppl" : "upper_lower");
      if (!fail) expect(batchLog()[0]).toHaveLength(2);
    }
  );
});

it("keeps client and server transition decisions identical", () => {
  const server = createRequire(import.meta.url)(
    "../../../../functions/lib/stateTransition"
  );
  const base = { workouts: [1], runDays: [1], note: "old" };
  const scenarios = [
    {
      proposed: { ...base, runDays: [2] },
      current: { ...base, workouts: [2] },
    },
    {
      proposed: { ...base, workouts: [3] },
      current: { ...base, workouts: [2] },
    },
    { proposed: { ...base, note: "new" }, current: { ...base, note: "new" } },
  ];
  for (const { proposed, current } of scenarios) {
    const outcome = (merge: typeof mergeChangedFields) => {
      try {
        return merge(base, proposed, current);
      } catch (error) {
        return { conflict: (error as { code: string }).code };
      }
    };
    expect(outcome(server.mergeChangedFields)).toEqual(
      outcome(mergeChangedFields)
    );
  }
});
