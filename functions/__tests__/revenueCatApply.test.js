/**
 * `applyRevenueCatEntitlement` — the Firestore state invariants for the
 * RevenueCat pipeline (slice 3, ADR-0006).
 *
 * The write itself is three fields and a merge, so what is worth pinning
 * is the set of things it must NOT do:
 *
 *   - never downgrade a lifetime purchase
 *   - never write a source on a downgrade
 *   - never touch the legacy Apple lookup fields, which would bind a
 *     RevenueCat entitlement into the hand-rolled path's uniqueness
 *     index and leave the two pipelines fighting over the same rows
 *
 * Test design follows applePurchase.test.js: a stub firestore whose
 * `runTransaction` invokes the callback with a controllable txn, so the
 * decisions are exercised without an emulator or a firebase-admin boot.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  _applyRevenueCatEntitlement: applyRevenueCatEntitlement,
} = require("../revenueCat");

const UID = "user-abc";
const FUTURE = "2026-10-19T12:00:00.000Z";

function makeFirestoreStub({ existing = {}, exists = true } = {}) {
  const writes = [];
  const userRefMarker = { __isUserRef: true, __id: UID };
  const firestore = {
    collection(name) {
      return {
        doc: (id) => {
          if (name === "users" && id === UID) return userRefMarker;
          return { __collection: name, __id: id };
        },
      };
    },
    runTransaction: async (callback) =>
      callback({
        get: async () => ({ exists, data: () => ({ ...existing }) }),
        set: (ref, data, options) => {
          writes.push({ ref, data, options });
        },
      }),
  };
  return { firestore, writes, userRefMarker };
}

const silentLogger = { log: () => {}, warn: () => {}, error: () => {} };

const apply = (opts, entitlement) => {
  const stub = makeFirestoreStub(opts);
  return applyRevenueCatEntitlement({
    firestore: stub.firestore,
    uid: UID,
    entitlement,
    serverTimestamp: () => "SERVER_TS",
    logger: silentLogger,
  }).then((result) => ({ ...stub, result }));
};

const ACTIVE = {
  isActive: true,
  expiresAt: FUTURE,
  productId: "com.tropos.app.pro.yearly",
  store: "app_store",
};
const REVOKED = {
  isActive: false,
  expiresAt: null,
  productId: null,
  store: null,
};

describe("applyRevenueCatEntitlement", () => {
  it("grants Pro with the platform source and the entitlement expiry", async () => {
    const { writes, result } = await apply(
      { existing: { subscriptionTier: "free" } },
      ACTIVE
    );
    expect(writes).toHaveLength(1);
    expect(writes[0].options).toEqual({ merge: true });
    expect(writes[0].data).toMatchObject({
      subscriptionTier: "pro",
      subscriptionSource: "ios_iap",
      subscriptionExpiresAt: FUTURE,
    });
    expect(result.tier).toBe("pro");
  });

  it("downgrades with a null source and a null expiry", async () => {
    /* resolveSubscriptionUpdate nulls the source on a free write; the
       expiry has to go with it, or computeEffectiveTier keeps reading a
       future timestamp off a free account. */
    const { writes } = await apply(
      {
        existing: {
          subscriptionTier: "pro",
          subscriptionSource: "ios_iap",
          subscriptionExpiresAt: FUTURE,
        },
      },
      REVOKED
    );
    expect(writes[0].data).toMatchObject({
      subscriptionTier: "free",
      subscriptionSource: null,
      subscriptionExpiresAt: null,
    });
  });

  it("never downgrades a lifetime purchase", async () => {
    /* A revoked subscription event on an account holding a one-time
       purchase. Applying it would take away something the user paid for
       outright and no renewal will ever restore. */
    const { writes, result } = await apply(
      { existing: { planKind: "lifetime", subscriptionTier: "pro" } },
      REVOKED
    );
    expect(writes).toEqual([]);
    expect(result.skipped).toBe("lifetime");
  });

  it("logs a cross-platform conflict instead of silently overwriting", async () => {
    const logger = { log: () => {}, warn: vi.fn(), error: () => {} };
    const stub = makeFirestoreStub({
      existing: { subscriptionTier: "pro", subscriptionSource: "stripe" },
    });
    const result = await applyRevenueCatEntitlement({
      firestore: stub.firestore,
      uid: UID,
      entitlement: ACTIVE,
      serverTimestamp: () => "SERVER_TS",
      logger,
    });
    expect(result.crossPlatformConflict).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      "applyRevenueCatEntitlement.cross_platform_conflict",
      expect.objectContaining({ previousSource: "stripe" })
    );
  });

  it("writes no Apple lookup fields", async () => {
    /* The absence assertion. appleOriginalTransactionId is the key of
       the hand-rolled path's uniqueness index (appleSubscriptions/{id}),
       and writing it from here would make a RevenueCat renewal look like
       an Apple one to restoreApplePurchases. Adding it would read as
       tidying up; nothing else would notice. */
    const { writes } = await apply({ existing: {} }, ACTIVE);
    expect(Object.keys(writes[0].data).sort()).toEqual([
      "subscriptionExpiresAt",
      "subscriptionSource",
      "subscriptionTier",
      "updatedAt",
    ]);
  });

  it("writes to the user document and nothing else", async () => {
    /* Pins the single-document shape. The Apple path writes a second
       lookup doc in the same transaction; this one must not, because
       nothing reads a RevenueCat lookup and a half-used index rots. */
    const { writes, userRefMarker } = await apply({ existing: {} }, ACTIVE);
    expect(writes.map((w) => w.ref)).toEqual([userRefMarker]);
  });
});
