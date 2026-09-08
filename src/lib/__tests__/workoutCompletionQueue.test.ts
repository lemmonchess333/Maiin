// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp, type Firestore } from "firebase/firestore";
import {
  queueWorkoutCompletion,
  workoutCompletionDayIdentity,
  flushQueue,
  getQueueLength,
  getFailedWorkoutCompletionCount,
} from "../offlineQueue";
import {
  resetFirestore,
  seedFirestore,
  readDoc,
  failNextFirestore,
  allPaths,
  writeLog,
  deferReads,
  pendingReads,
  releaseAllReads,
} from "@/test/firestoreHarness";

vi.mock("firebase/firestore");
const { auth } = vi.hoisted(() => ({
  auth: { currentUser: { uid: "user-a" } as { uid: string } | null },
}));
vi.mock("@/lib/firebase", () => ({ auth }));
vi.mock("@/lib/errorReporting", () => ({ captureError: vi.fn() }));
const db = {} as Firestore;
const day = {
  dayName: "Push",
  dayType: "upper",
  completed: false,
  skipped: true,
  exercises: [{ instanceId: "bench-original", exerciseId: "bench", sets: 3 }],
};
const context = {
  weekNumber: 2,
  dayIndex: 0,
  dayIdentity: workoutCompletionDayIdentity(day)!,
};
const workout = () => ({
  completionId: "one",
  date: "2026-09-06",
  createdAt: Timestamp.fromMillis(1788696000000),
  notes: "Original note",
  exercises: [{ exerciseId: "bench", sets: [{ weightKg: 50, reps: 8 }] }],
});
let online: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  auth.currentUser = { uid: "user-a" };
  online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
});
afterEach(() => online.mockRestore());
async function reconnect(uid = "user-a") {
  online.mockReturnValue(true);
  return flushQueue(db, uid);
}

describe("durable workout completion replay", () => {
  it("atomically saves the workout and matching day without overwriting newer programme fields", async () => {
    const receipt = queueWorkoutCompletion(
      db,
      "user-a",
      "programme-one",
      workout(),
      context
    );
    expect(getQueueLength("user-a")).toBe(1);
    seedFirestore({
      "users/user-a/programState/current": {
        weekNumber: 2,
        workouts: [day],
        fatigueScore: 42,
        nextWorkoutOverride: 0,
      },
    });
    expect(await reconnect()).toBe(1);
    await expect(receipt).resolves.toBe("synced");
    expect(readDoc("users/user-a/programState/current")).toMatchObject({
      fatigueScore: 42,
      workouts: [expect.objectContaining({ completed: true, skipped: false })],
    });
    expect(readDoc("users/user-a/programState/current")).not.toHaveProperty(
      "nextWorkoutOverride"
    );
    expect(
      readDoc("users/user-a/workouts/programme-one")?.createdAt
    ).toBeInstanceOf(Timestamp);
  });

  it.each(["week changed", "exercise replaced", "training block changed"])(
    "keeps History recoverable when %s while leaving the current plan untouched",
    async (change) => {
      queueWorkoutCompletion(db, "user-a", "programme-one", workout(), context);
      const current = {
        weekNumber: change === "week changed" ? 3 : 2,
        workouts: [
          {
            ...day,
            exercises: [
              {
                instanceId:
                  change === "exercise replaced"
                    ? "new-bench"
                    : "bench-original",
              },
            ],
          },
        ],
        fatigueScore: 7,
        ...(change === "training block changed"
          ? { trainingBlock: { id: "new-block" } }
          : {}),
      };
      seedFirestore({ "users/user-a/programState/current": current });
      await reconnect();
      expect(readDoc("users/user-a/programState/current")).toEqual(current);
      expect(readDoc("users/user-a/workouts/programme-one")).toMatchObject({
        date: "2026-09-06",
        notes: "Original note",
      });
    }
  );

  it("retires the original recovery draft after background sync across programme weeks", async () => {
    const key = "tropos_workout_draft:v2:user-a:old-week";
    localStorage.setItem(
      key,
      JSON.stringify({
        dayIndex: 0,
        identity: "old-week",
        completionId: "one",
        completionCommandId: "one",
        savedAt: Date.now(),
        completionPending: true,
      })
    );
    queueWorkoutCompletion(db, "user-a", "programme-one", workout(), context);
    seedFirestore({
      "users/user-a/programState/current": { weekNumber: 3, workouts: [day] },
    });
    await reconnect();
    expect(localStorage.getItem(key)).toBeNull();
    expect(readDoc("users/user-a/workouts/programme-one")).toBeDefined();
  });

  it("retains failures and retries the original document once, without changing its saved data", async () => {
    const first = queueWorkoutCompletion(
      db,
      "user-a",
      "routine-one",
      workout()
    );
    failNextFirestore("commit", { code: "permission-denied" });
    await reconnect();
    await expect(first).resolves.toBe("failed");
    expect(getQueueLength("user-a")).toBe(1);
    expect(getFailedWorkoutCompletionCount("user-a")).toBe(1);
    online.mockReturnValue(false);
    const retry = queueWorkoutCompletion(db, "user-a", "routine-one", {
      ...workout(),
      notes: "Unrelated newer session",
    });
    expect(getQueueLength("user-a")).toBe(1);
    await reconnect();
    await expect(retry).resolves.toBe("synced");
    expect(readDoc("users/user-a/workouts/routine-one")?.notes).toBe(
      "Original note"
    );
    expect(
      allPaths().filter((path) => path.includes("/workouts/"))
    ).toHaveLength(1);
  });

  it("does not overwrite a workout already acknowledged and edited elsewhere", async () => {
    const receipt = queueWorkoutCompletion(
      db,
      "user-a",
      "programme-one",
      workout(),
      context
    );
    seedFirestore({
      "users/user-a/workouts/programme-one": {
        completionId: "one",
        notes: "Edited later",
      },
    });
    await reconnect();
    await expect(receipt).resolves.toBe("synced");
    expect(readDoc("users/user-a/workouts/programme-one")?.notes).toBe(
      "Edited later"
    );
    expect(writeLog()).toHaveLength(0);
  });

  it("stops after an account switch during a transaction read, retaining the outgoing user's copy", async () => {
    queueWorkoutCompletion(db, "user-a", "programme-one", workout(), context);
    deferReads();
    online.mockReturnValue(true);
    const flush = flushQueue(db, "user-a");
    await vi.waitFor(() => expect(pendingReads()).toHaveLength(1));
    auth.currentUser = { uid: "user-b" };
    releaseAllReads();
    expect(await flush).toBe(0);
    expect(writeLog()).toHaveLength(0);
    expect(getQueueLength("user-a")).toBe(1);
    expect(getQueueLength("user-b")).toBe(0);
    expect(await flushQueue(db, "user-b")).toBe(0);
  });
});
