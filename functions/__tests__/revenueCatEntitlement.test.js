/**
 * Pure-helper tests for the RevenueCat entitlement pipeline (slice 3).
 *
 * These are the decisions that cannot be checked on a sandbox device
 * without also having a sandbox device: what counts as entitled, what a
 * grace period does, and which platform a grant is attributed to. Every
 * case below fails if its guard is deleted — the point of the suite is
 * that the resolution rules are pinned, not that they are exercised.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  constantTimeEquals,
  parseWebhookEnvelope,
  entitlementFromSubscriber,
  sourceForEntitlement,
  eventLedgerClaim,
  FALLBACK_SOURCE,
} = require("../lib/revenueCatEntitlement");
const { hashedUidPrefix } = require("../lib/accountDeletionMinimisation");

const NOW = new Date("2026-09-19T12:00:00.000Z");
const FUTURE = "2026-10-19T12:00:00.000Z";
const PAST = "2026-08-19T12:00:00.000Z";

/** A subscriber with a `pro` entitlement on an App Store subscription. */
function subscriberWith(entitlement, subscriptions = {}) {
  return {
    entitlements: entitlement ? { pro: entitlement } : {},
    subscriptions,
  };
}

describe("constantTimeEquals", () => {
  it("accepts an exact match and rejects a near miss of equal length", () => {
    expect(constantTimeEquals("s3cr3t-value", "s3cr3t-value")).toBe(true);
    expect(constantTimeEquals("s3cr3t-value", "s3cr3t-valuX")).toBe(false);
  });

  it("rejects a prefix, which is what a length-only check would accept", () => {
    expect(constantTimeEquals("s3cr3t", "s3cr3t-value")).toBe(false);
    expect(constantTimeEquals("", "s3cr3t-value")).toBe(false);
  });

  it("rejects non-strings rather than coercing them", () => {
    /* A missing header arrives as undefined. Coercion would turn two
       missing values into a match and authenticate an anonymous POST. */
    expect(constantTimeEquals(undefined, undefined)).toBe(false);
    expect(constantTimeEquals(null, null)).toBe(false);
  });
});

describe("parseWebhookEnvelope", () => {
  it("reads the fields the handler acts on", () => {
    const parsed = parseWebhookEnvelope({
      api_version: "1.0",
      event: {
        id: "evt_1",
        type: "RENEWAL",
        app_user_id: "uid-1",
        store: "APP_STORE",
        environment: "PRODUCTION",
        event_timestamp_ms: 1758283200000,
      },
    });
    expect(parsed).toMatchObject({
      eventId: "evt_1",
      appUserId: "uid-1",
      type: "RENEWAL",
      environment: "PRODUCTION",
    });
  });

  it("returns null for a body with no usable identity", () => {
    /* Each of these would otherwise reach the idempotency claim and
       write a revenueCatEvents doc keyed on undefined. */
    expect(parseWebhookEnvelope(null)).toBeNull();
    expect(parseWebhookEnvelope({})).toBeNull();
    expect(parseWebhookEnvelope({ event: {} })).toBeNull();
    expect(parseWebhookEnvelope({ event: { id: "evt_1" } })).toBeNull();
    expect(
      parseWebhookEnvelope({ event: { app_user_id: "uid-1" } })
    ).toBeNull();
    expect(
      parseWebhookEnvelope({ event: { id: "evt_1", app_user_id: "" } })
    ).toBeNull();
  });
});

describe("entitlementFromSubscriber", () => {
  it("treats an absent entitlement as revoked", () => {
    /* RevenueCat drops the key rather than marking it inactive, so this
       IS the downgrade signal — there is no inactive-but-present state
       to read. */
    const result = entitlementFromSubscriber(subscriberWith(null), NOW);
    expect(result.isActive).toBe(false);
    expect(result.expiresAt).toBeNull();
  });

  it("is active until the expiry and not after it", () => {
    const live = entitlementFromSubscriber(
      subscriberWith({ expires_date: FUTURE, product_identifier: "p" }),
      NOW
    );
    expect(live.isActive).toBe(true);
    expect(live.expiresAt).toBe(FUTURE);

    const lapsed = entitlementFromSubscriber(
      subscriberWith({ expires_date: PAST, product_identifier: "p" }),
      NOW
    );
    expect(lapsed.isActive).toBe(false);
    expect(lapsed.expiresAt).toBe(PAST);
  });

  it("treats a present entitlement with no expiry as active forever", () => {
    /* The documented no-expiration case (lifetime, or a dashboard comp).
       `expiresAt: null` is what helpers.js computeEffectiveTier reads as
       active — writing an epoch here would expire a lifetime grant. */
    const result = entitlementFromSubscriber(
      subscriberWith({
        expires_date: null,
        grace_period_expires_date: null,
        product_identifier: "p",
      }),
      NOW
    );
    expect(result.isActive).toBe(true);
    expect(result.expiresAt).toBeNull();
  });

  it("keeps the user entitled through a billing-retry grace period", () => {
    /* The paid term has lapsed but the store has not given up. Cutting
       access here would dun a user mid-retry for a card their bank is
       still deciding about. */
    const result = entitlementFromSubscriber(
      subscriberWith({
        expires_date: PAST,
        grace_period_expires_date: FUTURE,
        product_identifier: "p",
      }),
      NOW
    );
    expect(result.isActive).toBe(true);
    expect(result.expiresAt).toBe(FUTURE);
  });

  it("reads the store off the subscription the entitlement names", () => {
    const result = entitlementFromSubscriber(
      subscriberWith(
        {
          expires_date: FUTURE,
          product_identifier: "com.tropos.app.pro.yearly",
        },
        {
          "com.tropos.app.pro.yearly": { store: "play_store" },
          "some.other.product": { store: "stripe" },
        }
      ),
      NOW
    );
    expect(result.store).toBe("play_store");
  });
});

describe("sourceForEntitlement", () => {
  it("maps each store to the platform that manages the subscription", () => {
    const at = (store) =>
      sourceForEntitlement({ isActive: true, store, expiresAt: FUTURE });
    expect(at("app_store")).toBe("ios_iap");
    expect(at("play_store")).toBe("android_iap");
    expect(at("stripe")).toBe("stripe");
  });

  it("falls back for a grant with no classifiable store", () => {
    /* A dashboard promotional grant carries no subscription and so no
       store. ADR-0006 locks v1 as iOS-only, so App Store is the only
       store this project transacts through and the fallback is factual
       rather than a guess. Revisit when Android lands. */
    const promo = { isActive: true, store: null, expiresAt: FUTURE };
    expect(sourceForEntitlement(promo)).toBe(FALLBACK_SOURCE);
    expect(sourceForEntitlement({ ...promo, store: "some_future_store" })).toBe(
      FALLBACK_SOURCE
    );
  });

  it("returns null for an inactive entitlement", () => {
    /* resolveSubscriptionUpdate nulls the source on a downgrade and
       throws if handed one for a non-pro write. Returning a source here
       would push a valid-looking value into a path that must not have
       one. */
    expect(
      sourceForEntitlement({ isActive: false, store: "app_store" })
    ).toBeNull();
  });
});

describe("eventLedgerClaim", () => {
  it("records the event without the user's id", () => {
    /* stripeEvents carries no identifier and appleSubscriptions is swept
       on account deletion; this ledger is neither swept nor keyed by
       user, so the uid must not be in it. The hashed prefix is what the
       post-deletion payment log already records, so the two stay
       correlatable by the same key. */
    const claim = eventLedgerClaim({
      type: "RENEWAL",
      store: "APP_STORE",
      appUserId: "uid-1",
    });
    expect(claim).toEqual({
      type: "RENEWAL",
      store: "APP_STORE",
      hashedUidPrefix: hashedUidPrefix("uid-1"),
    });
    expect(JSON.stringify(claim)).not.toContain("uid-1");
  });

  it("stores a missing store as null rather than dropping the key", () => {
    /* A dashboard grant arrives with no store. The ledger's shape should
       not vary by event, or an operator query on the field misses rows. */
    expect(
      eventLedgerClaim({
        type: "NON_RENEWING_PURCHASE",
        store: null,
        appUserId: "u",
      }).store
    ).toBeNull();
  });
});
