import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { auth, writer, locallyDisabled, localConsent, localQueue, localReview } =
  vi.hoisted(() => ({
    auth: { currentUser: { uid: "u1" } as { uid: string } | null },
    writer: {
      getWorkoutExportStatus: vi.fn(),
      exportWorkout: vi.fn(),
      deleteWorkout: vi.fn(),
    },
    locallyDisabled: vi.fn(() => false),
    localConsent: vi.fn(
      () => null as { id: string; enabledAtMs: number } | null
    ),
    localQueue: vi.fn(() => [] as Array<{ id: string }>),
    localReview: vi.fn(
      () => null as { phase: string; identity?: { runId: string } } | null
    ),
  }));

vi.mock("../firebase", () => ({ auth, db: {} }));
vi.mock("firebase/firestore");
vi.mock("../healthKit", () => ({
  getNativeWorkoutExportPlugin: async () => writer,
  getNativeWorkoutCleanupPlugin: async () => writer,
  isWorkoutWriteAvailable: async () => true,
}));
vi.mock("../offlineQueue", () => ({
  subscribeSyncedRunWrites: () => () => {},
  pendingDocumentWrites: () => localQueue(),
}));
vi.mock("../runResumeStorage", () => ({ readStoredRun: () => localReview() }));
vi.mock("../platform", () => ({ isNativePlatform: () => true }));
vi.mock("../connectedTrainingPrefs", () => ({
  isWorkoutExportLocallyDisabled: () => locallyDisabled(),
  readWorkoutExportLocalConsent: () => localConsent(),
}));
vi.mock("../connectedTrainingRelease", () => ({
  CONNECTED_TRAINING_RELEASED: true,
}));
vi.mock("@capacitor/app", () => ({ App: { addListener: vi.fn() } }));

import {
  pendingHealthWorkoutExports,
  queueHealthWorkoutDeletion,
  queueHealthWorkoutExport,
  reconcilePendingHealthExports,
} from "../healthWorkoutExport";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";

function memoryStorage(denyWrite = false): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => {
      if (denyWrite) throw new Error("storage unavailable");
      values.set(key, value);
    },
  };
}

const run = {
  startedAt: { toMillis: () => 0 },
  recordingStartedAt: { toMillis: () => 1_000 },
  recordingEndedAt: { toMillis: () => 61_000 },
  duration: 45,
  distance: 1_000,
  calories: 80,
  place: null,
  activityType: "freerun",
  isInvalid: false,
};
const CONSENT_PATH = "users/u1/settings/connectedTraining";

function seedConsent(
  enabled: boolean,
  enabledAtMs = 1,
  consentId: string | null = null
) {
  seedFirestore({
    [CONSENT_PATH]: {
      saveWorkoutsToHealth: enabled,
      workoutExportEnabledAt: { toMillis: () => enabledAtMs },
      workoutExportConsentId: consentId,
    },
  });
}

function seedRun(runId: string, data: Record<string, unknown> = run) {
  seedFirestore({ [`users/u1/runs/${runId}`]: data });
}

beforeEach(() => {
  resetFirestore();
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", memoryStorage());
  auth.currentUser = { uid: "u1" };
  seedConsent(true);
  locallyDisabled.mockReturnValue(false);
  localConsent.mockReturnValue(null);
  localQueue.mockReturnValue([]);
  localReview.mockReturnValue(null);
  writer.getWorkoutExportStatus.mockResolvedValue({ status: "absent" });
  writer.exportWorkout.mockImplementation(async ({ revision }) => ({
    status: "created",
    workoutId: "hk-1",
    revision,
  }));
  writer.deleteWorkout.mockResolvedValue({ status: "deleted" });
});
afterEach(() => vi.unstubAllGlobals());

describe("Apple Health export reconciliation", () => {
  it("waits for the canonical server run before exporting", async () => {
    queueHealthWorkoutExport("u1", "run-1", true);
    await reconcilePendingHealthExports("u1");
    expect(writer.exportWorkout).not.toHaveBeenCalled();
    expect(pendingHealthWorkoutExports("u1")).toEqual([
      { runId: "run-1", status: "pending" },
    ]);

    seedRun("run-1");
    await reconcilePendingHealthExports("u1");
    expect(writer.exportWorkout).toHaveBeenCalledOnce();
    expect(writer.exportWorkout.mock.calls[0][0]).toMatchObject({
      runId: "run-1",
      startMs: 1_000,
      endMs: 61_000,
      durationSeconds: 45,
      distanceMeters: 1_000,
      energyKcal: 80,
    });
    expect(pendingHealthWorkoutExports("u1")).toEqual([]);
  });

  it("retires only an old orphan intent, keeping an offline queued Save", async () => {
    const preparedAtMs = Date.now() - 6 * 60 * 1000;
    localQueue.mockReturnValue([{ id: "run-queued" }]);
    queueHealthWorkoutExport("u1", "run-queued", true, { preparedAtMs });
    await reconcilePendingHealthExports("u1");
    expect(pendingHealthWorkoutExports("u1")).toEqual([
      { runId: "run-queued", status: "pending" },
    ]);

    localQueue.mockReturnValue([]);
    await reconcilePendingHealthExports("u1");
    expect(pendingHealthWorkoutExports("u1")).toEqual([]);
    expect(writer.exportWorkout).not.toHaveBeenCalled();
  });

  it("uses actual recording time and active duration after GPS wait and pause", async () => {
    seedRun("run-1");
    queueHealthWorkoutExport("u1", "run-1", true);
    await reconcilePendingHealthExports("u1");
    expect(writer.exportWorkout.mock.calls[0][0]).toMatchObject({
      startMs: 1_000,
      endMs: 61_000,
      durationSeconds: 45,
    });
    expect(writer.exportWorkout.mock.calls[0][0].revision).toContain(",45,");
  });

  it("rejects older run documents without actual recording time or active duration", async () => {
    const oldRun: Record<string, unknown> = {
      ...run,
      recordingStartedAt: undefined,
    };
    seedRun("run-old", oldRun);
    queueHealthWorkoutExport("u1", "run-old", true);
    await reconcilePendingHealthExports("u1");
    expect(writer.exportWorkout).not.toHaveBeenCalled();

    oldRun.recordingStartedAt = run.recordingStartedAt;
    oldRun.duration = undefined;
    seedRun("run-no-duration", oldRun);
    queueHealthWorkoutExport("u1", "run-no-duration", true);
    await reconcilePendingHealthExports("u1");
    expect(writer.exportWorkout).not.toHaveBeenCalled();

    oldRun.duration = 63;
    seedRun("run-bad-duration", oldRun);
    queueHealthWorkoutExport("u1", "run-bad-duration", true);
    await reconcilePendingHealthExports("u1");
    expect(writer.exportWorkout).not.toHaveBeenCalled();
  });

  it("reconciles an intent queued during an in-flight pass", async () => {
    seedRun("run-first");
    seedRun("run-second");
    queueHealthWorkoutExport("u1", "run-first", true);
    queueHealthWorkoutExport("u1", "run-second", true);
    await reconcilePendingHealthExports("u1");
    expect(writer.exportWorkout).toHaveBeenCalledTimes(2);
    expect(
      writer.exportWorkout.mock.calls.map(([payload]) => payload.runId)
    ).toEqual(["run-first", "run-second"]);
    expect(pendingHealthWorkoutExports("u1")).toEqual([]);
  });

  it("uses the server opt-in time to reject a later opt-in for any Save", async () => {
    seedConsent(true, 200);
    seedRun("run-before-opt-in");
    seedRun("run-cached-old-choice");
    expect(
      queueHealthWorkoutExport("u1", "run-before-opt-in", false, {
        provisional: true,
        preparedAtMs: 100,
      })
    ).toBe(true);
    await reconcilePendingHealthExports("u1");
    expect(writer.exportWorkout).not.toHaveBeenCalled();
    expect(pendingHealthWorkoutExports("u1")).toEqual([]);

    expect(
      queueHealthWorkoutExport("u1", "run-cached-old-choice", true, {
        preparedAtMs: 100,
      })
    ).toBe(true);
    await reconcilePendingHealthExports("u1");
    expect(writer.exportWorkout).not.toHaveBeenCalled();
    expect(pendingHealthWorkoutExports("u1")).toEqual([]);

    seedConsent(true, 50);
    seedRun("run-after-opt-in");
    expect(
      queueHealthWorkoutExport("u1", "run-after-opt-in", false, {
        provisional: true,
        preparedAtMs: 100,
      })
    ).toBe(true);
    await reconcilePendingHealthExports("u1");
    expect(writer.exportWorkout).toHaveBeenCalledOnce();
    expect(writer.exportWorkout.mock.calls[0][0].runId).toBe(
      "run-after-opt-in"
    );
  });

  it("matches a same-device offline opt-in without accepting a later off/on cycle", async () => {
    // Server timestamp resolved after the Save.
    seedConsent(true, 200, "choice-1");
    seedRun("run-offline-choice");
    localConsent.mockReturnValue({ id: "choice-1", enabledAtMs: 50 });
    expect(
      queueHealthWorkoutExport("u1", "run-offline-choice", true, {
        preparedAtMs: 100,
      })
    ).toBe(true);
    await reconcilePendingHealthExports("u1");
    expect(writer.exportWorkout).toHaveBeenCalledOnce();

    seedConsent(true, 200, "choice-2");
    seedRun("run-old-choice");
    expect(
      queueHealthWorkoutExport("u1", "run-old-choice", true, {
        preparedAtMs: 100,
      })
    ).toBe(true);
    await reconcilePendingHealthExports("u1");
    expect(writer.exportWorkout).toHaveBeenCalledOnce();
    expect(pendingHealthWorkoutExports("u1")).toEqual([]);
  });

  it("does not turn a pending deletion back into an export on Save retry", async () => {
    seedRun("run-1");
    expect(queueHealthWorkoutDeletion("u1", "run-1")).toBe(true);
    expect(queueHealthWorkoutExport("u1", "run-1", true)).toBe(true);
    await reconcilePendingHealthExports("u1");
    expect(writer.exportWorkout).not.toHaveBeenCalled();
    expect(pendingHealthWorkoutExports("u1")).toEqual([
      { runId: "run-1", status: "pending-delete" },
    ]);
  });

  it("fails closed on missing consent, local opt-out, or unverified Health status", async () => {
    seedConsent(false);
    seedRun("run-no-consent");
    queueHealthWorkoutExport("u1", "run-no-consent", true);
    await reconcilePendingHealthExports("u1");
    expect(writer.exportWorkout).not.toHaveBeenCalled();

    seedConsent(true);
    seedRun("run-local-veto");
    locallyDisabled.mockReturnValue(true);
    queueHealthWorkoutExport("u1", "run-local-veto", true);
    await reconcilePendingHealthExports("u1");
    expect(writer.exportWorkout).not.toHaveBeenCalled();

    locallyDisabled.mockReturnValue(false);
    seedRun("run-unverified");
    writer.getWorkoutExportStatus.mockResolvedValue({ status: "unverified" });
    queueHealthWorkoutExport("u1", "run-unverified", true);
    await reconcilePendingHealthExports("u1");
    expect(writer.exportWorkout).not.toHaveBeenCalled();
    expect(pendingHealthWorkoutExports("u1")).toEqual([
      { runId: "run-unverified", status: "blocked" },
    ]);
  });

  it("checks opt-out again immediately before a native write", async () => {
    seedRun("run-1");
    writer.getWorkoutExportStatus.mockImplementationOnce(async () => {
      locallyDisabled.mockReturnValue(true);
      return { status: "absent" };
    });
    queueHealthWorkoutExport("u1", "run-1", true);
    await reconcilePendingHealthExports("u1");
    expect(writer.exportWorkout).not.toHaveBeenCalled();
    // The coalesced second pass observes the opt-out and retires the intent.
    expect(pendingHealthWorkoutExports("u1")).toEqual([]);
  });

  it("retains a failed deletion as a deletion on retry", async () => {
    writer.deleteWorkout
      .mockRejectedValueOnce(new Error("revoked"))
      .mockRejectedValueOnce(new Error("revoked"));
    queueHealthWorkoutDeletion("u1", "run-1");
    await reconcilePendingHealthExports("u1");
    expect(pendingHealthWorkoutExports("u1")).toEqual([
      { runId: "run-1", status: "pending-delete" },
    ]);
    await reconcilePendingHealthExports("u1");
    expect(writer.deleteWorkout).toHaveBeenCalledTimes(3);
    expect(writer.exportWorkout).not.toHaveBeenCalled();
  });

  it("never exports when a durable intent cannot be stored", async () => {
    seedRun("run-1");
    vi.stubGlobal("localStorage", memoryStorage(true));
    queueHealthWorkoutExport("u1", "run-1", true);
    await reconcilePendingHealthExports("u1");
    expect(writer.exportWorkout).not.toHaveBeenCalled();
  });
});
