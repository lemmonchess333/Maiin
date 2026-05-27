/**
 * Unit tests for `applySubscriptionToUser` — pins the Apple IAP
 * verification + Firestore-state invariants from the W1f + PR D
 * audit work.
 *
 * Bedrock invariants (the security ones):
 *   - A forged / unsigned / wrong-bundle JWS → verifyTransaction
 *     throws → no Firestore write, no entitlement granted.
 *   - A bundle-ID mismatch on the *decoded* payload → throws.
 *     SignedDataVerifier already enforces this; the helper's
 *     re-check is defence-in-depth and the test pins it.
 *
 * Behavioural invariants (the correctness ones):
 *   - Lifetime entitlement is NEVER downgraded by a subscription
 *     event (a stray expired notification can't kick a lifetime
 *     buyer back to free).
 *   - Stale events (older expiresDate than what's stored) are
 *     ignored — Apple delivers out-of-order under load.
 *   - Active subscription → writes `subscriptionTier: "pro"` with
 *     the incoming expiresDate.
 *   - Inactive (already-expired) subscription → writes "free".
 *
 * Test design: stub firestore (`collection().doc()` + a fake
 * `runTransaction` that invokes its callback with a controllable
 * txn object) and a stub `verifyTransaction` that the test can
 * make throw or return any payload shape. No firebase-admin boot,
 * no Apple library cert fetch.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { applySubscriptionToUser, BUNDLE_ID } = require("../applePurchase");

const UID = "user-abc";

/**
 * Build a stub firestore with a controllable txn body. `txnReads`
 * is the data the `txn.get(userRef)` call resolves to; `txnWrites`
 * captures everything written via `txn.set` so the test can assert
 * the payload shape.
 */
function makeFirestoreStub({
  existing = {},
  exists = true,
  lookupExisting = null,
} = {}) {
  const allWrites = [];
  const txnGetCalls = [];
  const userRefMarker = { __isUserRef: true };

  const firestore = {
    collection(name) {
      return {
        doc: (id) => {
          if (name === "users" && id === UID) return userRefMarker;
          if (name === "appleSubscriptions")
            return { __isLookupRef: true, __id: id };
          return { __collection: name, __id: id };
        },
      };
    },
    runTransaction: async (callback) => {
      const txn = {
        get: async (ref) => {
          txnGetCalls.push(ref);
          if (ref && ref.__isLookupRef) {
            return {
              exists: lookupExisting !== null,
              data: () => (lookupExisting ? { ...lookupExisting } : {}),
            };
          }
          return { exists, data: () => ({ ...existing }) };
        },
        set: (ref, data, options) => {
          allWrites.push({ ref, data, options });
          return txn;
        },
      };
      return callback(txn);
    },
  };

  // `writes` filtered to user-doc writes only (the tests assert
  // against subscription state on the user doc; the lookup-doc
  // claim is asserted separately where relevant).
  const writes = new Proxy([], {
    get(_, prop) {
      const userWrites = allWrites.filter((w) => w.ref === userRefMarker);
      if (prop === "length") return userWrites.length;
      return userWrites[prop];
    },
  });

  return { firestore, writes, allWrites, txnGetCalls, userRefMarker };
}

/**
 * Build a "good" verified transaction payload — the shape
 * SignedDataVerifier.verifyAndDecodeTransaction would return on a
 * valid prod-bundle JWS. Tests mutate fields off the base shape
 * to simulate variants.
 */
function makeValidTx(overrides = {}) {
  const oneYearOut = new Date();
  oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
  return {
    bundleId: BUNDLE_ID,
    productId: "com.tropos.app.pro.yearly",
    originalTransactionId: "1000000000000001",
    expiresDate: oneYearOut.getTime(),
    ...overrides,
  };
}

describe("applySubscriptionToUser — security invariants", () => {
  it("rejects a forged JWS — no Firestore write, no entitlement granted", async () => {
    // The bedrock test. verifyTransaction throws (simulating a
    // chain failure / forged signature / wrong bundle from
    // SignedDataVerifier). The helper MUST propagate without
    // touching Firestore — pre-W1f the function did a naive
    // base64 decode and granted Pro on trust.
    const { firestore, writes } = makeFirestoreStub();
    const verifyTransaction = async () => {
      throw new Error(
        "VerificationException: Failed to verify the JWS signature"
      );
    };

    await expect(
      applySubscriptionToUser({
        firestore,
        verifyTransaction,
        signedTransactionInfo: "forged.jws.payload",
        uid: UID,
      })
    ).rejects.toThrow(/Failed to verify/);

    expect(writes).toHaveLength(0);
  });

  it("rejects an unverified payload before any Firestore read", async () => {
    // Same as above but pin specifically that the firestore stub
    // never even gets a runTransaction call. If the helper ever
    // started "trying" the txn before verifying, this test
    // surfaces the regression.
    let runTransactionCalled = false;
    const firestore = {
      collection: () => ({ doc: () => ({}) }),
      runTransaction: async () => {
        runTransactionCalled = true;
        throw new Error("should never run");
      },
    };
    const verifyTransaction = async () => {
      throw new Error("forged");
    };

    await expect(
      applySubscriptionToUser({
        firestore,
        verifyTransaction,
        signedTransactionInfo: "x",
        uid: UID,
      })
    ).rejects.toThrow();

    expect(runTransactionCalled).toBe(false);
  });

  it("rejects a verified payload with a mismatched bundleId (defence-in-depth)", async () => {
    // SignedDataVerifier already enforces bundleId — but a
    // misconfigured verifier could let another app's transactions
    // through. The helper's re-check is the second gate; this
    // test pins it so a refactor that drops the check fails CI.
    const { firestore, writes } = makeFirestoreStub();
    const verifyTransaction = async () =>
      makeValidTx({ bundleId: "com.other-app.evil" });

    await expect(
      applySubscriptionToUser({
        firestore,
        verifyTransaction,
        signedTransactionInfo: "x",
        uid: UID,
      })
    ).rejects.toThrow(/Bundle mismatch: com\.other-app\.evil/);

    expect(writes).toHaveLength(0);
  });

  it("calls verifyTransaction with the exact signedTransactionInfo the caller passed", async () => {
    // Pin that the helper doesn't pre-process / decode / mutate
    // the JWS before handing it to the verifier — the verifier
    // expects the raw signed payload.
    const { firestore } = makeFirestoreStub();
    const received = [];
    const verifyTransaction = async (signedTransactionInfo) => {
      received.push(signedTransactionInfo);
      return makeValidTx();
    };

    await applySubscriptionToUser({
      firestore,
      verifyTransaction,
      signedTransactionInfo: "eyJhbGciOi...",
      uid: UID,
    });

    expect(received).toEqual(["eyJhbGciOi..."]);
  });
});

describe("applySubscriptionToUser — lifetime entitlement", () => {
  it("does NOT downgrade a lifetime user when a subscription event arrives", async () => {
    // The PR D invariant. A one-time lifetime purchase must
    // survive any subscription notification (including expired
    // ones, including stray ones from a different productId).
    const { firestore, writes } = makeFirestoreStub({
      existing: {
        planKind: "lifetime",
        subscriptionTier: "pro",
        subscriptionExpiresAt: null,
      },
    });

    // Simulate a stray expired-yearly event arriving.
    const pastDate = new Date();
    pastDate.setFullYear(pastDate.getFullYear() - 1);
    const verifyTransaction = async () =>
      makeValidTx({ expiresDate: pastDate.getTime() });

    const result = await applySubscriptionToUser({
      firestore,
      verifyTransaction,
      signedTransactionInfo: "x",
      uid: UID,
    });

    expect(result.skipped).toBe("lifetime");
    expect(result.tier).toBe("pro");
    expect(writes).toHaveLength(0); // never touched the doc
  });

  it("falls back tier='pro' when lifetime user has no subscriptionTier set", async () => {
    // Defensive default — the helper assumes a lifetime user is
    // always pro, even if some prior code path forgot to set
    // subscriptionTier explicitly.
    const { firestore } = makeFirestoreStub({
      existing: { planKind: "lifetime" /* no subscriptionTier */ },
    });
    const verifyTransaction = async () => makeValidTx();

    const result = await applySubscriptionToUser({
      firestore,
      verifyTransaction,
      signedTransactionInfo: "x",
      uid: UID,
    });

    expect(result.tier).toBe("pro");
    expect(result.skipped).toBe("lifetime");
  });
});

describe("applySubscriptionToUser — staleness guard", () => {
  it("ignores an incoming tx with an older expiresDate than stored", async () => {
    // The audit-P0-#3 invariant. A late EXPIRED notification
    // arriving after a DID_RENEW must NOT overwrite the fresh
    // expiresDate. Pre-PR-D this would have silently downgraded
    // the paying user.
    const futureStored = new Date();
    futureStored.setMonth(futureStored.getMonth() + 11);

    const { firestore, writes } = makeFirestoreStub({
      existing: {
        subscriptionTier: "pro",
        subscriptionExpiresAt: futureStored.toISOString(),
      },
    });

    // Incoming tx claims a past expiresDate (stale).
    const pastIncoming = new Date();
    pastIncoming.setMonth(pastIncoming.getMonth() - 1);
    const verifyTransaction = async () =>
      makeValidTx({ expiresDate: pastIncoming.getTime() });

    const result = await applySubscriptionToUser({
      firestore,
      verifyTransaction,
      signedTransactionInfo: "x",
      uid: UID,
    });

    expect(result.skipped).toBe("stale");
    expect(result.tier).toBe("pro");
    expect(result.expiresAt).toBe(futureStored.toISOString());
    expect(writes).toHaveLength(0);
  });

  it("accepts an incoming tx with the SAME expiresDate as stored (equality is not stale)", async () => {
    // The stale comparison is strict-greater (stored > incoming).
    // An exact match should still write through — Apple
    // re-delivers on transient 5xx and the same transaction
    // should be idempotently re-applied, not skipped.
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 6);

    const { firestore, writes } = makeFirestoreStub({
      existing: {
        subscriptionTier: "pro",
        subscriptionExpiresAt: expiresAt.toISOString(),
      },
    });
    const verifyTransaction = async () =>
      makeValidTx({ expiresDate: expiresAt.getTime() });

    const result = await applySubscriptionToUser({
      firestore,
      verifyTransaction,
      signedTransactionInfo: "x",
      uid: UID,
    });

    expect(result.skipped).toBeUndefined();
    expect(writes).toHaveLength(1);
  });

  it("accepts a newer incoming tx (overwrite path)", async () => {
    // The happy-path renewal case.
    const oldStored = new Date();
    oldStored.setMonth(oldStored.getMonth() - 1);

    const { firestore, writes } = makeFirestoreStub({
      existing: {
        subscriptionTier: "free",
        subscriptionExpiresAt: oldStored.toISOString(),
      },
    });

    const newIncoming = new Date();
    newIncoming.setFullYear(newIncoming.getFullYear() + 1);
    const verifyTransaction = async () =>
      makeValidTx({ expiresDate: newIncoming.getTime() });

    const result = await applySubscriptionToUser({
      firestore,
      verifyTransaction,
      signedTransactionInfo: "x",
      uid: UID,
    });

    expect(result.skipped).toBeUndefined();
    expect(result.tier).toBe("pro");
    expect(writes).toHaveLength(1);
    expect(writes[0].data.subscriptionTier).toBe("pro");
    expect(writes[0].data.subscriptionExpiresAt).toBe(
      newIncoming.toISOString()
    );
  });
});

describe("applySubscriptionToUser — active vs inactive", () => {
  it("writes 'pro' for a future expiresDate (active subscription)", async () => {
    const { firestore, writes } = makeFirestoreStub({ existing: {} });
    const futureExpires = new Date();
    futureExpires.setMonth(futureExpires.getMonth() + 1);
    const verifyTransaction = async () =>
      makeValidTx({
        expiresDate: futureExpires.getTime(),
        productId: "com.tropos.app.pro.monthly",
        originalTransactionId: "1000000000000099",
      });

    const result = await applySubscriptionToUser({
      firestore,
      verifyTransaction,
      signedTransactionInfo: "x",
      uid: UID,
    });

    expect(result.tier).toBe("pro");
    expect(writes).toHaveLength(1);
    expect(writes[0].data).toMatchObject({
      subscriptionTier: "pro",
      appleProductId: "com.tropos.app.pro.monthly",
      appleOriginalTransactionId: "1000000000000099",
      subscriptionExpiresAt: futureExpires.toISOString(),
    });
    expect(writes[0].options).toEqual({ merge: true });
  });

  it("writes 'free' for a past expiresDate (subscription has expired)", async () => {
    // The DID_EXPIRE path on a non-lifetime user that wasn't
    // overtaken by a later notification.
    const { firestore, writes } = makeFirestoreStub({ existing: {} });
    const pastExpires = new Date();
    pastExpires.setMonth(pastExpires.getMonth() - 1);
    const verifyTransaction = async () =>
      makeValidTx({ expiresDate: pastExpires.getTime() });

    const result = await applySubscriptionToUser({
      firestore,
      verifyTransaction,
      signedTransactionInfo: "x",
      uid: UID,
      // Pin the clock so the "isActive" derivation is deterministic.
      now: () => new Date(),
    });

    expect(result.tier).toBe("free");
    expect(writes[0].data.subscriptionTier).toBe("free");
  });

  it("uses the injected clock for the active/inactive boundary", async () => {
    // Caller can pin `now` for deterministic tests. Pre-emptively
    // pins that the helper actually honours the injection — if a
    // refactor reintroduced `new Date()` directly, this would fail.
    const { firestore, writes } = makeFirestoreStub({ existing: {} });
    const txExpires = new Date("2026-06-15T00:00:00Z");
    const verifyTransaction = async () =>
      makeValidTx({ expiresDate: txExpires.getTime() });

    // Clock says it's 2026-06-14 — tx is still active (one day before expiry).
    const result = await applySubscriptionToUser({
      firestore,
      verifyTransaction,
      signedTransactionInfo: "x",
      uid: UID,
      now: () => new Date("2026-06-14T00:00:00Z"),
    });
    expect(result.tier).toBe("pro");

    // Clock says it's 2026-06-16 — tx is now expired.
    const { firestore: f2, writes: w2 } = makeFirestoreStub({ existing: {} });
    const result2 = await applySubscriptionToUser({
      firestore: f2,
      verifyTransaction,
      signedTransactionInfo: "x",
      uid: UID,
      now: () => new Date("2026-06-16T00:00:00Z"),
    });
    expect(result2.tier).toBe("free");
    expect(w2[0].data.subscriptionTier).toBe("free");
    expect(writes[0].data.subscriptionTier).toBe("pro");
  });
});

describe("applySubscriptionToUser — Firestore write shape", () => {
  it("writes the merge flag so other fields aren't clobbered", async () => {
    const { firestore, writes } = makeFirestoreStub({ existing: {} });
    const verifyTransaction = async () => makeValidTx();

    await applySubscriptionToUser({
      firestore,
      verifyTransaction,
      signedTransactionInfo: "x",
      uid: UID,
    });

    expect(writes[0].options).toEqual({ merge: true });
  });

  it("passes the injected serverTimestamp sentinel to updatedAt", async () => {
    // Production passes `FieldValue.serverTimestamp` so the field
    // gets Firestore's authoritative write-time. Pin that the
    // injection point works — a future refactor that hardcodes
    // `new Date()` would fail this test.
    const sentinel = Symbol("ts");
    const { firestore, writes } = makeFirestoreStub({ existing: {} });
    const verifyTransaction = async () => makeValidTx();

    await applySubscriptionToUser({
      firestore,
      verifyTransaction,
      signedTransactionInfo: "x",
      uid: UID,
      serverTimestamp: () => sentinel,
    });

    expect(writes[0].data.updatedAt).toBe(sentinel);
  });

  it("targets the users/{uid} doc via firestore.collection().doc()", async () => {
    // Defensive: pin that the write goes to users/{authUid}, not
    // some other path. A regression that took the uid from the
    // tx payload (where an attacker controls
    // originalTransactionId) would surface here.
    const stub = makeFirestoreStub({ existing: {} });
    const verifyTransaction = async () => makeValidTx();

    await applySubscriptionToUser({
      firestore: stub.firestore,
      verifyTransaction,
      signedTransactionInfo: "x",
      uid: UID,
    });

    expect(stub.writes[0].ref).toBe(stub.userRefMarker);
    expect(stub.txnGetCalls[0]).toBe(stub.userRefMarker);
  });
});

describe("applySubscriptionToUser — Sub1 P2.5 Stripe auto-cancel", () => {
  it("Cycle 1 (tracer): IAP override on stripe-Pro user invokes cancelDisplacedStripeSub", async () => {
    // Existing user is Pro via stripe — incoming IAP triggers the
    // cross-platform conflict + the auto-cancel callback.
    const stub = makeFirestoreStub({
      existing: { subscriptionTier: "pro", subscriptionSource: "stripe" },
    });
    const verifyTransaction = async () => makeValidTx();
    const cancelCalls = [];
    const cancelDisplacedStripeSub = async ({ uid }) => {
      cancelCalls.push({ uid });
    };

    const result = await applySubscriptionToUser({
      firestore: stub.firestore,
      verifyTransaction,
      signedTransactionInfo: "x",
      uid: UID,
      cancelDisplacedStripeSub,
    });

    expect(result.crossPlatformConflict).toBe(true);
    expect(cancelCalls).toHaveLength(1);
    expect(cancelCalls[0].uid).toBe(UID);
    // IAP write still committed despite the conflict — the user IS
    // Pro on ios_iap after this call returns.
    expect(stub.writes[0].data.subscriptionTier).toBe("pro");
    expect(stub.writes[0].data.subscriptionSource).toBe("ios_iap");
  });

  it("Cycle 2: no prior source (fresh user) → no auto-cancel call", async () => {
    const stub = makeFirestoreStub({ existing: {} });
    const verifyTransaction = async () => makeValidTx();
    const cancelCalls = [];
    const cancelDisplacedStripeSub = async ({ uid }) => {
      cancelCalls.push({ uid });
    };

    const result = await applySubscriptionToUser({
      firestore: stub.firestore,
      verifyTransaction,
      signedTransactionInfo: "x",
      uid: UID,
      cancelDisplacedStripeSub,
    });

    expect(result.crossPlatformConflict).toBe(false);
    expect(cancelCalls).toHaveLength(0);
  });

  it("Cycle 3: same-platform renewal (ios_iap → ios_iap) → no auto-cancel call", async () => {
    const stub = makeFirestoreStub({
      existing: { subscriptionTier: "pro", subscriptionSource: "ios_iap" },
    });
    const verifyTransaction = async () => makeValidTx();
    const cancelCalls = [];
    const cancelDisplacedStripeSub = async ({ uid }) => {
      cancelCalls.push({ uid });
    };

    const result = await applySubscriptionToUser({
      firestore: stub.firestore,
      verifyTransaction,
      signedTransactionInfo: "x",
      uid: UID,
      cancelDisplacedStripeSub,
    });

    expect(result.crossPlatformConflict).toBe(false);
    expect(cancelCalls).toHaveLength(0);
  });

  it("Cycle 4: auto-cancel callback throws → IAP success is still returned (fail-soft)", async () => {
    // Stripe outage on the cancel call MUST NOT break the IAP path.
    // The user IS Pro on ios_iap; a stale Stripe sub is the ops
    // follow-up case, not a webhook-failure case.
    const stub = makeFirestoreStub({
      existing: { subscriptionTier: "pro", subscriptionSource: "stripe" },
    });
    const verifyTransaction = async () => makeValidTx();
    const cancelDisplacedStripeSub = async () => {
      throw new Error("Stripe is down");
    };
    const logged = [];
    const logger = {
      log: () => {},
      info: () => {},
      warn: (msg, ctx) => logged.push({ msg, ctx }),
      error: () => {},
    };

    const result = await applySubscriptionToUser({
      firestore: stub.firestore,
      verifyTransaction,
      signedTransactionInfo: "x",
      uid: UID,
      cancelDisplacedStripeSub,
      logger,
    });

    expect(result.crossPlatformConflict).toBe(true);
    expect(result.tier).toBe("pro");
    // The failure is logged as a warning, not thrown.
    const failureLog = logged.find(
      (l) => l.msg === "applySubscriptionToUser.auto_cancel_failed"
    );
    expect(failureLog).toBeDefined();
    expect(failureLog.ctx.error).toMatch(/Stripe is down/);
  });

  it("Cycle 5: cancelDisplacedStripeSub absent (legacy callers) → conflict logged, no error", async () => {
    // Pre-#P2.5 caller doesn't inject the callback. The conflict
    // log still fires; no crash.
    const stub = makeFirestoreStub({
      existing: { subscriptionTier: "pro", subscriptionSource: "stripe" },
    });
    const verifyTransaction = async () => makeValidTx();

    const result = await applySubscriptionToUser({
      firestore: stub.firestore,
      verifyTransaction,
      signedTransactionInfo: "x",
      uid: UID,
      // No cancelDisplacedStripeSub passed
    });

    expect(result.crossPlatformConflict).toBe(true);
    expect(result.tier).toBe("pro");
  });
});

describe("applySubscriptionToUser — uniqueness guard", () => {
  // The denormalised `appleSubscriptions/{originalTransactionId}`
  // lookup binds one transaction id to one uid. Restore /
  // verify flows that re-use a foreign transaction id are
  // rejected before any user-doc write happens.

  it("rejects when the transaction id is already bound to a different uid", async () => {
    const { firestore, writes, allWrites } = makeFirestoreStub({
      existing: {},
      lookupExisting: { uid: "other-victim-uid", productId: "x" },
    });
    const verifyTransaction = async () =>
      makeValidTx({ originalTransactionId: "1000000000000099" });

    await expect(
      applySubscriptionToUser({
        firestore,
        verifyTransaction,
        signedTransactionInfo: "x",
        uid: UID,
      })
    ).rejects.toThrow(/different account/);

    // No user-doc write and no lookup-doc write — both blocked by
    // the in-txn ownership check.
    expect(writes).toHaveLength(0);
    expect(allWrites).toHaveLength(0);
  });

  it("accepts when the transaction id is already bound to the SAME uid (legit renewal)", async () => {
    // The "Apple renewal lands as a new ASSN V2 notification for
    // the same transaction id" case — the lookup already exists
    // bound to this user; the transaction must proceed and refresh
    // expiresAt.
    const { firestore, writes, allWrites } = makeFirestoreStub({
      existing: {},
      lookupExisting: { uid: UID, productId: "x" },
    });
    const futureExpires = new Date();
    futureExpires.setMonth(futureExpires.getMonth() + 1);
    const verifyTransaction = async () =>
      makeValidTx({
        expiresDate: futureExpires.getTime(),
        originalTransactionId: "1000000000000099",
      });

    const result = await applySubscriptionToUser({
      firestore,
      verifyTransaction,
      signedTransactionInfo: "x",
      uid: UID,
    });

    expect(result.tier).toBe("pro");
    // One user-doc write + one lookup-doc refresh.
    expect(writes).toHaveLength(1);
    expect(allWrites).toHaveLength(2);
  });

  it("claims the lookup doc on a brand-new transaction id", async () => {
    const { firestore, allWrites } = makeFirestoreStub({
      existing: {},
      // lookupExisting: null → first-time claim path
    });
    const verifyTransaction = async () =>
      makeValidTx({ originalTransactionId: "1000000000000099" });

    await applySubscriptionToUser({
      firestore,
      verifyTransaction,
      signedTransactionInfo: "x",
      uid: UID,
    });

    // Lookup doc write should include uid + originalTransactionId
    // binding so the next call under a different uid can detect it.
    const lookupWrite = allWrites.find((w) => w.ref && w.ref.__isLookupRef);
    expect(lookupWrite).toBeDefined();
    expect(lookupWrite.data.uid).toBe(UID);
  });
});
