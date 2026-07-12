/**
 * R1A-Deletion Chunk 2 — status / tombstone helper tests.
 *
 * Pure predicates are tested directly. Firestore-reading helpers are
 * tested against a hand-rolled fake `db` shape that matches the Admin
 * SDK methods we use (collection().doc().get() and db.getAll()). This
 * avoids needing the emulator for the unit-test layer; emulator
 * integration tests in Chunk 2 emulator-feasibility files exercise
 * the real Firestore behaviour.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const status = require("../../../functions/lib/accountDeletionStatus.js");
const ledger = require("../../../functions/lib/accountDeletionLedger.js");

const {
  ACTIVE_DELETION_STATUSES,
  MAX_REFERENCED_UIDS_PER_CALL,
  ERROR_CODES,
  isStatusActive,
  isTombstoneLive,
  makeAccountDeletingError,
  makeAccountDeletedError,
  makeReferencedAccountDeletingError,
  makeReferencedAccountDeletedError,
  makeTooManyReferencesError,
  makeSystemWriteBlockedError,
  isAccountDeleting,
  isTombstoned,
  assertAccountNotDeleting,
  assertNoReferencedAccountsDeleting,
  assertUserWritableBySystem,
} = status;

/* ── Pure predicate tests ──────────────────────────────────────────── */

describe("isStatusActive", () => {
  it("returns true for every active-deletion status", () => {
    expect(isStatusActive("running")).toBe(true);
    expect(isStatusActive("failed_cleanup")).toBe(true);
    expect(isStatusActive("pending_cleanup")).toBe(true);
    expect(isStatusActive("pending_auth_deletion")).toBe(true);
    expect(isStatusActive("operator_review")).toBe(true);
  });

  it("returns false for non-active statuses (requested / completed / cancelled)", () => {
    expect(isStatusActive("requested")).toBe(false);
    expect(isStatusActive("completed")).toBe(false);
    expect(isStatusActive("cancelled")).toBe(false);
  });

  it("returns false for null / undefined / unknown / empty string", () => {
    expect(isStatusActive(null)).toBe(false);
    expect(isStatusActive(undefined)).toBe(false);
    expect(isStatusActive("")).toBe(false);
    expect(isStatusActive("garbage_status")).toBe(false);
  });

  it("ACTIVE_DELETION_STATUSES matches the spec's active set exactly", () => {
    expect([...ACTIVE_DELETION_STATUSES].sort()).toEqual([
      "failed_cleanup",
      "operator_review",
      "pending_auth_deletion",
      "pending_cleanup",
      "running",
    ]);
  });

  it("requested status is NOT active — lock acquisition hasn't happened yet", () => {
    expect(ACTIVE_DELETION_STATUSES).not.toContain(ledger.STATUS.REQUESTED);
  });
});

describe("isTombstoneLive", () => {
  const fixedNow = 1_700_000_000_000; // ms

  it("returns false for null / undefined / missing doc", () => {
    expect(isTombstoneLive(null, fixedNow)).toBe(false);
    expect(isTombstoneLive(undefined, fixedNow)).toBe(false);
  });

  it("returns true for a tombstone with no expiresAt (defensive: missing TTL = live)", () => {
    expect(isTombstoneLive({ uid: "x", deletedAt: 1 }, fixedNow)).toBe(true);
  });

  it("returns true when expiresAt is in the future (numeric ms)", () => {
    expect(isTombstoneLive({ expiresAt: fixedNow + 1000 }, fixedNow)).toBe(
      true
    );
  });

  it("returns false when expiresAt is in the past (numeric ms)", () => {
    expect(isTombstoneLive({ expiresAt: fixedNow - 1000 }, fixedNow)).toBe(
      false
    );
  });

  it("returns true for a Firestore Timestamp-shaped expiresAt in future", () => {
    const tsLike = { toMillis: () => fixedNow + 1000 };
    expect(isTombstoneLive({ expiresAt: tsLike }, fixedNow)).toBe(true);
  });

  it("returns false for a Firestore Timestamp-shaped expiresAt in past", () => {
    const tsLike = { toMillis: () => fixedNow - 1000 };
    expect(isTombstoneLive({ expiresAt: tsLike }, fixedNow)).toBe(false);
  });

  it("returns true at the exact boundary (expiresAt > now is the live condition)", () => {
    expect(isTombstoneLive({ expiresAt: fixedNow }, fixedNow)).toBe(false);
    expect(isTombstoneLive({ expiresAt: fixedNow + 1 }, fixedNow)).toBe(true);
  });

  it("handles ISO-string expiresAt", () => {
    const future = new Date(fixedNow + 1000).toISOString();
    const past = new Date(fixedNow - 1000).toISOString();
    expect(isTombstoneLive({ expiresAt: future }, fixedNow)).toBe(true);
    expect(isTombstoneLive({ expiresAt: past }, fixedNow)).toBe(false);
  });
});

/* ── Error factories ──────────────────────────────────────────────── */

describe("error factories carry stable error codes", () => {
  it("makeAccountDeletingError shape", () => {
    const err = makeAccountDeletingError("alice");
    expect(err.code).toBe("failed-precondition");
    expect(err.errorCode).toBe(ERROR_CODES.ACCOUNT_DELETING);
    expect(err.uid).toBe("alice");
    expect(err.message).toContain("alice");
  });

  it("makeReferencedAccountDeletingError shape", () => {
    const err = makeReferencedAccountDeletingError("bob");
    expect(err.code).toBe("failed-precondition");
    expect(err.errorCode).toBe(ERROR_CODES.REFERENCED_ACCOUNT_DELETING);
    expect(err.referencedUid).toBe("bob");
  });

  it("makeTooManyReferencesError shape", () => {
    const err = makeTooManyReferencesError(42);
    expect(err.code).toBe("invalid-argument");
    expect(err.errorCode).toBe(ERROR_CODES.TOO_MANY_REFERENCES);
    expect(err.message).toContain("42");
    expect(err.message).toContain(String(MAX_REFERENCED_UIDS_PER_CALL));
  });

  it("makeSystemWriteBlockedError shape", () => {
    const err = makeSystemWriteBlockedError("charlie");
    expect(err.code).toBe("failed-precondition");
    expect(err.errorCode).toBe(ERROR_CODES.SYSTEM_WRITE_BLOCKED);
    expect(err.uid).toBe("charlie");
  });
});

/* ── Firestore-reading helpers (against fake db) ──────────────────── */

interface FakeDoc {
  exists: boolean;
  data: () => unknown;
  id: string;
}
type DocMap = Record<string, unknown>;

/**
 * Build a hand-rolled fake Admin SDK Firestore that responds to the
 * read methods accountDeletionStatus.js calls: collection().doc().get()
 * and db.getAll(...refs).
 */
function makeFakeDb(collections: Record<string, DocMap>) {
  const makeSnap = (id: string, data: unknown): FakeDoc => ({
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
            // expose path-ish info so getAll can locate them
            _collectionName: name,
            _docId: id,
          };
        },
      };
    },
    async getAll(...refs: { _collectionName: string; _docId: string }[]) {
      return refs.map((r) => {
        const docs = collections[r._collectionName] || {};
        return makeSnap(r._docId, docs[r._docId]);
      });
    },
  };
}

describe("isAccountDeleting against fake db", () => {
  it("returns true when status is running", async () => {
    const db = makeFakeDb({
      accountDeletionRequests: { alice: { status: "running" } },
    });
    expect(await isAccountDeleting(db, "alice")).toBe(true);
  });

  it("returns false when doc is missing", async () => {
    const db = makeFakeDb({ accountDeletionRequests: {} });
    expect(await isAccountDeleting(db, "alice")).toBe(false);
  });

  it("returns false when status is completed", async () => {
    const db = makeFakeDb({
      accountDeletionRequests: { alice: { status: "completed" } },
    });
    expect(await isAccountDeleting(db, "alice")).toBe(false);
  });

  it("returns false for empty uid", async () => {
    const db = makeFakeDb({});
    expect(await isAccountDeleting(db, "")).toBe(false);
  });
});

describe("isTombstoned against fake db", () => {
  const futureMs = Date.now() + 86_400_000;
  const pastMs = Date.now() - 86_400_000;

  it("returns true when tombstone exists and is live", async () => {
    const db = makeFakeDb({
      deletedAccounts: { alice: { uid: "alice", expiresAt: futureMs } },
    });
    expect(await isTombstoned(db, "alice")).toBe(true);
  });

  it("returns false when tombstone exists but is expired", async () => {
    const db = makeFakeDb({
      deletedAccounts: { alice: { uid: "alice", expiresAt: pastMs } },
    });
    expect(await isTombstoned(db, "alice")).toBe(false);
  });

  it("returns false when tombstone is missing", async () => {
    const db = makeFakeDb({ deletedAccounts: {} });
    expect(await isTombstoned(db, "alice")).toBe(false);
  });
});

describe("makeAccountDeletedError / makeReferencedAccountDeletedError", () => {
  it("makeAccountDeletedError has a stable callable shape", () => {
    const err = makeAccountDeletedError("alice");
    expect(err.code).toBe("failed-precondition");
    expect(err.errorCode).toBe(ERROR_CODES.ACCOUNT_DELETED);
    expect(err.uid).toBe("alice");
  });

  it("makeReferencedAccountDeletedError has a stable callable shape", () => {
    const err = makeReferencedAccountDeletedError("bob");
    expect(err.code).toBe("failed-precondition");
    expect(err.errorCode).toBe(ERROR_CODES.REFERENCED_ACCOUNT_DELETED);
    expect(err.referencedUid).toBe("bob");
  });

  it("ACCOUNT_DELETED and ACCOUNT_DELETING are distinct stable codes", () => {
    expect(ERROR_CODES.ACCOUNT_DELETED).toBe("account-deleted");
    expect(ERROR_CODES.ACCOUNT_DELETING).toBe("account-deleting");
    expect(ERROR_CODES.ACCOUNT_DELETED).not.toBe(ERROR_CODES.ACCOUNT_DELETING);
  });
});

describe("assertAccountNotDeleting", () => {
  it("throws ACCOUNT_DELETING when uid is deleting", async () => {
    const db = makeFakeDb({
      accountDeletionRequests: { alice: { status: "running" } },
    });
    await expect(assertAccountNotDeleting(db, "alice")).rejects.toMatchObject({
      errorCode: ERROR_CODES.ACCOUNT_DELETING,
      uid: "alice",
    });
  });

  it("does not throw when uid is not deleting", async () => {
    const db = makeFakeDb({ accountDeletionRequests: {} });
    await expect(
      assertAccountNotDeleting(db, "alice")
    ).resolves.toBeUndefined();
  });

  it("throws ACCOUNT_DELETED for a live tombstone after deletion completed", async () => {
    // The window this whole packet closes: deletion has completed
    // (status non-active) but a live tombstone remains and an
    // already-issued token can still authenticate.
    const db = makeFakeDb({
      accountDeletionRequests: { alice: { status: "completed" } },
      deletedAccounts: {
        alice: { uid: "alice", expiresAt: Date.now() + 86_400_000 },
      },
    });
    await expect(assertAccountNotDeleting(db, "alice")).rejects.toMatchObject({
      errorCode: ERROR_CODES.ACCOUNT_DELETED,
      uid: "alice",
    });
  });

  it("allows an expired tombstone (TTL has physically passed)", async () => {
    const db = makeFakeDb({
      accountDeletionRequests: { alice: { status: "completed" } },
      deletedAccounts: {
        alice: { uid: "alice", expiresAt: Date.now() - 1 },
      },
    });
    await expect(
      assertAccountNotDeleting(db, "alice")
    ).resolves.toBeUndefined();
  });

  it("prefers ACCOUNT_DELETING over ACCOUNT_DELETED when both hold", async () => {
    // Active deletion is checked first — an account mid-cascade that
    // somehow also has a tombstone reports the in-progress state.
    const db = makeFakeDb({
      accountDeletionRequests: { alice: { status: "running" } },
      deletedAccounts: {
        alice: { uid: "alice", expiresAt: Date.now() + 86_400_000 },
      },
    });
    await expect(assertAccountNotDeleting(db, "alice")).rejects.toMatchObject({
      errorCode: ERROR_CODES.ACCOUNT_DELETING,
    });
  });
});

describe("assertNoReferencedAccountsDeleting", () => {
  it("does not throw when no referenced uids are deleting", async () => {
    const db = makeFakeDb({ accountDeletionRequests: {} });
    await expect(
      assertNoReferencedAccountsDeleting(db, ["alice", "bob"])
    ).resolves.toBeUndefined();
  });

  it("throws REFERENCED_ACCOUNT_DELETING when one referenced uid is deleting", async () => {
    const db = makeFakeDb({
      accountDeletionRequests: { bob: { status: "running" } },
    });
    await expect(
      assertNoReferencedAccountsDeleting(db, ["alice", "bob", "carol"])
    ).rejects.toMatchObject({
      errorCode: ERROR_CODES.REFERENCED_ACCOUNT_DELETING,
      referencedUid: "bob",
    });
  });

  it("does not throw on a completed-but-not-tombstoned referenced uid", async () => {
    const db = makeFakeDb({
      accountDeletionRequests: { bob: { status: "completed" } },
    });
    await expect(
      assertNoReferencedAccountsDeleting(db, ["alice", "bob"])
    ).resolves.toBeUndefined();
  });

  it("throws REFERENCED_ACCOUNT_DELETED when a referenced uid has a live tombstone", async () => {
    const db = makeFakeDb({
      accountDeletionRequests: { bob: { status: "completed" } },
      deletedAccounts: {
        bob: { uid: "bob", expiresAt: Date.now() + 86_400_000 },
      },
    });
    await expect(
      assertNoReferencedAccountsDeleting(db, ["alice", "bob", "carol"])
    ).rejects.toMatchObject({
      errorCode: ERROR_CODES.REFERENCED_ACCOUNT_DELETED,
      referencedUid: "bob",
    });
  });

  it("prefers REFERENCED_ACCOUNT_DELETING over _DELETED when both hold", async () => {
    const db = makeFakeDb({
      accountDeletionRequests: { bob: { status: "running" } },
      deletedAccounts: {
        bob: { uid: "bob", expiresAt: Date.now() + 86_400_000 },
      },
    });
    await expect(
      assertNoReferencedAccountsDeleting(db, ["alice", "bob"])
    ).rejects.toMatchObject({
      errorCode: ERROR_CODES.REFERENCED_ACCOUNT_DELETING,
    });
  });

  it("de-duplicates input list before counting toward the cap", async () => {
    const db = makeFakeDb({ accountDeletionRequests: {} });
    const dupes = Array(50).fill("alice");
    await expect(
      assertNoReferencedAccountsDeleting(db, dupes)
    ).resolves.toBeUndefined();
  });

  it("filters falsy/empty uids", async () => {
    const db = makeFakeDb({ accountDeletionRequests: {} });
    await expect(
      assertNoReferencedAccountsDeleting(db, [
        "alice",
        "",
        null as unknown as string,
        undefined as unknown as string,
      ])
    ).resolves.toBeUndefined();
  });

  it("throws TOO_MANY_REFERENCES when unique uid count exceeds the cap", async () => {
    const db = makeFakeDb({ accountDeletionRequests: {} });
    const many = Array.from(
      { length: MAX_REFERENCED_UIDS_PER_CALL + 1 },
      (_, i) => `uid-${i}`
    );
    await expect(
      assertNoReferencedAccountsDeleting(db, many)
    ).rejects.toMatchObject({
      errorCode: ERROR_CODES.TOO_MANY_REFERENCES,
    });
  });

  it("returns immediately on empty input (no Firestore reads)", async () => {
    let getAllCalls = 0;
    const db = {
      collection: () => ({
        doc: () => ({ _collectionName: "x", _docId: "y" }),
      }),
      getAll: async () => {
        getAllCalls += 1;
        return [];
      },
    };
    await assertNoReferencedAccountsDeleting(db, []);
    expect(getAllCalls).toBe(0);
  });
});

describe("assertUserWritableBySystem", () => {
  it("does not throw for a normal uid (no deletion, no tombstone)", async () => {
    const db = makeFakeDb({ accountDeletionRequests: {}, deletedAccounts: {} });
    await expect(
      assertUserWritableBySystem(db, "alice", "webhook")
    ).resolves.toBeUndefined();
  });

  it("throws SYSTEM_WRITE_BLOCKED with kind=active-deletion when deletion is in progress", async () => {
    const db = makeFakeDb({
      accountDeletionRequests: { alice: { status: "running" } },
      deletedAccounts: {},
    });
    await expect(
      assertUserWritableBySystem(db, "alice", "appleIAPWebhook")
    ).rejects.toMatchObject({
      errorCode: ERROR_CODES.SYSTEM_WRITE_BLOCKED,
      kind: "active-deletion",
      uid: "alice",
      reason: "appleIAPWebhook",
    });
  });

  it("throws SYSTEM_WRITE_BLOCKED with kind=tombstone when uid is tombstoned", async () => {
    const futureMs = Date.now() + 86_400_000;
    const db = makeFakeDb({
      accountDeletionRequests: {},
      deletedAccounts: { alice: { uid: "alice", expiresAt: futureMs } },
    });
    await expect(
      assertUserWritableBySystem(db, "alice", "stripeWebhook")
    ).rejects.toMatchObject({
      errorCode: ERROR_CODES.SYSTEM_WRITE_BLOCKED,
      kind: "tombstone",
      uid: "alice",
    });
  });

  it("does not throw when tombstone has expired", async () => {
    const pastMs = Date.now() - 86_400_000;
    const db = makeFakeDb({
      accountDeletionRequests: {},
      deletedAccounts: { alice: { uid: "alice", expiresAt: pastMs } },
    });
    await expect(
      assertUserWritableBySystem(db, "alice", "performance")
    ).resolves.toBeUndefined();
  });

  it("is a no-op on empty/undefined uid (defensive)", async () => {
    const db = makeFakeDb({ accountDeletionRequests: {}, deletedAccounts: {} });
    await expect(
      assertUserWritableBySystem(db, "", "x")
    ).resolves.toBeUndefined();
    await expect(
      assertUserWritableBySystem(db, undefined, "x")
    ).resolves.toBeUndefined();
  });
});
