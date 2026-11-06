// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  auth: { currentUser: { uid: "runner" } as { uid: string } | null },
  reconcile: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({ auth: h.auth, db: {} }));
vi.mock("firebase/firestore");
vi.mock("@/features/program/runningReviewTransport", () => ({
  runningReviewTransport: { reconcileActivity: h.reconcile },
}));
import {
  activityLinkKey,
  linkCanonicalActivity,
  resetRejectedActivityLink,
} from "../canonicalActivityLink";
import { readString, writeString } from "@/lib/localStore";
import {
  resetFirestore,
  seedFirestore,
  readLog,
  readsAt,
  setSnapshotMetadata,
  deferReads,
  pendingReads,
  releaseAllReads,
  resumeReads,
} from "@/test/firestoreHarness";
const SAVED = "users/runner/runs/run1",
  AUTHORITY = "users/runner/runningState/current";
const proof = {
  schemaVersion: 1,
  accountId: "runner",
  activityId: "run1",
  launchId: `launch_${"a".repeat(64)}`,
  session: { id: "session1" },
};
const result = (baseRevision = 4) => ({
  outcome: "linked",
  receipt: {
    schemaVersion: 1,
    accountId: "runner",
    activityId: "run1",
    launchId: proof.launchId,
    sessionId: "session1",
    baseRevision,
    appliedRevision: baseRevision + 1,
    classification: "user_reported_activity",
    progressionEligible: false,
  },
});
const authority = (revision = 4) => ({
  schemaVersion: 1,
  accountId: "runner",
  revision,
});
beforeEach(() => {
  let tail = Promise.resolve();
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request: (_name: string, action: () => Promise<unknown>) => {
        const next = tail.then(action);
        tail = next.then(
          () => undefined,
          () => undefined
        );
        return next;
      },
    },
  });
  localStorage.clear();
  vi.restoreAllMocks();
  h.reconcile.mockReset();
  resetFirestore();
  h.auth.currentUser = { uid: "runner" };
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  seedFirestore({ [SAVED]: { type: "run" }, [AUTHORITY]: authority() });
  h.reconcile.mockResolvedValue(result());
});
describe("explicit canonical saved-activity linkage", () => {
  it("reads actual server persistence and authority before sending only identity/revision", async () => {
    await expect(
      linkCanonicalActivity("runner", "run1", proof)
    ).resolves.toEqual(result());
    expect(readLog().map(({ path }) => path)).toEqual([SAVED, AUTHORITY]);
    expect(h.reconcile).toHaveBeenCalledWith({
      expectedUid: "runner",
      expectedRevision: 4,
      activityId: "run1",
    });
    expect(JSON.parse(readString(activityLinkKey("runner", "run1"))!)).toEqual({
      expectedUid: "runner",
      expectedRevision: 4,
      activityId: "run1",
    });
  });
  it.each(["missing", "cache", "pending"])(
    "does not equate %s run with server persistence",
    async (kind) => {
      if (kind === "missing") resetFirestore();
      else
        setSnapshotMetadata(SAVED, {
          fromCache: kind === "cache",
          hasPendingWrites: kind === "pending",
        });
      await expect(
        linkCanonicalActivity("runner", "run1", proof)
      ).rejects.toThrow();
      expect(h.reconcile).not.toHaveBeenCalled();
    }
  );
  it("serializes overlapping invocations so a later revision never overwrites the original", async () => {
    let release!: () => void;
    h.reconcile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(result());
        })
    );
    const first = linkCanonicalActivity("runner", "run1", proof);
    const second = linkCanonicalActivity("runner", "run1", proof);
    await vi.waitFor(() => expect(h.reconcile).toHaveBeenCalledTimes(1));
    seedFirestore({ [AUTHORITY]: authority(5) });
    release();
    await Promise.all([first, second]);
    expect(
      h.reconcile.mock.calls.map(([request]) => request.expectedRevision)
    ).toEqual([4, 4]);
  });
  it("fails closed when cross-tab serialization is unavailable", async () => {
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: undefined,
    });
    await expect(
      linkCanonicalActivity("runner", "run1", proof)
    ).rejects.toThrow();
    expect(readLog()).toHaveLength(0);
    expect(h.reconcile).not.toHaveBeenCalled();
  });
  it("retains the exact original revision after an uncertain response, including a new invocation", async () => {
    h.reconcile.mockRejectedValueOnce(Error("response lost"));
    await expect(
      linkCanonicalActivity("runner", "run1", proof)
    ).rejects.toThrow();
    seedFirestore({ [AUTHORITY]: authority(50) });
    h.reconcile.mockResolvedValue({ ...result(), outcome: "replayed" });
    await linkCanonicalActivity("runner", "run1", proof);
    expect(
      h.reconcile.mock.calls.map(([request]) => request.expectedRevision)
    ).toEqual([4, 4]);
    expect(readsAt(AUTHORITY)).toHaveLength(1);
  });
  it.each(["offline", "account", "foreign-proof"])(
    "refuses %s before mutation",
    async (kind) => {
      if (kind === "offline")
        vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
      if (kind === "account") h.auth.currentUser = { uid: "other" };
      await expect(
        linkCanonicalActivity(
          "runner",
          "run1",
          kind === "foreign-proof" ? { ...proof, accountId: "other" } : proof
        )
      ).rejects.toThrow();
      expect(h.reconcile).not.toHaveBeenCalled();
    }
  );
  it("rejects a same-uid new session while server persistence is read", async () => {
    deferReads();
    const pending = linkCanonicalActivity("runner", "run1", proof);
    const rejected = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(pendingReads()).toEqual([SAVED]));
    h.auth.currentUser = { uid: "runner" };
    releaseAllReads();
    resumeReads();
    await rejected;
    expect(h.reconcile).not.toHaveBeenCalled();
  });
  it("does not overwrite an unreadable original retry identity", async () => {
    await linkCanonicalActivity("runner", "run1", proof);
    h.reconcile.mockClear();
    const write = vi.spyOn(Storage.prototype, "setItem");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw Error("storage read failed");
    });
    await expect(
      linkCanonicalActivity("runner", "run1", proof)
    ).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
    expect(h.reconcile).not.toHaveBeenCalled();
  });
  it("cannot send when durable retry storage fails", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw Error("quota");
    });
    await expect(
      linkCanonicalActivity("runner", "run1", proof)
    ).rejects.toThrow();
    expect(h.reconcile).not.toHaveBeenCalled();
  });
  it("preserves malformed prior requests instead of minting another request", async () => {
    writeString(activityLinkKey("runner", "run1"), "bad json");
    await expect(
      linkCanonicalActivity("runner", "run1", proof)
    ).rejects.toThrow();
    expect(readString(activityLinkKey("runner", "run1"))).toBe("bad json");
    expect(h.reconcile).not.toHaveBeenCalled();
  });
  it.each([
    { progressionEligible: true },
    { activityId: "other" },
    { baseRevision: 5 },
    { classification: "completed_exact" },
  ])(
    "rejects incompatible confirmation %j and preserves retry",
    async (change) => {
      h.reconcile.mockResolvedValue({
        ...result(),
        receipt: { ...result().receipt, ...change },
      });
      await expect(
        linkCanonicalActivity("runner", "run1", proof)
      ).rejects.toThrow();
      expect(readString(activityLinkKey("runner", "run1"))).not.toBeNull();
    }
  );
  it("stale reset cannot delete another tab's newer request", async () => {
    writeString(
      activityLinkKey("runner", "run1"),
      JSON.stringify({
        expectedUid: "runner",
        expectedRevision: 5,
        activityId: "run1",
      })
    );
    expect(
      await resetRejectedActivityLink("runner", "run1", {
        details: { errorCode: "revision-conflict" },
        rejectedRequest: {
          expectedUid: "runner",
          expectedRevision: 4,
          activityId: "run1",
        },
      })
    ).toBe(false);
    expect(
      JSON.parse(readString(activityLinkKey("runner", "run1"))!)
        .expectedRevision
    ).toBe(5);
  });
  it("rejects an account-session change while waiting for the browser lock", async () => {
    let enter!: () => Promise<unknown>;
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: (_name: string, action: () => Promise<unknown>) =>
          new Promise((resolve, reject) => {
            enter = async () => {
              try {
                resolve(await action());
              } catch (error) {
                reject(error);
              }
            };
          }),
      },
    });
    const pending = linkCanonicalActivity("runner", "run1", proof);
    const rejected = expect(pending).rejects.toThrow();
    h.auth.currentUser = { uid: "runner" };
    await enter();
    await rejected;
    expect(readLog()).toHaveLength(0);
    expect(h.reconcile).not.toHaveBeenCalled();
  });
  it("clears only an explicitly retried known revision rejection, never uncertain outcomes", async () => {
    await linkCanonicalActivity("runner", "run1", proof);
    expect(
      await resetRejectedActivityLink("runner", "run1", Error("timeout"))
    ).toBe(false);
    expect(readString(activityLinkKey("runner", "run1"))).not.toBeNull();
    expect(
      await resetRejectedActivityLink("runner", "run1", {
        details: { errorCode: "revision-conflict" },
        rejectedRequest: {
          expectedUid: "runner",
          expectedRevision: 4,
          activityId: "run1",
        },
      })
    ).toBe(true);
    expect(readString(activityLinkKey("runner", "run1"))).toBeNull();
  });
});
