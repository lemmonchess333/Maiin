/**
 * R1A-Deletion — kill-switch flag tests.
 *
 * Stress 7 from the Decision 9 grill. The executor MUST honour
 * a Firestore-backed kill-switch (`system/config.deletionExecutorEnabled`)
 * so an operator can halt new deletions post-launch without
 * redeploying the function.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const accountDeletion = require("../../../functions/accountDeletion.js");

const { deleteAccount } = accountDeletion;

/* Stub trio that records calls. Tests check behaviour via the
   public interface — they don't peek at internal state. */
function buildStubs({ configDoc } = {}) {
  const mockEmptySnap = { empty: true, docs: [] };
  const mockBatch = {
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  };

  const firestore = {
    doc: vi.fn((path) => ({
      get: vi.fn().mockResolvedValue({
        exists: configDoc != null && path === "system/config",
        data: () => (path === "system/config" ? configDoc : undefined),
      }),
      delete: vi.fn().mockResolvedValue(undefined),
    })),
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          get: vi.fn().mockResolvedValue(mockEmptySnap),
        })),
        delete: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue({ exists: false, data: () => undefined }),
      })),
      where: vi.fn(() => ({ get: vi.fn().mockResolvedValue(mockEmptySnap) })),
    })),
    batch: vi.fn(() => mockBatch),
  };

  const auth = {
    deleteUser: vi.fn().mockResolvedValue(undefined),
  };

  const storage = {
    deleteFiles: vi.fn().mockResolvedValue(undefined),
  };

  return { firestore, auth, storage };
}

describe("deleteAccount — kill-switch (Stress 7)", () => {
  const UID = "u-test-kill-switch";
  const silentLogger = { warn: () => {}, error: () => {}, info: () => {} };

  it("throws 'executor-disabled' when system/config.deletionExecutorEnabled === false", async () => {
    const { firestore, auth, storage } = buildStubs({
      configDoc: { deletionExecutorEnabled: false },
    });

    await expect(
      deleteAccount({
        firestore,
        auth,
        storageBucket: storage,
        uid: UID,
        logger: silentLogger,
      }),
    ).rejects.toThrow("executor-disabled");
  });

  it("proceeds with deletion when kill-switch is true", async () => {
    const { firestore, auth, storage } = buildStubs({
      configDoc: { deletionExecutorEnabled: true },
    });

    await deleteAccount({
      firestore,
      auth,
      storageBucket: storage,
      uid: UID,
      logger: silentLogger,
    });

    /* The final step of the executor is auth.deleteUser. If it ran,
       the executor passed through the kill-switch gate AND completed
       the full step sequence. */
    expect(auth.deleteUser).toHaveBeenCalledWith(UID);
  });

  it("proceeds when system/config doc is MISSING (defensive default: ENABLED)", async () => {
    /* Lock-out defence: operator forgetting to provision the config
       doc must NOT permanently disable deletion. configDoc undefined
       → doc.exists = false → executor proceeds. */
    const { firestore, auth, storage } = buildStubs({ configDoc: undefined });

    await deleteAccount({
      firestore,
      auth,
      storageBucket: storage,
      uid: UID,
      logger: silentLogger,
    });

    expect(auth.deleteUser).toHaveBeenCalledWith(UID);
  });

  it("proceeds when deletionExecutorEnabled FIELD is missing (default ENABLED)", async () => {
    /* Same lock-out defence: doc exists with other fields but
       the deletion-enabled field was never set. Treat as enabled,
       not disabled. Strict equality with `=== false` in the impl
       means undefined / null / missing all pass through. */
    const { firestore, auth, storage } = buildStubs({
      configDoc: { someOtherField: "value" },
    });

    await deleteAccount({
      firestore,
      auth,
      storageBucket: storage,
      uid: UID,
      logger: silentLogger,
    });

    expect(auth.deleteUser).toHaveBeenCalledWith(UID);
  });

  it("does not delete the Auth user when kill-switch is false", async () => {
    /* Behavioural assertion: the kill-switch must abort BEFORE the
       final auth.deleteUser step, not after. Otherwise the kill-
       switch would still complete Firestore cleanup while only
       preserving the Auth user — partial-deletion is worse than
       no deletion. */
    const { firestore, auth, storage } = buildStubs({
      configDoc: { deletionExecutorEnabled: false },
    });

    await deleteAccount({
      firestore,
      auth,
      storageBucket: storage,
      uid: UID,
      logger: silentLogger,
    }).catch(() => {
      /* expected throw — assertion is about side effects */
    });

    expect(auth.deleteUser).not.toHaveBeenCalled();
  });
});
