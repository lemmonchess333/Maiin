/**
 * Unit tests for `deleteAccount` — pins the call-ordering invariant
 * that pre-W1f deletion got wrong.
 *
 * The pre-W1f bug: client-side code deleted the Firebase Auth user
 * first, then tried to clean up Firestore. The auth credential was
 * gone, so the subsequent Firestore writes ran as anon and either
 * hit permission-denied (rules required auth) or partially
 * succeeded (rules didn't), leaving orphan data on a "ghost user".
 *
 * The post-W1f contract is the inverse: Firestore + Storage first,
 * Auth user LAST. If any preceding step throws, `auth.deleteUser`
 * never runs and the user retries with their credentials intact.
 *
 * These tests stub Firestore + Auth + Storage with instrumented
 * mocks (no firebase-admin boot) and assert the order. If the
 * ordering ever regresses — even subtly — the test surfaces it.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  deleteAccount,
  USER_SUBCOLLECTIONS,
  TOP_LEVEL_USER_KEYED_COLLECTIONS,
  storagePrefixesFor,
} = require("../accountDeletion");

const TEST_UID = "user-abc";

/**
 * Build a fresh set of stubs. Every observable call writes to a
 * shared `calls` array, with the call name encoding what was
 * accessed so the test can assert order via array index.
 *
 * The Firestore stub is intentionally minimal — `.collection().doc()
 * .collection().get()` returns an empty snapshot by default, so no
 * batch deletes fire. Individual tests override specific paths
 * (e.g. to throw, or to return non-empty docs) by replacing the
 * relevant method after construction.
 */
function makeStubs(opts = {}) {
  const calls = [];
  const tombstones = [];

  function makeBatchAndCollectionGraph(opts = {}) {
    const usersDocStub = (uid) => ({
      collection: (sub) => ({
        get: async () => {
          calls.push(`firestore.users.${uid}.${sub}.get`);
          return opts.userSubSnap
            ? opts.userSubSnap(sub)
            : { empty: true, docs: [] };
        },
      }),
      // P0a — user-doc .get() so the new step 0 (read subscription
      // IDs before purge) doesn't TypeError on the existing stubs.
      // Default: empty doc, so existing tests skip the subscription-
      // cancel branch entirely. `makeStubsWithUserDoc` overrides
      // this to return populated data when the test needs it.
      get: async () => {
        calls.push(`firestore.users.${uid}.get`);
        return { exists: false, data: () => ({}) };
      },
      delete: async () => {
        calls.push(`firestore.users.${uid}.delete`);
        if (opts.userDocDeleteThrows) throw new Error(opts.userDocDeleteThrows);
      },
    });

    const topLevelDocStub = (parent, uid) => ({
      collection: (sub) => ({
        get: async () => {
          calls.push(`firestore.${parent}.${uid}.${sub}.get`);
          return { empty: true, docs: [] };
        },
      }),
    });

    const activitiesQueryStub = (field, op, value) => ({
      get: async () => {
        calls.push(`firestore.activities.where.${field}.${op}.${value}.get`);
        return { empty: true, docs: [] };
      },
    });

    // SOCIAL S3 step 3b — partnerBonds query-delete (members array-contains
    // uid). Same where().get() shape as activities; empty by default.
    const partnerBondsQueryStub = (field, op, value) => ({
      get: async () => {
        calls.push(`firestore.partnerBonds.where.${field}.${op}.${value}.get`);
        return { empty: true, docs: [] };
      },
    });

    // R1A Chunk 3 — in-memory accountDeletionRequests ledger doc (single uid
    // per test). Shared by acquireLease → verifyLeaseGeneration →
    // transitionStatus within one deleteAccount call, and by tx.get/tx.set
    // inside runTransaction. Exposed as `_ledgerStore` so tests can assert the
    // final status.
    const ledgerStore = { doc: opts.initialLedgerDoc };
    const ledgerRefStub = () => ({
      get: async () => ({
        exists: ledgerStore.doc !== undefined,
        data: () => ledgerStore.doc,
      }),
    });

    return {
      _ledgerStore: ledgerStore,
      _tombstones: tombstones,
      collection(name) {
        if (name === "users") {
          return { doc: (uid) => usersDocStub(uid) };
        }
        if (name === "activities") {
          return {
            where: (field, op, value) => activitiesQueryStub(field, op, value),
          };
        }
        if (name === "partnerBonds") {
          return {
            where: (field, op, value) =>
              partnerBondsQueryStub(field, op, value),
          };
        }
        if (name === "accountDeletionRequests") {
          return { doc: () => ledgerRefStub() };
        }
        // Audit F8 — step 3c sweep. Default empty; tests override via
        // opts.appleSubsDocs. Tombstone writes are captured for
        // assertion in _tombstones.
        if (name === "appleSubscriptions") {
          return {
            where: (field, op, value) => ({
              get: async () => {
                calls.push(
                  `firestore.appleSubscriptions.where.${field}.${op}.${value}.get`
                );
                const docs = (opts.appleSubsDocs || []).map((d) => ({
                  id: d.id,
                  ref: {
                    delete: async () => {
                      calls.push(`firestore.appleSubscriptions.${d.id}.delete`);
                    },
                  },
                }));
                return { empty: docs.length === 0, docs };
              },
            }),
          };
        }
        if (name === "deletedBillingIdentities") {
          return {
            doc: (hash) => ({
              set: async (payload) => {
                calls.push(`firestore.deletedBillingIdentities.set`);
                tombstones.push({ hash, payload });
              },
            }),
          };
        }
        return { doc: (uid) => topLevelDocStub(name, uid) };
      },
      async runTransaction(cb) {
        const tx = {
          get: async () => ({
            exists: ledgerStore.doc !== undefined,
            data: () => ledgerStore.doc,
          }),
          set: (ref, data, o) => {
            ledgerStore.doc =
              o && o.merge
                ? { ...(ledgerStore.doc || {}), ...data }
                : { ...data };
          },
        };
        return cb(tx);
      },
      doc(path) {
        return {
          delete: async () => {
            calls.push(`firestore.doc(${path}).delete`);
            if (opts.publicProfileDeleteThrows) {
              throw new Error(opts.publicProfileDeleteThrows);
            }
          },
        };
      },
      batch() {
        const ops = [];
        return {
          delete(ref) {
            ops.push(ref);
            return this;
          },
          commit: async () => {
            calls.push(`batch.commit(${ops.length})`);
          },
        };
      },
    };
  }

  const firestore = makeBatchAndCollectionGraph(opts);
  const auth = {
    deleteUser: async (uid) => {
      calls.push(`auth.deleteUser(${uid})`);
    },
  };
  const storageBucket = {
    deleteFiles: async ({ prefix }) => {
      calls.push(`storage.deleteFiles(${prefix})`);
    },
  };
  const logger = { warn: () => {}, info: () => {}, error: () => {} };

  return {
    firestore,
    auth,
    storageBucket,
    logger,
    calls,
    ledgerStore: firestore._ledgerStore,
  };
}

describe("deleteAccount — call ordering", () => {
  it("calls auth.deleteUser as the FINAL external call", async () => {
    // Bedrock invariant. The W1f bug existed because pre-fix the
    // auth delete fired first and orphaned the Firestore data.
    const stubs = makeStubs();
    await deleteAccount({ ...stubs, uid: TEST_UID });

    const lastCall = stubs.calls[stubs.calls.length - 1];
    expect(lastCall).toBe(`auth.deleteUser(${TEST_UID})`);
  });

  it("calls all user-subcollection gets before the user doc delete", async () => {
    // Per-step ordering: every subcollection is enumerated and
    // emptied before the parent doc itself is removed. Otherwise a
    // partial delete leaves orphan subcollection docs (the parent
    // delete doesn't cascade).
    const stubs = makeStubs();
    await deleteAccount({ ...stubs, uid: TEST_UID });

    const userDocDeleteIdx = stubs.calls.findIndex(
      (c) => c === `firestore.users.${TEST_UID}.delete`
    );
    for (const sub of USER_SUBCOLLECTIONS) {
      const subGetIdx = stubs.calls.findIndex(
        (c) => c === `firestore.users.${TEST_UID}.${sub}.get`
      );
      expect(subGetIdx).toBeGreaterThanOrEqual(0);
      expect(subGetIdx).toBeLessThan(userDocDeleteIdx);
    }
  });

  it("calls Storage cleanup before auth.deleteUser", async () => {
    const stubs = makeStubs();
    await deleteAccount({ ...stubs, uid: TEST_UID });

    const storageIdx = stubs.calls.findIndex((c) =>
      c.startsWith("storage.deleteFiles")
    );
    const authIdx = stubs.calls.findIndex((c) =>
      c.startsWith("auth.deleteUser")
    );
    expect(storageIdx).toBeGreaterThanOrEqual(0);
    expect(authIdx).toBeGreaterThan(storageIdx);
  });

  it("calls the user doc delete before Storage cleanup", async () => {
    // The intended order is Firestore → Storage → Auth. The
    // user-doc delete is the last Firestore step; storage cleanup
    // follows.
    const stubs = makeStubs();
    await deleteAccount({ ...stubs, uid: TEST_UID });

    const userDocDeleteIdx = stubs.calls.findIndex(
      (c) => c === `firestore.users.${TEST_UID}.delete`
    );
    const storageIdx = stubs.calls.findIndex((c) =>
      c.startsWith("storage.deleteFiles")
    );
    expect(userDocDeleteIdx).toBeGreaterThanOrEqual(0);
    expect(storageIdx).toBeGreaterThan(userDocDeleteIdx);
  });
});

describe("deleteAccount — failure semantics", () => {
  it("does NOT call auth.deleteUser if a Firestore delete throws", async () => {
    // The reason ordering matters. The user must keep their
    // credentials so they can retry the deletion. If auth fired
    // on a partial-failure path, the user is locked out with
    // residual data.
    const stubs = makeStubs();
    // Override users.{uid}.delete to throw.
    const origCollection = stubs.firestore.collection;
    stubs.firestore.collection = function (name) {
      const ret = origCollection.call(this, name);
      if (name === "users") {
        return {
          doc: (uid) => ({
            ...ret.doc(uid),
            delete: async () => {
              stubs.calls.push(`firestore.users.${uid}.delete`);
              throw new Error("firestore boom");
            },
          }),
        };
      }
      return ret;
    };

    await expect(deleteAccount({ ...stubs, uid: TEST_UID })).rejects.toThrow(
      "firestore boom"
    );

    const authCalled = stubs.calls.some((c) => c.startsWith("auth.deleteUser"));
    expect(authCalled).toBe(false);
  });

  it("DOES call auth.deleteUser even when Storage cleanup throws", async () => {
    // Storage cleanup is best-effort: a missing bucket / transient
    // outage should not block the auth-user delete. The handler
    // wraps each prefix in try/catch — this test pins that.
    const stubs = makeStubs();
    stubs.storageBucket.deleteFiles = async ({ prefix }) => {
      stubs.calls.push(`storage.deleteFiles(${prefix}).throw`);
      throw new Error("storage 503");
    };

    await deleteAccount({ ...stubs, uid: TEST_UID });

    const authCalled = stubs.calls.some((c) => c.startsWith("auth.deleteUser"));
    expect(authCalled).toBe(true);
  });

  it("continues to next storage prefix when one prefix throws", async () => {
    // Per-prefix try/catch — a 503 on progress-photos shouldn't
    // skip the profile-photos cleanup.
    const stubs = makeStubs();
    stubs.storageBucket.deleteFiles = async ({ prefix }) => {
      stubs.calls.push(`storage.deleteFiles(${prefix})`);
      if (prefix.startsWith("progress-photos/")) {
        throw new Error("storage 503");
      }
    };

    await deleteAccount({ ...stubs, uid: TEST_UID });

    const prefixesCalled = stubs.calls.filter((c) =>
      c.startsWith("storage.deleteFiles")
    );
    expect(prefixesCalled).toHaveLength(3);
    expect(prefixesCalled[0]).toContain("progress-photos/");
    expect(prefixesCalled[1]).toContain("profile-photos/");
    expect(prefixesCalled[2]).toContain("food-photos/");
  });

  it("swallows a missing public-profile doc delete (best-effort)", async () => {
    // The public profile mirror may legitimately not exist (user
    // never finished onboarding, or already cleaned up). The
    // handler uses `.catch(() => {})` to keep the flow going.
    const stubs = makeStubs();
    const origDoc = stubs.firestore.doc;
    stubs.firestore.doc = function (path) {
      const ret = origDoc.call(this, path);
      if (path.includes("/public/profile")) {
        return {
          delete: async () => {
            stubs.calls.push(`firestore.doc(${path}).delete`);
            throw new Error("not found");
          },
        };
      }
      return ret;
    };

    // Should NOT throw — the missing doc is absorbed.
    await expect(
      deleteAccount({ ...stubs, uid: TEST_UID })
    ).resolves.toBeUndefined();
    const authCalled = stubs.calls.some((c) => c.startsWith("auth.deleteUser"));
    expect(authCalled).toBe(true);
  });
});

describe("deleteAccount — coverage of cleanup targets", () => {
  it("iterates every known user subcollection", async () => {
    // Guards against silent drift between USER_SUBCOLLECTIONS and
    // the handler body — if a sub is added to the constant but the
    // loop is broken, every-call coverage surfaces it.
    const stubs = makeStubs();
    await deleteAccount({ ...stubs, uid: TEST_UID });

    for (const sub of USER_SUBCOLLECTIONS) {
      const called = stubs.calls.includes(
        `firestore.users.${TEST_UID}.${sub}.get`
      );
      expect(called).toBe(true);
    }
  });

  it("runs the goal-space cleanup BEFORE the journeys sweep (GOALS-CORE-01)", async () => {
    // The cleanup enumerates memberships from users/{uid}/journeys —
    // the same subcollection the generic sweep deletes. If the ordering
    // ever flips, memberships/counters silently orphan on every
    // deletion. Two journeys gets prove both ran (cleanup first, sweep
    // second), and both precede the user-doc delete.
    const stubs = makeStubs();
    await deleteAccount({ ...stubs, uid: TEST_UID });

    const journeysGets = stubs.calls
      .map((c, i) =>
        c === `firestore.users.${TEST_UID}.journeys.get` ? i : -1
      )
      .filter((i) => i >= 0);
    expect(journeysGets.length).toBeGreaterThanOrEqual(2);
    const userDocDeleteIdx = stubs.calls.findIndex(
      (c) => c === `firestore.users.${TEST_UID}.delete`
    );
    expect(journeysGets[0]).toBeLessThan(userDocDeleteIdx);
    // The FIRST journeys read (the cleanup) precedes every OTHER
    // subcollection sweep get — i.e. the cleanup stage ran before the
    // sweep stage, not interleaved after it.
    const firstSweepGet = stubs.calls.findIndex(
      (c) => c === `firestore.users.${TEST_UID}.meals.get`
    );
    expect(journeysGets[0]).toBeLessThan(firstSweepGet);
  });

  it("iterates every top-level user-keyed subcollection", async () => {
    const stubs = makeStubs();
    await deleteAccount({ ...stubs, uid: TEST_UID });

    for (const { parent, sub } of TOP_LEVEL_USER_KEYED_COLLECTIONS) {
      const called = stubs.calls.includes(
        `firestore.${parent}.${TEST_UID}.${sub}.get`
      );
      expect(called).toBe(true);
    }
  });

  it("queries activities by authorId == uid", async () => {
    // Author-keyed top-level collection — we delete activities the
    // user posted but deliberately keep kudos / comments they gave
    // on others' activities.
    const stubs = makeStubs();
    await deleteAccount({ ...stubs, uid: TEST_UID });

    const activityQuery = stubs.calls.find((c) =>
      c.startsWith("firestore.activities.where.")
    );
    expect(activityQuery).toBe(
      `firestore.activities.where.authorId.==.${TEST_UID}.get`
    );
  });

  it("deletes the public profile mirror at users/{uid}/public/profile", async () => {
    const stubs = makeStubs();
    await deleteAccount({ ...stubs, uid: TEST_UID });

    const publicDelete = stubs.calls.find((c) =>
      c.includes(`users/${TEST_UID}/public/profile`)
    );
    expect(publicDelete).toBeDefined();
  });

  it("cleans both storage prefixes (progress-photos + profile-photos)", async () => {
    const stubs = makeStubs();
    await deleteAccount({ ...stubs, uid: TEST_UID });

    const expected = storagePrefixesFor(TEST_UID);
    for (const prefix of expected) {
      const called = stubs.calls.includes(`storage.deleteFiles(${prefix})`);
      expect(called).toBe(true);
    }
  });

  it("batches non-empty subcollection deletes", async () => {
    // When a subcollection is non-empty, the handler should chunk
    // the refs through firestore.batch().commit(). Pin that the
    // batch path actually fires.
    const stubs = makeStubs();
    const origCollection = stubs.firestore.collection;
    stubs.firestore.collection = function (name) {
      const ret = origCollection.call(this, name);
      if (name === "users") {
        return {
          doc: (uid) => ({
            ...ret.doc(uid),
            collection: (sub) => ({
              get: async () => {
                stubs.calls.push(`firestore.users.${uid}.${sub}.get`);
                if (sub === "meals") {
                  return {
                    empty: false,
                    docs: [{ ref: "mealRef1" }, { ref: "mealRef2" }],
                  };
                }
                return { empty: true, docs: [] };
              },
            }),
          }),
        };
      }
      return ret;
    };

    await deleteAccount({ ...stubs, uid: TEST_UID });

    const commitCall = stubs.calls.find((c) => c.startsWith("batch.commit"));
    expect(commitCall).toBe("batch.commit(2)");
  });
});

/**
 * P0a — Sub1 R1A pin (b) zombie-charge fix.
 *
 * Apple was verified 2026-05-24 to have NO admin-cancellation API
 * for standard IAP subscriptions — that path is handled entirely
 * client-side (P0b, see AccountSection.tsx) via the warn-and-deep-
 * link modal. The server-side executor therefore only handles
 * Stripe via the `cancelStripeSubscription` injection.
 *
 * The cancellation step MUST run BEFORE the user-doc delete (step
 * 5) because that's where `stripeSubscriptionId` lives. If we
 * deleted the doc first, the cancellation call would have no ID
 * to act on. The test asserts ordering via the shared `calls` log.
 */

/** Extends `makeStubs()` so `firestore.collection("users").doc(uid)`
 *  also supports `.get()` returning `{exists, data()}` — needed for
 *  the executor's new step 0 (read subscription IDs before purge).
 */
function makeStubsWithUserDoc({ userData = null, userDocExists = true } = {}) {
  const stubs = makeStubs();
  const calls = stubs.calls;
  const origCollection = stubs.firestore.collection;
  stubs.firestore.collection = function (name) {
    const sub = origCollection.call(this, name);
    if (name === "users") {
      return {
        doc: (uid) => {
          const inner = sub.doc(uid);
          return {
            ...inner,
            get: async () => {
              calls.push(`firestore.users.${uid}.get`);
              return {
                exists: userDocExists,
                data: () => userData ?? {},
              };
            },
          };
        },
      };
    }
    return sub;
  };
  return stubs;
}

describe("deleteAccount — P0a Stripe-subscription cancellation", () => {
  it("completes the deletion even when cancelStripeSubscription throws (locked: provider failure must not block deletion)", async () => {
    const stubs = makeStubsWithUserDoc({
      userData: { stripeSubscriptionId: "sub_failing" },
    });
    const cancelStripeSubscription = vi
      .fn()
      .mockRejectedValue(new Error("stripe-network-blip"));
    const warnSpy = vi.fn();
    stubs.logger = { warn: warnSpy };

    await deleteAccount({
      ...stubs,
      uid: TEST_UID,
      cancelStripeSubscription,
    });

    // The cancel was attempted...
    expect(cancelStripeSubscription).toHaveBeenCalledTimes(1);
    // ...the failure was absorbed + logged...
    expect(warnSpy).toHaveBeenCalledWith(
      "deleteAccount.subscription_cancel_failed",
      expect.objectContaining({ uid: TEST_UID })
    );
    // ...and deletion still reached the final auth-user delete.
    expect(stubs.calls).toContain(`auth.deleteUser(${TEST_UID})`);
  });

  it("does NOT call cancelStripeSubscription when the user doc doesn't exist (already-purged or never-onboarded)", async () => {
    const stubs = makeStubsWithUserDoc({ userDocExists: false });
    const cancelStripeSubscription = vi.fn();

    await deleteAccount({
      ...stubs,
      uid: TEST_UID,
      cancelStripeSubscription,
    });

    expect(cancelStripeSubscription).not.toHaveBeenCalled();
    // Deletion proceeded — missing user doc is not a blocker.
    expect(stubs.calls).toContain(`auth.deleteUser(${TEST_UID})`);
  });

  it("does NOT call cancelStripeSubscription when the user doc lacks stripeSubscriptionId (free user)", async () => {
    const stubs = makeStubsWithUserDoc({
      userData: { displayName: "free user, no sub" },
    });
    const cancelStripeSubscription = vi.fn();

    await deleteAccount({
      ...stubs,
      uid: TEST_UID,
      cancelStripeSubscription,
    });

    expect(cancelStripeSubscription).not.toHaveBeenCalled();
    // Deletion still proceeded all the way to auth.
    expect(stubs.calls).toContain(`auth.deleteUser(${TEST_UID})`);
  });

  it("calls cancelStripeSubscription with the user's stripeSubscriptionId BEFORE the user-doc is deleted", async () => {
    const stubs = makeStubsWithUserDoc({
      userData: { stripeSubscriptionId: "sub_abc123" },
    });
    const cancelStripeSubscription = vi.fn(async ({ stripeSubscriptionId }) => {
      stubs.calls.push(`cancelStripeSubscription(${stripeSubscriptionId})`);
    });

    await deleteAccount({
      ...stubs,
      uid: TEST_UID,
      cancelStripeSubscription,
    });

    // The injected function was called with the right ID.
    expect(cancelStripeSubscription).toHaveBeenCalledTimes(1);
    expect(cancelStripeSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ stripeSubscriptionId: "sub_abc123" })
    );

    // Sequencing pin: cancellation happens before the user-doc
    // delete (step 5). If we ever invert this we lose the ID.
    const cancelIdx = stubs.calls.findIndex((c) =>
      c.startsWith("cancelStripeSubscription(")
    );
    const userDeleteIdx = stubs.calls.indexOf(
      `firestore.users.${TEST_UID}.delete`
    );
    expect(cancelIdx).toBeGreaterThanOrEqual(0);
    expect(userDeleteIdx).toBeGreaterThanOrEqual(0);
    expect(cancelIdx).toBeLessThan(userDeleteIdx);
  });
});

describe("storagePrefixesFor", () => {
  it("returns the scoped prefixes for the uid", () => {
    expect(storagePrefixesFor("alice")).toEqual([
      "progress-photos/alice/",
      "profile-photos/alice/",
      "food-photos/alice/",
    ]);
  });

  it("does not leak global glob — prefixes are uid-scoped", () => {
    // Defence against a future refactor that drops the uid into
    // the prefix template. A blank uid would resolve to
    // `progress-photos/`/, which would delete EVERY user's blobs.
    const prefixes = storagePrefixesFor("alice");
    for (const p of prefixes) {
      expect(p).toContain("alice/");
      expect(p.endsWith("alice/")).toBe(true);
    }
  });
});

describe("deleteAccount — Chunk 3 lease + write-freeze (audit F2)", () => {
  it("engages the freeze (status='running') then completes the ledger on success", async () => {
    const stubs = makeStubs();
    await deleteAccount({
      ...stubs,
      uid: TEST_UID,
      leaseOwner: "exec-A",
      now: 1000,
    });
    // Auth still deleted last.
    expect(stubs.calls[stubs.calls.length - 1]).toBe(
      `auth.deleteUser(${TEST_UID})`
    );
    // Ledger went running (freeze engaged) → completed (with TTL).
    const doc = stubs.ledgerStore.doc;
    expect(doc).toBeDefined();
    expect(doc.status).toBe("completed");
    expect(doc.leaseOwner).toBe("exec-A");
    expect(doc.completedAt).toBe(1000);
    expect(doc.cleanupAfter).toBe(1000 + 30 * 24 * 60 * 60 * 1000);
  });

  it("flips the ledger to failed_cleanup (freeze STAYS on) when a delete throws", async () => {
    const stubs = makeStubs();
    const origCollection = stubs.firestore.collection;
    stubs.firestore.collection = function (name) {
      const ret = origCollection.call(this, name);
      if (name === "users") {
        return {
          doc: (uid) => ({
            ...ret.doc(uid),
            delete: async () => {
              stubs.calls.push(`firestore.users.${uid}.delete`);
              throw new Error("firestore boom");
            },
          }),
        };
      }
      return ret;
    };

    await expect(
      deleteAccount({
        ...stubs,
        uid: TEST_UID,
        leaseOwner: "exec-A",
        now: 1000,
      })
    ).rejects.toThrow("firestore boom");

    // Auth NOT deleted (credentials intact for retry).
    expect(stubs.calls.some((c) => c.startsWith("auth.deleteUser"))).toBe(
      false
    );
    // Ledger frozen at failed_cleanup with the failing stage recorded.
    const doc = stubs.ledgerStore.doc;
    expect(doc.status).toBe("failed_cleanup");
    expect(doc.failedStage).toBe("user_document");
  });

  it("refuses to run when another executor holds a live lease (no cascade)", async () => {
    const stubs = makeStubs({
      initialLedgerDoc: {
        uid: TEST_UID,
        status: "running",
        leaseOwner: "other-exec",
        leaseGeneration: 1,
        leaseExpiresAt: 10_000, // not expired at now=1000
      },
    });

    await expect(
      deleteAccount({
        ...stubs,
        uid: TEST_UID,
        leaseOwner: "exec-A",
        now: 1000,
      })
    ).rejects.toThrow("deletion-in-progress");

    // The cascade never ran — no auth delete, ledger untouched (other-exec owns it).
    expect(stubs.calls.some((c) => c.startsWith("auth.deleteUser"))).toBe(
      false
    );
    expect(stubs.ledgerStore.doc.leaseOwner).toBe("other-exec");
  });

  it("kill-switch trips BEFORE acquiring a lease (no ledger write)", async () => {
    const stubs = makeStubs();
    // system/config with the kill-switch active.
    const origDoc = stubs.firestore.doc;
    stubs.firestore.doc = function (path) {
      if (path === "system/config") {
        return {
          get: async () => ({
            exists: true,
            data: () => ({ deletionExecutorEnabled: false }),
          }),
        };
      }
      return origDoc.call(this, path);
    };

    await expect(
      deleteAccount({
        ...stubs,
        uid: TEST_UID,
        leaseOwner: "exec-A",
        now: 1000,
      })
    ).rejects.toMatchObject({ code: "executor-disabled" });
    // No lease acquired → ledger untouched.
    expect(stubs.ledgerStore.doc).toBeUndefined();
  });

  // ── Audit F8 — appleSubscriptions sweep (step 3c) ────────────────
  it("F8: tombstones the binding identity BEFORE deleting the binding", async () => {
    process.env.BILLING_HMAC_SECRET = "f8-test-secret";
    try {
      const stubs = makeStubs({ appleSubsDocs: [{ id: "otx-123" }] });
      await deleteAccount({ ...stubs, uid: TEST_UID });

      const tombstoneIdx = stubs.calls.findIndex(
        (c) => c === "firestore.deletedBillingIdentities.set"
      );
      const bindingDeleteIdx = stubs.calls.findIndex(
        (c) => c === "firestore.appleSubscriptions.otx-123.delete"
      );
      expect(tombstoneIdx).toBeGreaterThanOrEqual(0);
      expect(bindingDeleteIdx).toBeGreaterThan(tombstoneIdx);
      // Both happen BEFORE the auth delete (Firestore-first ordering).
      const authIdx = stubs.calls.findIndex(
        (c) => c === `auth.deleteUser(${TEST_UID})`
      );
      expect(bindingDeleteIdx).toBeLessThan(authIdx);
      // Tombstone payload never contains the raw transaction id.
      const [tomb] = stubs.firestore._tombstones;
      expect(tomb.hash).not.toContain("otx-123");
      expect(JSON.stringify(tomb.payload)).not.toContain("otx-123");
      expect(tomb.payload.provider).toBe("apple");
    } finally {
      delete process.env.BILLING_HMAC_SECRET;
    }
  });

  it("F8 fail-safe: missing BILLING_HMAC_SECRET keeps the binding and does not throw", async () => {
    delete process.env.BILLING_HMAC_SECRET;
    const stubs = makeStubs({ appleSubsDocs: [{ id: "otx-456" }] });
    await deleteAccount({ ...stubs, uid: TEST_UID });

    // No tombstone written, binding NOT deleted — but the rest of the
    // deletion (including the auth user) completed.
    expect(stubs.firestore._tombstones).toHaveLength(0);
    expect(stubs.calls).not.toContain(
      "firestore.appleSubscriptions.otx-456.delete"
    );
    expect(stubs.calls[stubs.calls.length - 1]).toBe(
      `auth.deleteUser(${TEST_UID})`
    );
  });
});
