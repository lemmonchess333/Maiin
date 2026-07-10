/**
 * R1A-Deletion Chunk 3 — lease + state-machine ledger tests.
 *
 * Pins the transactional lease acquisition, generation-based split-brain
 * protection, and STATE_GRAPH-validated status transitions that engage the
 * firestore.rules write-freeze during account deletion (money-path audit F2 —
 * the executor previously never set accountDeletionRequests.status so the
 * freeze never engaged and a concurrent client write could orphan/resurrect
 * the user doc).
 *
 * Uses a tiny in-memory Firestore stub (collection/doc/get + runTransaction)
 * so the transactional bodies are exercised without booting firebase-admin.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ledger = require("../lib/accountDeletionLedger");
const { STATUS } = ledger;

const UID = "user-xyz";

/** In-memory Firestore: single flat store keyed by `collection/id`. */
function makeFirestore(initialDocs = {}) {
  const store = { ...initialDocs };
  const docRef = (collectionName, id) => ({ _key: `${collectionName}/${id}` });
  return {
    _store: store,
    collection(name) {
      return {
        doc: (id) => {
          const ref = docRef(name, id);
          return {
            ...ref,
            get: async () => ({
              exists: store[ref._key] !== undefined,
              data: () => store[ref._key],
            }),
          };
        },
      };
    },
    async runTransaction(cb) {
      const tx = {
        get: async (ref) => ({
          exists: store[ref._key] !== undefined,
          data: () => store[ref._key],
        }),
        set: (ref, data, opts) => {
          store[ref._key] =
            opts && opts.merge
              ? { ...(store[ref._key] || {}), ...data }
              : { ...data };
        },
      };
      return cb(tx);
    },
  };
}

const fixedIds = {
  generateOperationId: () => "op-1",
  generateSupportCodeFn: () => "DL-ABCDEF",
};

describe("acquireLease", () => {
  it("creates a fresh running lease (gen 1) and engages the freeze", async () => {
    const db = makeFirestore();
    const res = await ledger.acquireLease({
      firestore: db,
      uid: UID,
      leaseOwner: "exec-A",
      now: 1000,
      ...fixedIds,
    });
    expect(res).toMatchObject({
      acquired: true,
      generation: 1,
      status: "running",
    });
    const doc = db._store[`accountDeletionRequests/${UID}`];
    expect(doc.status).toBe(STATUS.RUNNING); // in firestore.rules isDeleting set
    expect(doc.leaseOwner).toBe("exec-A");
    expect(doc.leaseGeneration).toBe(1);
    expect(doc.attemptCount).toBe(1);
    expect(doc.startedAt).toBe(1000);
    expect(doc.leaseExpiresAt).toBe(1000 + ledger.LEASE_DURATION_MS);
    expect(doc.operationId).toBe("op-1");
  });

  it("REFUSES when a non-expired lease is held by a different owner", async () => {
    const db = makeFirestore({
      [`accountDeletionRequests/${UID}`]: {
        uid: UID,
        status: STATUS.RUNNING,
        leaseOwner: "exec-A",
        leaseGeneration: 1,
        leaseExpiresAt: 5000,
      },
    });
    const res = await ledger.acquireLease({
      firestore: db,
      uid: UID,
      leaseOwner: "exec-B",
      now: 4000, // before 5000 expiry
      ...fixedIds,
    });
    expect(res.acquired).toBe(false);
    expect(res.reason).toBe("leased");
    // Doc untouched — still owned by exec-A.
    expect(db._store[`accountDeletionRequests/${UID}`].leaseOwner).toBe(
      "exec-A"
    );
  });

  it("TAKES OVER an expired lease, bumping the generation (split-brain guard)", async () => {
    const db = makeFirestore({
      [`accountDeletionRequests/${UID}`]: {
        uid: UID,
        status: STATUS.RUNNING,
        leaseOwner: "exec-A",
        leaseGeneration: 3,
        leaseExpiresAt: 5000,
        attemptCount: 3,
      },
    });
    const res = await ledger.acquireLease({
      firestore: db,
      uid: UID,
      leaseOwner: "exec-B",
      now: 6000, // after 5000 expiry
      ...fixedIds,
    });
    expect(res).toMatchObject({
      acquired: true,
      generation: 4,
      status: "running",
    });
    const doc = db._store[`accountDeletionRequests/${UID}`];
    expect(doc.leaseOwner).toBe("exec-B");
    expect(doc.leaseGeneration).toBe(4);
    expect(doc.attemptCount).toBe(4);
  });

  it("re-initialises a TERMINAL (completed) record as a fresh operation", async () => {
    const db = makeFirestore({
      [`accountDeletionRequests/${UID}`]: {
        uid: UID,
        status: STATUS.COMPLETED,
        leaseGeneration: 9,
      },
    });
    const res = await ledger.acquireLease({
      firestore: db,
      uid: UID,
      leaseOwner: "exec-A",
      now: 1000,
      ...fixedIds,
    });
    expect(res).toMatchObject({
      acquired: true,
      generation: 1,
      status: "running",
    });
  });

  it("takes over a failed_cleanup op via a valid failed_cleanup→running transition", async () => {
    const db = makeFirestore({
      [`accountDeletionRequests/${UID}`]: {
        uid: UID,
        status: STATUS.FAILED_CLEANUP,
        leaseOwner: "exec-A",
        leaseGeneration: 2,
        leaseExpiresAt: 100, // expired
      },
    });
    const res = await ledger.acquireLease({
      firestore: db,
      uid: UID,
      leaseOwner: "exec-B",
      now: 6000,
      ...fixedIds,
    });
    expect(res).toMatchObject({
      acquired: true,
      generation: 3,
      status: "running",
    });
    expect(db._store[`accountDeletionRequests/${UID}`].status).toBe(
      STATUS.RUNNING
    );
  });
});

describe("transitionStatus", () => {
  function runningDoc(gen = 1) {
    return {
      [`accountDeletionRequests/${UID}`]: {
        uid: UID,
        status: STATUS.RUNNING,
        leaseGeneration: gen,
      },
    };
  }

  it("moves running→completed with matching generation + TTL fields", async () => {
    const db = makeFirestore(runningDoc(1));
    const res = await ledger.transitionStatus({
      firestore: db,
      uid: UID,
      toStatus: STATUS.COMPLETED,
      expectedGeneration: 1,
      extraFields: {
        completedAt: 2000,
        cleanupAfter: 2000 + ledger.LEDGER_RETENTION_MS,
      },
      now: 2000,
    });
    expect(res.transitioned).toBe(true);
    const doc = db._store[`accountDeletionRequests/${UID}`];
    expect(doc.status).toBe(STATUS.COMPLETED);
    expect(doc.completedAt).toBe(2000);
  });

  it("is a no-op when the generation was superseded (a takeover happened)", async () => {
    const db = makeFirestore(runningDoc(5));
    const res = await ledger.transitionStatus({
      firestore: db,
      uid: UID,
      toStatus: STATUS.COMPLETED,
      expectedGeneration: 4, // stale
      now: 2000,
    });
    expect(res.transitioned).toBe(false);
    expect(res.reason).toBe("superseded");
    // Status unchanged — the taker owns the state.
    expect(db._store[`accountDeletionRequests/${UID}`].status).toBe(
      STATUS.RUNNING
    );
  });

  it("moves running→failed_cleanup with a failedStage", async () => {
    const db = makeFirestore(runningDoc(1));
    const res = await ledger.transitionStatus({
      firestore: db,
      uid: UID,
      toStatus: STATUS.FAILED_CLEANUP,
      expectedGeneration: 1,
      extraFields: { failedStage: "user_document", lastErrorCode: "unknown" },
      now: 2000,
    });
    expect(res.transitioned).toBe(true);
    expect(db._store[`accountDeletionRequests/${UID}`].status).toBe(
      STATUS.FAILED_CLEANUP
    );
  });

  it("throws on a disallowed transition (completed→running)", async () => {
    const db = makeFirestore({
      [`accountDeletionRequests/${UID}`]: {
        uid: UID,
        status: STATUS.COMPLETED,
        leaseGeneration: 1,
      },
    });
    await expect(
      ledger.transitionStatus({
        firestore: db,
        uid: UID,
        toStatus: STATUS.RUNNING,
        expectedGeneration: 1,
        now: 2000,
      })
    ).rejects.toThrow(/disallowed transition/);
  });

  it("rejects a forbidden (non-minimised) field", async () => {
    const db = makeFirestore(runningDoc(1));
    await expect(
      ledger.transitionStatus({
        firestore: db,
        uid: UID,
        toStatus: STATUS.COMPLETED,
        expectedGeneration: 1,
        extraFields: { email: "leaked@example.com" }, // not in ALLOWED_FIELDS
        now: 2000,
      })
    ).rejects.toThrow(/forbidden field/);
  });
});

describe("verifyLeaseGeneration", () => {
  it("is true for a matching generation, false otherwise", async () => {
    const db = makeFirestore({
      [`accountDeletionRequests/${UID}`]: { uid: UID, leaseGeneration: 7 },
    });
    expect(
      await ledger.verifyLeaseGeneration({
        firestore: db,
        uid: UID,
        expectedGeneration: 7,
      })
    ).toBe(true);
    expect(
      await ledger.verifyLeaseGeneration({
        firestore: db,
        uid: UID,
        expectedGeneration: 6,
      })
    ).toBe(false);
  });

  it("is false when the ledger doc is absent", async () => {
    const db = makeFirestore();
    expect(
      await ledger.verifyLeaseGeneration({
        firestore: db,
        uid: UID,
        expectedGeneration: 1,
      })
    ).toBe(false);
  });
});

describe("renewLease", () => {
  it("extends the lease for the current owner+generation", async () => {
    const db = makeFirestore({
      [`accountDeletionRequests/${UID}`]: {
        uid: UID,
        status: STATUS.RUNNING,
        leaseOwner: "exec-A",
        leaseGeneration: 2,
        leaseExpiresAt: 1000,
      },
    });
    const res = await ledger.renewLease({
      firestore: db,
      uid: UID,
      leaseOwner: "exec-A",
      expectedGeneration: 2,
      now: 900,
    });
    expect(res.renewed).toBe(true);
    expect(db._store[`accountDeletionRequests/${UID}`].leaseExpiresAt).toBe(
      900 + ledger.LEASE_DURATION_MS
    );
  });

  it("does not renew when superseded", async () => {
    const db = makeFirestore({
      [`accountDeletionRequests/${UID}`]: {
        uid: UID,
        leaseOwner: "exec-A",
        leaseGeneration: 5,
        leaseExpiresAt: 1000,
      },
    });
    const res = await ledger.renewLease({
      firestore: db,
      uid: UID,
      leaseOwner: "exec-A",
      expectedGeneration: 4, // stale
      now: 900,
    });
    expect(res.renewed).toBe(false);
    expect(res.reason).toBe("superseded");
  });
});

describe("getDeletionStatus", () => {
  it("returns the doc, or null when absent", async () => {
    const db = makeFirestore({
      [`accountDeletionRequests/${UID}`]: { uid: UID, status: STATUS.RUNNING },
    });
    expect(
      (await ledger.getDeletionStatus({ firestore: db, uid: UID })).status
    ).toBe(STATUS.RUNNING);
    expect(
      await ledger.getDeletionStatus({ firestore: db, uid: "nobody" })
    ).toBeNull();
  });
});
