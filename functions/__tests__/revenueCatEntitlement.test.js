/**
 * RevenueCat → entitlement, the pure decision.
 *
 * Pins the contract the webhook and the sync callable share: which events
 * count, what "live" means, that a TRIAL period yields a trial end (the
 * field the day-5 reminder reads) and marks the trial as used, that
 * anonymous ids and TEST pings write nothing, and that the profile merge
 * is one shape for both paths.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  parseWebhookBody,
  resolveEntitlementFromEvent,
  resolveEntitlementFromSubscriber,
  profileMergeFor,
  sourceForStore,
  isAnonymousAppUserId,
} = require("../lib/revenueCatEntitlement");

const NOW = new Date("2026-09-13T12:00:00Z");
const IN_7_DAYS_MS = NOW.getTime() + 7 * 864e5;
const YESTERDAY_MS = NOW.getTime() - 864e5;

function event(overrides = {}) {
  return {
    id: "evt_1",
    type: "INITIAL_PURCHASE",
    app_user_id: "uid-1",
    product_id: "com.tropos.app.pro.monthly",
    entitlement_ids: ["pro"],
    period_type: "TRIAL",
    purchased_at_ms: NOW.getTime(),
    expiration_at_ms: IN_7_DAYS_MS,
    store: "APP_STORE",
    environment: "SANDBOX",
    event_timestamp_ms: NOW.getTime(),
    ...overrides,
  };
}

describe("parseWebhookBody", () => {
  it("lifts a well-formed event and names what is missing otherwise", () => {
    expect(parseWebhookBody({ api_version: "1.0", event: event() }).ok).toBe(
      true
    );
    expect(parseWebhookBody({}).ok).toBe(false);
    expect(parseWebhookBody({ event: { type: "RENEWAL", id: "e" } })).toEqual({
      ok: false,
      reason: "missing event.app_user_id",
    });
    expect(
      parseWebhookBody({ event: { type: "RENEWAL", app_user_id: "u" } })
    ).toEqual({
      ok: false,
      reason: "missing event.id",
    });
    expect(parseWebhookBody(null).ok).toBe(false);
  });
});

describe("resolveEntitlementFromEvent", () => {
  it("an INITIAL_PURCHASE on a TRIAL period is live Pro with a trial end, and the trial is used", () => {
    const r = resolveEntitlementFromEvent(event(), NOW);
    expect(r).toMatchObject({
      tier: "pro",
      source: "ios_iap",
      expiresAt: new Date(IN_7_DAYS_MS).toISOString(),
      trialEndsAt: new Date(IN_7_DAYS_MS).toISOString(),
      productId: "com.tropos.app.pro.monthly",
      usedTrial: true,
      environment: "SANDBOX",
    });
  });

  it("a RENEWAL on a NORMAL period is live Pro with no trial end — the trial has converted", () => {
    const r = resolveEntitlementFromEvent(
      event({ type: "RENEWAL", period_type: "NORMAL" }),
      NOW
    );
    expect(r.tier).toBe("pro");
    expect(r.trialEndsAt).toBeNull();
    expect(r.usedTrial).toBe(false);
  });

  it("CANCELLATION keeps Pro until the expiry — auto-renew off is not access off", () => {
    const r = resolveEntitlementFromEvent(
      event({ type: "CANCELLATION", period_type: "TRIAL" }),
      NOW
    );
    expect(r.tier).toBe("pro");
    expect(r.trialEndsAt).toBe(new Date(IN_7_DAYS_MS).toISOString());
    expect(r.autoRenew).toBe(false);
  });

  it("auto-renew is on for a renewing live event, back on after UNCANCELLATION, and null with nothing to renew", () => {
    expect(resolveEntitlementFromEvent(event(), NOW).autoRenew).toBe(true);
    expect(
      resolveEntitlementFromEvent(event({ type: "RENEWAL" }), NOW).autoRenew
    ).toBe(true);
    expect(
      resolveEntitlementFromEvent(event({ type: "UNCANCELLATION" }), NOW)
        .autoRenew
    ).toBe(true);
    expect(
      resolveEntitlementFromEvent(event({ type: "EXPIRATION" }), NOW).autoRenew
    ).toBeNull();
    expect(
      resolveEntitlementFromEvent(
        event({ type: "CANCELLATION", expiration_at_ms: YESTERDAY_MS }),
        NOW
      ).autoRenew
    ).toBeNull();
    expect(
      resolveEntitlementFromEvent(event({ expiration_at_ms: null }), NOW)
        .autoRenew
    ).toBeNull();
    expect(
      resolveEntitlementFromEvent(
        event({ type: "NON_RENEWING_PURCHASE", period_type: "NORMAL" }),
        NOW
      ).autoRenew
    ).toBeNull();
  });

  it("EXPIRATION, or an expiry already behind now, is free with no trial end", () => {
    expect(
      resolveEntitlementFromEvent(event({ type: "EXPIRATION" }), NOW)
    ).toMatchObject({
      tier: "free",
      trialEndsAt: null,
    });
    expect(
      resolveEntitlementFromEvent(
        event({
          type: "RENEWAL",
          period_type: "NORMAL",
          expiration_at_ms: YESTERDAY_MS,
        }),
        NOW
      ).tier
    ).toBe("free");
  });

  it("an event without the pro entitlement grants nothing", () => {
    expect(
      resolveEntitlementFromEvent(event({ entitlement_ids: ["other"] }), NOW)
        .tier
    ).toBe("free");
    expect(
      resolveEntitlementFromEvent(event({ entitlement_ids: [] }), NOW).tier
    ).toBe("free");
  });

  it("TEST pings and anonymous ids are not acted on", () => {
    expect(
      resolveEntitlementFromEvent(event({ type: "TEST" }), NOW)
    ).toBeNull();
    expect(
      resolveEntitlementFromEvent(
        event({ app_user_id: "$RCAnonymousID:abc" }),
        NOW
      )
    ).toBeNull();
    expect(isAnonymousAppUserId("$RCAnonymousID:abc")).toBe(true);
    expect(isAnonymousAppUserId("uid-1")).toBe(false);
  });

  it("a missing expiry reads as no expiry (lifetime), still live", () => {
    const r = resolveEntitlementFromEvent(
      event({
        type: "NON_RENEWING_PURCHASE",
        period_type: "NORMAL",
        expiration_at_ms: null,
      }),
      NOW
    );
    expect(r).toMatchObject({
      tier: "pro",
      expiresAt: null,
      trialEndsAt: null,
    });
  });

  it("maps stores to the profile's source vocabulary", () => {
    expect(sourceForStore("APP_STORE")).toBe("ios_iap");
    expect(sourceForStore("PLAY_STORE")).toBe("android_iap");
    expect(sourceForStore("STRIPE")).toBe("stripe");
    expect(sourceForStore("nope")).toBeNull();
  });
});

describe("resolveEntitlementFromSubscriber", () => {
  const subscriber = (overrides = {}) => ({
    entitlements: {
      pro: {
        expires_date: new Date(IN_7_DAYS_MS).toISOString(),
        product_identifier: "com.tropos.app.pro.yearly",
      },
    },
    subscriptions: {
      "com.tropos.app.pro.yearly": {
        period_type: "trial",
        expires_date: new Date(IN_7_DAYS_MS).toISOString(),
        store: "app_store",
      },
    },
    ...overrides,
  });

  it("a live trial subscriber is Pro with a trial end", () => {
    expect(resolveEntitlementFromSubscriber(subscriber(), NOW)).toMatchObject({
      tier: "pro",
      source: "ios_iap",
      trialEndsAt: new Date(IN_7_DAYS_MS).toISOString(),
      productId: "com.tropos.app.pro.yearly",
      usedTrial: true,
    });
  });

  it("a subscriber who turned auto-renew off in the store reads as cancelled; on otherwise", () => {
    expect(resolveEntitlementFromSubscriber(subscriber(), NOW).autoRenew).toBe(
      true
    );
    const off = subscriber({
      subscriptions: {
        "com.tropos.app.pro.yearly": {
          period_type: "trial",
          expires_date: new Date(IN_7_DAYS_MS).toISOString(),
          store: "app_store",
          unsubscribe_detected_at: "2026-09-14T08:00:00Z",
        },
      },
    });
    expect(resolveEntitlementFromSubscriber(off, NOW).autoRenew).toBe(false);
    expect(
      resolveEntitlementFromSubscriber(
        { entitlements: {}, subscriptions: {} },
        NOW
      ).autoRenew
    ).toBeNull();
  });

  it("no pro entitlement is free; an expired one is free but the trial stays used", () => {
    expect(
      resolveEntitlementFromSubscriber(
        { entitlements: {}, subscriptions: {} },
        NOW
      ).tier
    ).toBe("free");
    const lapsed = subscriber({
      entitlements: {
        pro: {
          expires_date: new Date(YESTERDAY_MS).toISOString(),
          product_identifier: "com.tropos.app.pro.yearly",
        },
      },
    });
    const r = resolveEntitlementFromSubscriber(lapsed, NOW);
    expect(r.tier).toBe("free");
    expect(r.trialEndsAt).toBeNull();
    expect(r.usedTrial).toBe(true);
  });

  it("a lifetime entitlement (no expires_date) is live with no expiry", () => {
    const r = resolveEntitlementFromSubscriber(
      subscriber({
        entitlements: {
          pro: { expires_date: null, product_identifier: "lifetime" },
        },
        subscriptions: {},
      }),
      NOW
    );
    expect(r).toMatchObject({
      tier: "pro",
      expiresAt: null,
      trialEndsAt: null,
    });
  });
});

describe("profileMergeFor", () => {
  it("writes the same shape for both paths and only stamps the trial flag when a trial was in play", () => {
    const resolved = resolveEntitlementFromEvent(event(), NOW);
    const merge = profileMergeFor(
      resolved,
      { writeTier: "pro", writeSource: "ios_iap" },
      1_700_000_000
    );
    expect(merge).toEqual({
      subscriptionTier: "pro",
      subscriptionSource: "ios_iap",
      subscriptionExpiresAt: new Date(IN_7_DAYS_MS).toISOString(),
      subscriptionTrialEndsAt: new Date(IN_7_DAYS_MS).toISOString(),
      subscriptionAutoRenew: true,
      subscriptionUpdatedAt: 1_700_000_000,
      appleProductId: "com.tropos.app.pro.monthly",
      hasUsedTrial: true,
    });
    const cancelled = resolveEntitlementFromEvent(
      event({ type: "CANCELLATION" }),
      NOW
    );
    expect(
      profileMergeFor(
        cancelled,
        { writeTier: "pro", writeSource: "ios_iap" },
        1
      )
    ).toMatchObject({ subscriptionAutoRenew: false });
    const normal = resolveEntitlementFromEvent(
      event({ type: "RENEWAL", period_type: "NORMAL" }),
      NOW
    );
    expect(
      profileMergeFor(normal, { writeTier: "pro", writeSource: "ios_iap" }, 1)
    ).not.toHaveProperty("hasUsedTrial");
  });
});
