// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  uid: "runner" as string | null,
  queuedRuns: [] as Array<{
    id: string;
    merge: boolean;
    data: Record<string, unknown>;
  }>,
  storedRun: null as Record<string, unknown> | null,
  publish: vi.fn(async (_snapshot: unknown) => true),
  syncedListener: null as
    ((receipt: { uid: string; runId: string }) => void) | null,
}));

vi.mock("../connectedTrainingRelease", () => ({
  CONNECTED_TRAINING_RELEASED: true,
}));
vi.mock("../firebase", () => ({
  db: {},
  auth: {
    get currentUser() {
      return H.uid ? { uid: H.uid } : null;
    },
  },
}));
vi.mock("firebase/firestore");
vi.mock("../watchRunBridge", () => ({
  publishWatchRunSaveStatus: H.publish,
}));
vi.mock("../offlineQueue", () => ({
  pendingDocumentWrites: () => H.queuedRuns,
  subscribeSyncedRunWrites: (
    listener: (receipt: { uid: string; runId: string }) => void
  ) => {
    H.syncedListener = listener;
    return () => {
      H.syncedListener = null;
    };
  },
}));
vi.mock("../runResumeStorage", () => ({
  readStoredRunSummary: () => H.storedRun,
}));
vi.mock("@capacitor/app", () => ({
  App: { addListener: async () => ({ remove: async () => {} }) },
}));

import {
  clearWatchRunSyncStatus,
  queueWatchRunSyncStatus,
  reconcileWatchRunSyncStatus,
  startWatchRunSyncReconciler,
} from "../watchRunSyncStatus";
import {
  deferReads,
  releaseAllReads,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";

const SERVER_RUN = "users/runner/runs/saved-run";

function receipt() {
  return {
    uid: "runner",
    runId: "saved-run",
    sessionId: "saved-run",
    revision: 4,
    elapsedSeconds: 1200,
    distanceMeters: 5000,
    recordedAtMs: Date.now(),
  };
}

function finishedWatchRun() {
  return {
    phase: "finished",
    identity: { uid: "runner", runId: "saved-run", sessionId: "saved-run" },
    watchRevision: 3,
    finish: { watchCompanionUsed: true, finishedAt: Date.now() },
  };
}

function queuedRun(sessionId = "saved-run") {
  return {
    id: "saved-run",
    merge: false,
    data: { sessionId, duration: 1200, distance: 5000 },
  };
}

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  H.uid = "runner";
  H.queuedRuns = [];
  H.storedRun = null;
  H.syncedListener = null;
  H.publish.mockClear();
});

describe("Watch run sync receipt", () => {
  it("shows locally queued and then server synced with increasing revisions", async () => {
    const stop = startWatchRunSyncReconciler("runner");
    expect(queueWatchRunSyncStatus(receipt())).toBe(true);
    await vi.waitFor(() =>
      expect(H.publish).toHaveBeenCalledWith(
        expect.objectContaining({ revision: 4, saveStatus: "queued" })
      )
    );
    H.syncedListener?.({ uid: "runner", runId: "saved-run" });
    await vi.waitFor(() =>
      expect(H.publish).toHaveBeenCalledWith(
        expect.objectContaining({ revision: 5, saveStatus: "synced" })
      )
    );
    const snapshot = H.publish.mock.calls.at(-1)?.[0] as Record<
      string,
      unknown
    >;
    expect(snapshot).not.toHaveProperty("uid");
    expect(snapshot).not.toHaveProperty("runId");
    stop();
  });

  it("reconciles a queued receipt after a relaunch from the server document", async () => {
    expect(queueWatchRunSyncStatus(receipt())).toBe(true);
    seedFirestore({ [SERVER_RUN]: { sessionId: "saved-run" } });
    const stop = startWatchRunSyncReconciler("runner");
    await vi.waitFor(() =>
      expect(H.publish).toHaveBeenCalledWith(
        expect.objectContaining({ revision: 5, saveStatus: "synced" })
      )
    );
    stop();
    clearWatchRunSyncStatus("runner");
    expect(localStorage.getItem("tropos:watch-run-sync:v1:runner")).toBeNull();
  });

  it("does not claim a Watch save when its status receipt cannot persist", async () => {
    const originalSet = Storage.prototype.setItem;
    const refusal = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(function (this: Storage, key, value) {
        if (key === "tropos:watch-run-sync:v1:runner")
          throw new DOMException("quota", "QuotaExceededError");
        return originalSet.call(this, key, value);
      });
    try {
      expect(queueWatchRunSyncStatus(receipt())).toBe(false);
      await Promise.resolve();
      expect(H.publish).not.toHaveBeenCalled();
    } finally {
      refusal.mockRestore();
    }
  });

  it("recovers a missing receipt only from a matching durable run write", async () => {
    H.storedRun = finishedWatchRun();
    H.queuedRuns = [queuedRun()];
    await reconcileWatchRunSyncStatus("runner");
    await vi.waitFor(() =>
      expect(H.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "saved-run",
          revision: 4,
          elapsedSeconds: 1200,
          distanceMeters: 5000,
          saveStatus: "queued",
        })
      )
    );
    expect(
      localStorage.getItem("tropos:watch-run-sync:v1:runner")
    ).not.toBeNull();
  });

  it("uses a server-confirmed run after its local queue has drained", async () => {
    H.storedRun = finishedWatchRun();
    seedFirestore({
      [SERVER_RUN]: { sessionId: "saved-run", duration: 1200, distance: 5000 },
    });
    await reconcileWatchRunSyncStatus("runner");
    await vi.waitFor(() =>
      expect(H.publish).toHaveBeenCalledWith(
        expect.objectContaining({ revision: 5, saveStatus: "synced" })
      )
    );
  });

  it("leaves an unsaved review on the Watch without queue or server proof", async () => {
    H.storedRun = finishedWatchRun();
    await reconcileWatchRunSyncStatus("runner");
    expect(H.publish).not.toHaveBeenCalled();
    expect(localStorage.getItem("tropos:watch-run-sync:v1:runner")).toBeNull();

    H.queuedRuns = [queuedRun("another-session")];
    await reconcileWatchRunSyncStatus("runner");
    expect(H.publish).not.toHaveBeenCalled();
  });

  it("does not infer Watch use merely because the run was durably saved", async () => {
    H.storedRun = {
      ...finishedWatchRun(),
      finish: { watchCompanionUsed: false, finishedAt: Date.now() },
    };
    H.queuedRuns = [queuedRun()];
    await reconcileWatchRunSyncStatus("runner");
    expect(H.publish).not.toHaveBeenCalled();
  });

  it("does not restore a prior run after a new run starts during the server read", async () => {
    H.storedRun = finishedWatchRun();
    seedFirestore({
      [SERVER_RUN]: { sessionId: "saved-run", duration: 1200, distance: 5000 },
    });
    deferReads();
    const pending = reconcileWatchRunSyncStatus("runner");
    clearWatchRunSyncStatus("runner");
    releaseAllReads();
    await pending;
    expect(H.publish).not.toHaveBeenCalled();
  });

  it("does not publish an old account's server result after sign-out", async () => {
    H.storedRun = finishedWatchRun();
    seedFirestore({
      [SERVER_RUN]: { sessionId: "saved-run", duration: 1200, distance: 5000 },
    });
    deferReads();
    const pending = reconcileWatchRunSyncStatus("runner");
    H.uid = null;
    releaseAllReads();
    await pending;
    expect(H.publish).not.toHaveBeenCalled();
    expect(localStorage.getItem("tropos:watch-run-sync:v1:runner")).toBeNull();
  });
});
