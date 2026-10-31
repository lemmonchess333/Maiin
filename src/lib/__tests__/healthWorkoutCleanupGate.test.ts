// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, writer } = vi.hoisted(() => ({
  auth: { currentUser: { uid: "u1" } as { uid: string } | null },
  writer: { deleteWorkout: vi.fn(), exportWorkout: vi.fn() },
}));

vi.mock("../firebase", () => ({ auth, db: {} }));
vi.mock("firebase/firestore");
vi.mock("../healthKit", () => ({
  getNativeWorkoutCleanupPlugin: async () => writer,
  isWorkoutWriteAvailable: async () => false,
}));
vi.mock("../offlineQueue", () => ({
  subscribeSyncedRunWrites: () => () => {},
}));
vi.mock("../platform", () => ({ isNativePlatform: () => true }));
vi.mock("../connectedTrainingRelease", () => ({
  CONNECTED_TRAINING_RELEASED: false,
}));
vi.mock("@capacitor/app", () => ({ App: { addListener: vi.fn() } }));

import {
  pendingHealthWorkoutExports,
  queueHealthWorkoutDeletion,
  queueHealthWorkoutExport,
  reconcilePendingHealthExports,
} from "../healthWorkoutExport";
import {
  readDoc,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";

// The native writer as it answers without Health write access: it refuses
// before looking anything up. A run the app exported reads as deleted.
const exportedInHealth = new Set<string>();
beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  vi.clearAllMocks();
  auth.currentUser = { uid: "u1" };
  exportedInHealth.clear();
  writer.deleteWorkout.mockImplementation(async ({ runId }) => {
    if (!exportedInHealth.has(runId))
      throw new Error("Allow Tropos to save workouts in Apple Health.");
    exportedInHealth.delete(runId);
    return { status: "deleted" };
  });
});

describe("Apple Health cleanup after the feature is disabled", () => {
  it("retains deletion access while refusing new export intents", async () => {
    expect(queueHealthWorkoutExport("u1", "new-run", true)).toBe(true);
    expect(pendingHealthWorkoutExports("u1")).toEqual([]);

    exportedInHealth.add("old-exported-run");
    seedFirestore({
      "users/u1/healthWorkoutExports/old-exported-run": {
        runId: "old-exported-run",
        state: "exported",
      },
    });
    expect(queueHealthWorkoutDeletion("u1", "old-exported-run")).toBe(true);
    await reconcilePendingHealthExports("u1");
    expect(writer.deleteWorkout).toHaveBeenCalledWith({
      runId: "old-exported-run",
    });
    expect(writer.exportWorkout).not.toHaveBeenCalled();
    expect(pendingHealthWorkoutExports("u1")).toEqual([]);
    expect(
      readDoc("users/u1/healthWorkoutExports/old-exported-run")
    ).toBeUndefined();
  });

  it("drops the cleanup of a run nobody exported without asking Apple Health", async () => {
    expect(queueHealthWorkoutDeletion("u1", "never-exported-run")).toBe(true);
    await reconcilePendingHealthExports("u1");
    expect(writer.deleteWorkout).not.toHaveBeenCalled();
    expect(pendingHealthWorkoutExports("u1")).toEqual([]);
  });
});
