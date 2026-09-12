/**
 * Unit tests for the RevenueCat webhook pipeline + sync callable
 * (revenueCat.js, IAP slice 3 backend #1099).
 *
 * Invariants pinned (mirroring applePurchase.test.js's bedrock set):
 *   - A bad / missing Authorization comparison never validates
 *     (constant-time helper behaviour).
 *   - Grant events write `subscriptionTier: "pro"` with an ISO
 *     expiry + `subscriptionSource: "revenuecat"`; EXPIRATION writes
 *     "free"; CANCELLATION does NOT downgrade.
 *   - Lifetime entitlement is never downgraded by a subscription event.
 *   - Stale / out-of-order events (older expiry than stored) are ignored.
 *   - Duplicate deliveries (same event id) are 200-no-ops.
 *   - Events for mid-deletion / tombstoned uids never touch users/{uid};
 *     they go to recordPaymentEventPostDeletion.
 *   - The sync callable never downgrades a user RC has no entitlement
 *     record for (the Stripe-web subscriber guard).
 *
 * Test design: stub firestore (collection().doc() + runTransaction
 * driving a controllable txn) and stub locks — no firebase-admin boot,
 * no network. Same createRequire pattern as the sibling suites.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  mapRevenueCatEvent,
  applyRevenueCatEntitlement,
  processRevenueCatEvent,
  syncEntitlementFromRest,
  safeEqual,
} = require("../lib/revenueCatCore");

const UID = "user-abc";
const FUTURE_MS = Date.parse("2027-01-01T00:00:00.000Z");
const PAST_MS = Date.parse("2026-01-01T00:00:00.000Z");

/** Silent logger so expected warn/error paths don't spam test output. */
const quietLogger = { log: () => {}, warn: () => {}, error: () => {} };

/**
 * Stub firestore: users/{uid} backed by `existing` (or missing when
 * exists=false); revenuecatEvents/{id} backed by `dedupExisting`.
 * Captures user writes (txn.set) and dedup writes (doc.set).
 */
function makeFirestoreStub({
  existing = {},
  exists = true,
  dedupExisting = false,
} = {}) {
  const userWrites = [];
  const dedupWrites = [];
  const userRef = { __kind: "user" };
  const dedupDoc = {
    get: vi.fn(async () => ({ exists: dedupExisting })),
    set: vi.fn(async (fields) => {
      dedupWrites.push(fields);
    }),
  };
  const firestore = {
    collection: vi.fn((name) => ({
      doc: vi.fn(() => (name === "users" ? userRef : dedupDoc)),
    })),
    runTransaction: async (cb) =>
      cb({
        get: vi.fn(async () => ({
          exists,
          data: () => existing,
        })),
        set: vi.fn((_ref, fields, _opts) => {
          userWrites.push(fields);
        }),
      }),
  };
  return { firestore, userWrites, dedupWrites, dedupDoc };
}

const proceedLocks = {
  shouldSystemWriteProceed: vi.fn(async () => true),
  recordPaymentEventPostDeletion: vi.fn(async () => {}),
};

describe("safeEqual", () => {
  it("accepts only an exact match", () => {
    expect(safeEqual("secret-1", "secret-1")).toBe(true);
    expect(safeEqual("secret-1", "secret-2")).toBe(false);
    expect(safeEqual("secret-1", "secret-11")).toBe(false);
    expect(safeEqual(undefined, "secret-1")).toBe(false);
  });
});

describe("mapRevenueCatEvent", () => {
  it.each([
    ["INITIAL_PURCHASE", "pro"],
    ["RENEWAL", "pro"],
    ["UNCANCELLATION", "pro"],
    ["PRODUCT_CHANGE", "pro"],
  ])("%s applies pro with the event expiry", (type, tier) => {
    expect(mapRevenueCatEvent({ type, expiration_at_ms: FUTURE_MS })).toEqual({
      action: "apply",
      tier,
      expiresAtMs: FUTURE_MS,
    });
  });

  it("CANCELLATION keeps pro (auto-renew off ≠ entitlement off)", () => {
    expect(
      mapRevenueCatEvent({ type: "CANCELLATION", expiration_at_ms: FUTURE_MS })
    ).toEqual({ action: "apply", tier: "pro", expiresAtMs: FUTURE_MS });
  });

  it("EXPIRATION downgrades to free", () => {
    expect(
      mapRevenueCatEvent({ type: "EXPIRATION", expiration_at_ms: PAST_MS })
    ).toEqual({ action: "apply", tier: "free", expiresAtMs: PAST_MS });
  });

  it.each(["BILLING_ISSUE", "TEST", "SOMETHING_NEW"])(
    "%s is ignored (200, no write)",
    (type) => {
      expect(mapRevenueCatEvent({ type }).action).toBe("ignore");
    }
  );
});

describe("applyRevenueCatEntitlement", () => {
  it("writes tier + ISO expiry + revenuecat source for an active grant", async () => {
    const { firestore, userWrites } = makeFirestoreStub({ existing: {} });
    const outcome = await applyRevenueCatEntitlement({
      firestore,
      uid: UID,
      tier: "pro",
      expiresAtMs: FUTURE_MS,
      logger: quietLogger,
    });
    expect(outcome).toEqual({ result: "applied", tier: "pro" });
    expect(userWrites).toEqual([
      {
        subscriptionTier: "pro",
        subscriptionSource: "revenuecat",
        subscriptionExpiresAt: new Date(FUTURE_MS).toISOString(),
      },
    ]);
  });

  it("never downgrades a lifetime entitlement", async () => {
    const { firestore, userWrites } = makeFirestoreStub({
      existing: { planKind: "lifetime", subscriptionTier: "pro" },
    });
    const outcome = await applyRevenueCatEntitlement({
      firestore,
      uid: UID,
      tier: "free",
      expiresAtMs: PAST_MS,
      logger: quietLogger,
    });
    expect(outcome.result).toBe("skipped-lifetime");
    expect(userWrites).toEqual([]);
  });

  it("ignores stale events with an older expiry than stored", async () => {
    const { firestore, userWrites } = makeFirestoreStub({
      existing: {
        subscriptionTier: "pro",
        subscriptionExpiresAt: new Date(FUTURE_MS).toISOString(),
      },
    });
    const outcome = await applyRevenueCatEntitlement({
      firestore,
      uid: UID,
      tier: "free",
      expiresAtMs: PAST_MS,
      logger: quietLogger,
    });
    expect(outcome.result).toBe("skipped-stale");
    expect(userWrites).toEqual([]);
  });

  it("reports no-user-match without creating the doc", async () => {
    const { firestore, userWrites } = makeFirestoreStub({ exists: false });
    const outcome = await applyRevenueCatEntitlement({
      firestore,
      uid: UID,
      tier: "pro",
      expiresAtMs: FUTURE_MS,
      logger: quietLogger,
    });
    expect(outcome.result).toBe("no-user-match");
    expect(userWrites).toEqual([]);
  });
});

describe("processRevenueCatEvent", () => {
  const grantEvent = {
    id: "evt-1",
    type: "INITIAL_PURCHASE",
    app_user_id: UID,
    expiration_at_ms: FUTURE_MS,
    transaction_id: "txn-1",
  };

  it("processes a grant end-to-end and finalises the dedup record", async () => {
    const { firestore, userWrites, dedupWrites } = makeFirestoreStub({
      existing: {},
    });
    const outcome = await processRevenueCatEvent({
      firestore,
      event: grantEvent,
      locks: proceedLocks,
      logger: quietLogger,
    });
    expect(outcome).toEqual({ status: 200, result: "applied" });
    expect(userWrites).toHaveLength(1);
    expect(dedupWrites[0]).toMatchObject({
      uid: UID,
      type: "INITIAL_PURCHASE",
      result: "applied",
    });
  });

  it("is a 200 no-op on duplicate delivery", async () => {
    const { firestore, userWrites } = makeFirestoreStub({
      dedupExisting: true,
    });
    const outcome = await processRevenueCatEvent({
      firestore,
      event: grantEvent,
      locks: proceedLocks,
      logger: quietLogger,
    });
    expect(outcome).toEqual({ status: 200, result: "duplicate" });
    expect(userWrites).toEqual([]);
  });

  it("routes deleted-account events to the post-deletion ledger, never users/{uid}", async () => {
    const lockedLocks = {
      shouldSystemWriteProceed: vi.fn(async () => false),
      recordPaymentEventPostDeletion: vi.fn(async () => {}),
    };
    const { firestore, userWrites, dedupWrites } = makeFirestoreStub({});
    const outcome = await processRevenueCatEvent({
      firestore,
      event: grantEvent,
      locks: lockedLocks,
      logger: quietLogger,
    });
    expect(outcome).toEqual({ status: 200, result: "skipped_account_deleted" });
    expect(userWrites).toEqual([]);
    expect(lockedLocks.recordPaymentEventPostDeletion).toHaveBeenCalledWith(
      firestore,
      expect.objectContaining({
        provider: "revenuecat",
        providerEventId: "evt-1",
        externalTxnId: "txn-1",
        eventType: "INITIAL_PURCHASE",
        uid: UID,
      })
    );
    expect(dedupWrites[0]).toMatchObject({ result: "skipped_account_deleted" });
  });

  it("200s but never writes for anonymous app_user_ids", async () => {
    const { firestore, userWrites } = makeFirestoreStub({});
    const outcome = await processRevenueCatEvent({
      firestore,
      event: { ...grantEvent, app_user_id: "$RCAnonymousID:abc" },
      locks: proceedLocks,
      logger: quietLogger,
    });
    expect(outcome).toEqual({ status: 200, result: "unmappable-app-user-id" });
    expect(userWrites).toEqual([]);
  });

  it("200s ignored types (TEST) so operator setup verification passes", async () => {
    const { firestore, userWrites } = makeFirestoreStub({});
    const outcome = await processRevenueCatEvent({
      firestore,
      event: { id: "evt-t", type: "TEST" },
      locks: proceedLocks,
      logger: quietLogger,
    });
    expect(outcome.status).toBe(200);
    expect(outcome.result).toMatch(/^ignored:/);
    expect(userWrites).toEqual([]);
  });

  it("400s a malformed body", async () => {
    const { firestore } = makeFirestoreStub({});
    const outcome = await processRevenueCatEvent({
      firestore,
      event: null,
      locks: proceedLocks,
      logger: quietLogger,
    });
    expect(outcome.status).toBe(400);
  });
});

describe("syncEntitlementFromRest", () => {
  const restOk = (entitlements) => async () => ({
    ok: true,
    json: async () => ({ subscriber: { entitlements } }),
  });

  it("applies an active pro entitlement", async () => {
    const { firestore, userWrites } = makeFirestoreStub({ existing: {} });
    const outcome = await syncEntitlementFromRest({
      firestore,
      uid: UID,
      restKey: "rc-rest",
      fetchImpl: restOk({
        pro: { expires_date: new Date(FUTURE_MS).toISOString() },
      }),
      locks: proceedLocks,
      logger: quietLogger,
    });
    expect(outcome).toMatchObject({ synced: true, isPro: true });
    expect(userWrites[0]).toMatchObject({ subscriptionTier: "pro" });
  });

  it("never downgrades a user with no RC entitlement record (Stripe guard)", async () => {
    const { firestore, userWrites } = makeFirestoreStub({
      existing: { subscriptionTier: "pro", stripeSubscriptionId: "sub_1" },
    });
    const outcome = await syncEntitlementFromRest({
      firestore,
      uid: UID,
      restKey: "rc-rest",
      fetchImpl: restOk({}),
      locks: proceedLocks,
      logger: quietLogger,
    });
    expect(outcome).toEqual({ synced: false, reason: "no-rc-entitlement" });
    expect(userWrites).toEqual([]);
  });

  it("surfaces REST failures without writing", async () => {
    const { firestore, userWrites } = makeFirestoreStub({});
    const outcome = await syncEntitlementFromRest({
      firestore,
      uid: UID,
      restKey: "rc-rest",
      fetchImpl: async () => ({ ok: false, status: 503 }),
      locks: proceedLocks,
      logger: quietLogger,
    });
    expect(outcome).toEqual({ synced: false, reason: "rest-503" });
    expect(userWrites).toEqual([]);
  });

  it("skips deleted accounts entirely", async () => {
    const lockedLocks = {
      shouldSystemWriteProceed: vi.fn(async () => false),
      recordPaymentEventPostDeletion: vi.fn(async () => {}),
    };
    const { firestore, userWrites } = makeFirestoreStub({});
    const outcome = await syncEntitlementFromRest({
      firestore,
      uid: UID,
      restKey: "rc-rest",
      fetchImpl: restOk({ pro: {} }),
      locks: lockedLocks,
      logger: quietLogger,
    });
    expect(outcome).toEqual({ synced: false, reason: "account-deleted" });
    expect(userWrites).toEqual([]);
  });
});
