/**
 * Deleting a workout whose save is still in the offline queue (#3070 keeps
 * a failed online save there to retry). History lays the queued copy over
 * the list, so the person can open it and tap Delete; the delete must not
 * leave the queued save to bring it back, plan tick and all, on the next
 * flush.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore");
vi.mock("@/lib/healthWorkoutExport", () => ({
  queueHealthWorkoutDeletion: vi.fn(() => true),
  reconcilePendingHealthExports: vi.fn(() => Promise.resolve()),
}));
const queue = vi.hoisted(() => ({
  queued: new Set<string>(),
  flushQueue: vi.fn(async () => 0),
}));
vi.mock("@/lib/offlineQueue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/offlineQueue")>()),
  hasQueuedWorkoutCompletion: (_uid: string, id: string) =>
    queue.queued.has(id),
  flushQueue: queue.flushQueue,
}));

import {
  allPaths,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";
import { deleteLoggedSession } from "@/lib/sessionDelete";

const online = (value: boolean) =>
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => value,
  });

beforeEach(() => {
  resetFirestore();
  queue.queued.clear();
  queue.flushQueue.mockReset();
  queue.flushQueue.mockResolvedValue(0);
  online(true);
});

describe("deleting a workout whose save is queued", () => {
  it("sends the save first, then deletes what landed", async () => {
    queue.queued.add("w-q");
    queue.flushQueue.mockImplementation(async () => {
      // The replay lands the workout on the server and leaves the queue.
      seedFirestore({ "users/u1/workouts/w-q": { date: "2026-11-09" } });
      queue.queued.delete("w-q");
      return 1;
    });
    await deleteLoggedSession({ uid: "u1", kind: "workout", id: "w-q" });
    expect(queue.flushQueue).toHaveBeenCalledOnce();
    expect(allPaths()).not.toContain("users/u1/workouts/w-q");
  });

  it("refuses while the save cannot be sent, so a flush cannot bring it back", async () => {
    queue.queued.add("w-q");
    await expect(
      deleteLoggedSession({ uid: "u1", kind: "workout", id: "w-q" })
    ).rejects.toThrow("Sync this workout before deleting it.");
    online(false);
    await expect(
      deleteLoggedSession({ uid: "u1", kind: "workout", id: "w-q" })
    ).rejects.toThrow("Connect to delete this workout.");
  });

  it("does not flush for a workout with nothing queued", async () => {
    seedFirestore({ "users/u1/workouts/w-1": { date: "2026-11-09" } });
    await deleteLoggedSession({ uid: "u1", kind: "workout", id: "w-1" });
    expect(queue.flushQueue).not.toHaveBeenCalled();
    expect(allPaths()).not.toContain("users/u1/workouts/w-1");
  });
});
