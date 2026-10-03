// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase/firestore";
import {
  allPaths,
  failNextFirestore,
  readDoc,
  resetFirestore,
} from "@/test/firestoreHarness";
import type { ProgramExercise } from "@/features/program/programTypes";
import { localDateString } from "@/lib/dateHelpers";

/**
 * Finishing a lift, as both writers (a programme day and a saved routine)
 * now do it: the saved workout, the receipt and the post it can share.
 * Driven through the one Firestore fake (ADR-0009).
 */
vi.mock("firebase/firestore");
const h = vi.hoisted(() => ({
  user: { uid: "lifter" } as { uid: string } | null,
  compose: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: {
    get currentUser() {
      return h.user;
    },
  },
}));
vi.mock("@/lib/shareComposer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shareComposer")>()),
  compose: h.compose,
}));

import {
  completeLift,
  liftTotals,
  liftWorkoutExercises,
  type FinishedLift,
} from "../liftCompletion";
import { estimateLiftBurn } from "../workoutBurn";

const exercise = (extra: Partial<ProgramExercise>): ProgramExercise =>
  ({
    exerciseId: "bench-press",
    name: "Bench Press",
    movementCategory: "horizontal_push",
    sets: 3,
    reps: 8,
    weight: 60,
    ...extra,
  }) as ProgramExercise;

const BENCH = exercise({});
const CURL = exercise({
  exerciseId: "curl",
  name: "Curl",
  movementCategory: "arms" as ProgramExercise["movementCategory"],
  sets: 2,
  reps: 12,
  weight: 15,
});
const PLANK = exercise({
  exerciseId: "weighted-plank",
  name: "Weighted Plank",
  movementCategory: "core" as ProgramExercise["movementCategory"],
  repUnit: "seconds",
  sets: 2,
  reps: 60,
  weight: 20,
});

const done = (reps: number, weight: number) => ({
  reps,
  weight,
  completed: true,
});

/** Started at noon two days ago: the workout belongs to that day. */
const STARTED = new Date(Date.now() - 2 * 86_400_000);
STARTED.setHours(12, 0, 0, 0);

const routineLift = (extra: Partial<FinishedLift> = {}): FinishedLift => ({
  uid: "lifter",
  author: { displayName: "Alex" },
  source: "routine",
  completionId: "c1",
  startedAt: STARTED.getTime(),
  ran: [BENCH, CURL],
  // Bench done, two of three sets; the curl left out.
  setLogs: [
    [done(8, 60), done(7, 60), { ...done(8, 60), completed: false }],
    [],
  ],
  exerciseNotes: { 0: "  Seat at 4 " },
  durationMinutes: 41,
  bodyweightKg: 80,
  title: "Bench day",
  notes: "Routine: Bench day (saved from Sam)",
  extra: { routineId: "r1", routineName: "Bench day" },
  ...extra,
});

let online: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  h.user = { uid: "lifter" };
  h.compose.mockReset().mockResolvedValue(null);
  online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(() => online.mockRestore());

describe("liftWorkoutExercises", () => {
  it("records the sets done against the prescription, and how many were planned", () => {
    const [bench, curl] = liftWorkoutExercises(
      [BENCH, CURL],
      [[done(8, 62.5), { ...done(8, 62.5), completed: false }], []],
      { 0: " Seat at 4 ", 1: "   " }
    );
    expect(bench).toMatchObject({
      exerciseId: "bench-press",
      exerciseName: "Bench Press",
      category: "horizontal_push",
      notes: "Seat at 4",
      plannedSetCount: 3,
      sets: [
        expect.objectContaining({
          reps: 8,
          weightKg: 62.5,
          plannedReps: 8,
          plannedWeightKg: 60,
        }),
      ],
    });
    // A blank note is no note.
    expect(curl).not.toHaveProperty("notes");
    expect(curl).toMatchObject({ sets: [], plannedSetCount: 2 });
  });

  it("carries a timed hold's unit", () => {
    const [plank] = liftWorkoutExercises([PLANK], [[done(60, 20)]]);
    expect(plank.repUnit).toBe("seconds");
    expect(liftWorkoutExercises([BENCH], [[]])[0]).not.toHaveProperty(
      "repUnit"
    );
  });

  it("takes a day marked done without a session as its last attempt", () => {
    const [bench] = liftWorkoutExercises(
      [
        exercise({
          lastAttemptedWeight: 57.5,
          lastPerformance: { reps: 7 } as ProgramExercise["lastPerformance"],
        }),
      ],
      undefined
    );
    expect(bench.sets).toHaveLength(3);
    expect(bench.sets[0]).toMatchObject({ reps: 7, weightKg: 57.5 });
  });
});

describe("liftTotals", () => {
  it("counts weight moved, which a timed hold has none of", () => {
    const exercises = liftWorkoutExercises(
      [BENCH, PLANK],
      [[done(8, 60), done(8, 60)], [done(60, 20)]]
    );
    const totals = liftTotals(exercises, {
      durationMinutes: 30,
      bodyweightKg: 80,
    });
    expect(totals).toMatchObject({
      tonnageKg: 960,
      completedSetCount: 3,
      durationMinutes: 30,
    });
    expect(totals.totalCalories).toBe(
      estimateLiftBurn({
        durationMinutes: 30,
        tonnageKg: 960,
        bodyweightKg: 80,
        completedSetCount: 3,
      })
    );
  });

  it("saves three minutes a set without a clock, and burns from the sets", () => {
    const exercises = liftWorkoutExercises([BENCH], [[done(8, 60)]]);
    const totals = liftTotals(exercises, {
      durationMinutes: 0,
      bodyweightKg: 80,
    });
    expect(totals.durationMinutes).toBe(3);
    expect(totals.totalCalories).toBe(
      estimateLiftBurn({
        durationMinutes: 0,
        tonnageKg: 480,
        bodyweightKg: 80,
        completedSetCount: 1,
      })
    );
  });
});

describe("completeLift", () => {
  it("saves a routine's workout as a programme's is saved", async () => {
    const receipt = await completeLift(routineLift());
    expect(receipt).toMatchObject({
      workoutId: "routine-c1",
      syncStatus: "synced",
      committed: null,
    });
    await expect(receipt.sync).resolves.toBe("synced");
    const saved = readDoc("users/lifter/workouts/routine-c1");
    expect(saved).toMatchObject({
      date: localDateString(STARTED),
      source: "routine",
      completionId: "c1",
      routineId: "r1",
      routineName: "Bench day",
      notes: "Routine: Bench day (saved from Sam)",
      durationMinutes: 41,
      totalVolume: 8 * 60 + 7 * 60,
      burnContext: { bodyweightKg: 80 },
    });
    // D2's planned set count, which a routine's workout did not carry.
    expect(saved?.exercises).toEqual([
      expect.objectContaining({ notes: "Seat at 4", plannedSetCount: 3 }),
      expect.objectContaining({ sets: [], plannedSetCount: 2 }),
    ]);
  });

  it("offers a post of what was done, not the routine as written", async () => {
    const receipt = await completeLift(routineLift());
    await receipt.share.post();
    expect(h.compose).toHaveBeenCalledWith("lifter", {
      type: "workout",
      title: "Bench day",
      meta: ["1 exercise", "900 kg volume", "41 min"],
    });
  });

  it("waits in the offline queue, then saves", async () => {
    online.mockReturnValue(false);
    const receipt = await completeLift(routineLift());
    expect(receipt.syncStatus).toBe("queued");
    expect(receipt).not.toHaveProperty("committed");
    expect(readDoc("users/lifter/workouts/routine-c1")).toBeUndefined();
    online.mockReturnValue(true);
    const { flushQueue } = await import("@/lib/offlineQueue");
    await flushQueue({} as Firestore, "lifter");
    await expect(receipt.sync).resolves.toBe("synced");
    expect(readDoc("users/lifter/workouts/routine-c1")).toMatchObject({
      source: "routine",
    });
  });

  it("throws when the save fails, and leaves nothing behind", async () => {
    failNextFirestore("commit");
    await expect(completeLift(routineLift())).rejects.toThrow();
    expect(allPaths()).toEqual([]);
  });

  it("queues nothing for an account no longer signed in, offline too", async () => {
    // The queue takes whatever account it is given; the check is here.
    online.mockReturnValue(false);
    h.user = { uid: "someone-else" };
    await expect(completeLift(routineLift())).rejects.toThrow(/Sign in/);
    const { hasQueuedWorkoutCompletion } = await import("@/lib/offlineQueue");
    expect(hasQueuedWorkoutCompletion("lifter", "routine-c1")).toBe(false);
  });

  it("saves nothing for an account that is no longer signed in", async () => {
    h.user = { uid: "someone-else" };
    await expect(completeLift(routineLift())).rejects.toThrow(/Sign in/);
    expect(allPaths()).toEqual([]);
  });
});
