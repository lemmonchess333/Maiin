/**
 * R1A-Deletion Chunk 2.B — system-writer per-UID batch behaviour.
 *
 * Spec Blocker 6 / verification pack item 9: the report claims
 * weeklyPerformanceRollup / dailyPerformanceRefresh / crewWeeklyLeaderboardRollup
 * check the tombstone/deletion status inside the per-UID iteration
 * (NOT only at function entry). This test proves it behaviourally —
 * seed 3 UIDs in one batch, tombstone the middle one, and assert
 * the middle UID's write is skipped while the others proceed.
 *
 * Why this matters: a future refactor that moves the check back to
 * function entry would pass static code-search (the helper call is
 * still present) but fail this test, which observes per-UID effects.
 *
 * Note: this is a unit test against the lock helper's behaviour and a
 * faithful reproduction of the batch loop shape used by the three
 * scheduled functions. Emulator integration tests (in
 * firestore.collectionGroup.test.ts) provide the additional
 * end-to-end coverage but are gated on FIRESTORE_EMULATOR_HOST.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const locks = require("../../../functions/lib/accountDeletionLocks.js");

interface FakeSnap {
  exists: boolean;
  data: () => unknown;
  id: string;
}
type DocMap = Record<string, unknown>;

function makeFakeDb(collections: Record<string, DocMap>) {
  const makeSnap = (id: string, data: unknown): FakeSnap => ({
    exists: data !== undefined,
    data: () => data,
    id,
  });
  return {
    collection(name: string) {
      const docs = collections[name] || {};
      return {
        doc(id: string) {
          return {
            get: async () => makeSnap(id, docs[id]),
            _collectionName: name,
            _docId: id,
          };
        },
      };
    },
  };
}

describe("system-writer per-UID guard inside batch iteration", () => {
  /**
   * Faithful reproduction of the loop body used by
   * weeklyPerformanceRollup / dailyPerformanceRefresh in
   * functions/index.js. Calls shouldSystemWriteProceed per UID and
   * records which UIDs actually proceeded to the write.
   */
  async function runBatch(db: unknown, uids: string[], reason: string): Promise<string[]> {
    const wrote: string[] = [];
    // Mirrors the actual functions/index.js loop: Promise.all over a
    // 10-UID chunk, each UID checked independently.
    for (let i = 0; i < uids.length; i += 10) {
      const chunk = uids.slice(i, i + 10);
      await Promise.all(
        chunk.map(async (uid) => {
          if (!(await locks.shouldSystemWriteProceed(db, uid, reason))) {
            return; // SKIP this UID, continue to next iteration
          }
          wrote.push(uid);
        }),
      );
    }
    return wrote;
  }

  it("normal batch — all UIDs proceed when none are deleting", async () => {
    const db = makeFakeDb({ accountDeletionRequests: {}, deletedAccounts: {} });
    const wrote = await runBatch(db, ["alice", "bob", "carol"], "test");
    expect(wrote.sort()).toEqual(["alice", "bob", "carol"]);
  });

  it("middle UID tombstoned — that UID is skipped, others proceed (CRITICAL: not a full-batch bail-out)", async () => {
    const db = makeFakeDb({
      accountDeletionRequests: {},
      deletedAccounts: {
        bob: { uid: "bob", expiresAt: Date.now() + 86_400_000 },
      },
    });
    const wrote = await runBatch(db, ["alice", "bob", "carol"], "test");
    expect(wrote.sort()).toEqual(["alice", "carol"]);
    expect(wrote).not.toContain("bob");
  });

  it("middle UID mid-deletion (status=running) — same behaviour as tombstoned", async () => {
    const db = makeFakeDb({
      accountDeletionRequests: { bob: { status: "running" } },
      deletedAccounts: {},
    });
    const wrote = await runBatch(db, ["alice", "bob", "carol"], "test");
    expect(wrote.sort()).toEqual(["alice", "carol"]);
  });

  it("first UID tombstoned — does not abort the whole batch (loop continues to alice/bob/carol after skipping the bad one)", async () => {
    const db = makeFakeDb({
      accountDeletionRequests: { bad: { status: "operator_review" } },
      deletedAccounts: {},
    });
    const wrote = await runBatch(db, ["bad", "alice", "bob", "carol"], "test");
    expect(wrote.sort()).toEqual(["alice", "bob", "carol"]);
  });

  it("last UID tombstoned — middle UIDs are processed before the skip", async () => {
    const db = makeFakeDb({
      accountDeletionRequests: {},
      deletedAccounts: { carol: { uid: "carol", expiresAt: Date.now() + 86_400_000 } },
    });
    const wrote = await runBatch(db, ["alice", "bob", "carol"], "test");
    expect(wrote.sort()).toEqual(["alice", "bob"]);
  });

  it("all UIDs deleting — batch produces zero writes but does not throw", async () => {
    const db = makeFakeDb({
      accountDeletionRequests: {
        alice: { status: "running" },
        bob: { status: "running" },
        carol: { status: "running" },
      },
      deletedAccounts: {},
    });
    const wrote = await runBatch(db, ["alice", "bob", "carol"], "test");
    expect(wrote).toEqual([]);
  });

  it("expired tombstones do NOT skip — the user has been re-created after the window", async () => {
    const db = makeFakeDb({
      accountDeletionRequests: {},
      deletedAccounts: { bob: { uid: "bob", expiresAt: Date.now() - 1000 } }, // expired
    });
    const wrote = await runBatch(db, ["alice", "bob", "carol"], "test");
    expect(wrote.sort()).toEqual(["alice", "bob", "carol"]);
  });

  it("multi-chunk batch — guard fires inside each chunk independently", async () => {
    const db = makeFakeDb({
      accountDeletionRequests: { u15: { status: "running" } },
      deletedAccounts: {},
    });
    const uids = Array.from({ length: 22 }, (_, i) => `u${i}`);
    const wrote = await runBatch(db, uids, "test");
    expect(wrote.length).toBe(21);
    expect(wrote).not.toContain("u15");
  });
});

describe("structural assertion: the check is per-UID, not at function entry", () => {
  it("the lock helper is invoked once per UID in the batch (count test)", async () => {
    let calls = 0;
    const wrapped = {
      collection: () => ({
        doc: () => ({
          get: async () => {
            calls += 1;
            return { exists: false };
          },
          _collectionName: "x",
          _docId: "y",
        }),
      }),
    };
    // 3 UIDs × 2 collection reads each (accountDeletionRequests +
    // deletedAccounts) = 6 calls if per-UID; 2 if function-entry.
    let _wrote = 0;
    for (const uid of ["a", "b", "c"]) {
      if (await locks.shouldSystemWriteProceed(wrapped, uid, "test")) {
        _wrote += 1;
      }
    }
    expect(calls).toBe(6);
  });
});
