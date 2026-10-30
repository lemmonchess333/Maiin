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
import { resetFirestore } from "@/test/firestoreHarness";

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  vi.clearAllMocks();
  auth.currentUser = { uid: "u1" };
  writer.deleteWorkout.mockResolvedValue({ status: "deleted" });
});

describe("Apple Health cleanup after the feature is disabled", () => {
  it("retains deletion access while refusing new export intents", async () => {
    expect(queueHealthWorkoutExport("u1", "new-run", true)).toBe(true);
    expect(pendingHealthWorkoutExports("u1")).toEqual([]);

    expect(queueHealthWorkoutDeletion("u1", "old-exported-run")).toBe(true);
    await reconcilePendingHealthExports("u1");
    expect(writer.deleteWorkout).toHaveBeenCalledWith({
      runId: "old-exported-run",
    });
    expect(writer.exportWorkout).not.toHaveBeenCalled();
    expect(pendingHealthWorkoutExports("u1")).toEqual([]);
  });
});
