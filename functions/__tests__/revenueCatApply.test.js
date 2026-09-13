/**
 * The guarded write shared by the RevenueCat webhook and the sync
 * callable. Asserts on what reaches the user doc, in the order the four
 * guards run: deletion lock → stale → lifetime → cross-platform.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { applyRevenueCatEntitlement } = require("../lib/revenueCatApply");
const reconciliation = require("../lib/subscriptionReconciliation");

function makeDb(userData = {}, { exists = true } = {}) {
  const set = vi.fn(async () => {});
  const doc = {
    get: vi.fn(async () => ({ exists, data: () => userData })),
    set,
  };
  return { db: { collection: vi.fn(() => ({ doc: vi.fn(() => doc) })) }, set };
}

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const locksOpen = {
  shouldSystemWriteProceed: vi.fn(async () => true),
  recordPaymentEventPostDeletion: vi.fn(async () => {}),
};
const RESOLVED = {
  tier: "pro",
  source: "ios_iap",
  expiresAt: "2026-09-20T12:00:00.000Z",
  trialEndsAt: "2026-09-20T12:00:00.000Z",
  autoRenew: true,
  productId: "com.tropos.app.pro.monthly",
  usedTrial: true,
};

function apply(db, overrides = {}) {
  return applyRevenueCatEntitlement({
    db,
    uid: "uid-1",
    resolved: RESOLVED,
    updatedAtSeconds: 1_700_000_100,
    reason: "test",
    providerEventId: "evt_1",
    eventType: "INITIAL_PURCHASE",
    locks: locksOpen,
    reconciliation,
    logger,
    ...overrides,
  });
}

describe("applyRevenueCatEntitlement", () => {
  it("writes tier, source, expiry, trial end and the used-trial flag for a fresh profile", async () => {
    const { db, set } = makeDb({}, { exists: false });
    const result = await apply(db);
    expect(result.applied).toBe(true);
    expect(set).toHaveBeenCalledWith(
      {
        subscriptionTier: "pro",
        subscriptionSource: "ios_iap",
        subscriptionExpiresAt: "2026-09-20T12:00:00.000Z",
        subscriptionTrialEndsAt: "2026-09-20T12:00:00.000Z",
        subscriptionAutoRenew: true,
        subscriptionUpdatedAt: 1_700_000_100,
        appleProductId: "com.tropos.app.pro.monthly",
        hasUsedTrial: true,
      },
      { merge: true }
    );
  });

  it("a deleting account takes no write; the event is logged post-deletion", async () => {
    const { db, set } = makeDb({});
    const locks = {
      shouldSystemWriteProceed: vi.fn(async () => false),
      recordPaymentEventPostDeletion: vi.fn(async () => {}),
    };
    const result = await apply(db, { locks });
    expect(result).toMatchObject({ applied: false, why: "account-deleting" });
    expect(set).not.toHaveBeenCalled();
    expect(locks.recordPaymentEventPostDeletion).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        provider: "revenuecat",
        uid: "uid-1",
        providerEventId: "evt_1",
      })
    );
  });

  it("an event older than the last applied update is ignored", async () => {
    const { db, set } = makeDb({ subscriptionUpdatedAt: 1_700_000_200 });
    const result = await apply(db);
    expect(result).toMatchObject({ applied: false, why: "stale" });
    expect(set).not.toHaveBeenCalled();
  });

  it("a lifetime entitlement is never downgraded by a subscription event", async () => {
    const { db, set } = makeDb({
      planKind: "lifetime",
      subscriptionTier: "pro",
    });
    const result = await apply(db, { resolved: { ...RESOLVED, tier: "free" } });
    expect(result).toMatchObject({ applied: false, why: "lifetime" });
    expect(set).not.toHaveBeenCalled();
  });

  it("Pro on another store is overwritten with a forensic warning, not refused", async () => {
    const { db, set } = makeDb({
      subscriptionTier: "pro",
      subscriptionSource: "stripe",
    });
    const warn = vi.fn();
    const result = await apply(db, { logger: { ...logger, warn } });
    expect(result.applied).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      "revenueCat.cross_platform_conflict",
      expect.objectContaining({ uid: "uid-1", newSource: "ios_iap" })
    );
    expect(set.mock.calls[0][0].subscriptionSource).toBe("ios_iap");
  });

  it("a downgrade nulls the source and the trial end, and keeps the used-trial flag", async () => {
    const { db, set } = makeDb({
      subscriptionTier: "pro",
      subscriptionSource: "ios_iap",
    });
    await apply(db, {
      resolved: {
        ...RESOLVED,
        tier: "free",
        trialEndsAt: null,
        expiresAt: "2026-09-12T12:00:00.000Z",
      },
    });
    expect(set.mock.calls[0][0]).toMatchObject({
      subscriptionTier: "free",
      subscriptionSource: null,
      subscriptionTrialEndsAt: null,
      hasUsedTrial: true,
    });
  });
});
