/**
 * lib/revenueCatEntitlement.js — what a RevenueCat snapshot means for a
 * user's Pro, decided without I/O.
 *
 * The invariants, most costly first:
 *   - A snapshot only takes away Pro that RevenueCat granted. Pro from
 *     Stripe, the legacy Apple path, a lifetime purchase or a hand grant
 *     survives an "inactive" snapshot.
 *   - An older snapshot never overwrites a newer one, so deliveries that
 *     finish out of order cannot resurrect or revoke Pro.
 *   - Billing grace keeps Pro until the grace period ends; a refund or
 *     revocation (an expiry in the past) reads as inactive.
 *   - The webhook secret check fails closed: no secret, no entry.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const rc = require("../lib/revenueCatEntitlement");

const NOW = Date.parse("2026-09-27T12:00:00Z");
const DAY = 86_400_000;
const MONTHLY = "com.tropos.app.pro.monthly";
const iso = (ms) => new Date(ms).toISOString();

/** A GET /v1/subscribers response with one `pro` entitlement. */
function subscriberResponse({
  expires = NOW + 30 * DAY,
  grace = null,
  productId = MONTHLY,
  store = "app_store",
  sandbox = false,
  requestMs = NOW,
  entitlement = true,
} = {}) {
  return {
    request_date: iso(requestMs),
    request_date_ms: requestMs,
    subscriber: {
      original_app_user_id: "uid-1",
      entitlements: entitlement
        ? {
            pro: {
              expires_date: expires === null ? null : iso(expires),
              grace_period_expires_date: grace === null ? null : iso(grace),
              product_identifier: productId,
              purchase_date: iso(NOW - DAY),
            },
          }
        : {},
      subscriptions: {
        [productId]: {
          expires_date: expires === null ? null : iso(expires),
          store,
          is_sandbox: sandbox,
          period_type: "normal",
          unsubscribe_detected_at: null,
          billing_issues_detected_at: grace ? iso(NOW - DAY) : null,
        },
      },
      non_subscriptions: {},
    },
  };
}

const snapshot = (options) => rc.readEntitlement(subscriberResponse(options));

describe("readEntitlement", () => {
  it("reads an active subscription with its expiry, product and store", () => {
    expect(snapshot({ sandbox: true })).toEqual({
      present: true,
      active: true,
      expiresAtMs: NOW + 30 * DAY,
      productId: MONTHLY,
      store: "app_store",
      sandbox: true,
      syncedAtMs: NOW,
    });
  });

  it("keeps Pro through a billing grace period, until the grace ends", () => {
    const inGrace = snapshot({ expires: NOW - DAY, grace: NOW + 3 * DAY });
    expect(inGrace.active).toBe(true);
    expect(inGrace.expiresAtMs).toBe(NOW + 3 * DAY);
    expect(snapshot({ expires: NOW - 5 * DAY, grace: NOW - DAY }).active).toBe(
      false
    );
  });

  it("treats a null expiry as non-expiring", () => {
    const lifetime = snapshot({ expires: null });
    expect(lifetime.active).toBe(true);
    expect(lifetime.expiresAtMs).toBeNull();
  });

  it("reads an expired, refunded or revoked entitlement as inactive", () => {
    const expired = snapshot({ expires: NOW - 1 });
    expect(expired.active).toBe(false);
    expect(expired.present).toBe(true);
    expect(expired.expiresAtMs).toBe(NOW - 1);
  });

  it("judges expiry against RevenueCat's request time, not the server clock", () => {
    // Taken an hour before expiry: active, whatever time it is now.
    expect(snapshot({ expires: NOW + 1000, requestMs: NOW }).active).toBe(true);
    expect(
      snapshot({ expires: NOW + 1000, requestMs: NOW + 2000 }).active
    ).toBe(false);
  });

  it("reports no entitlement when the user has none", () => {
    expect(snapshot({ entitlement: false })).toMatchObject({
      present: false,
      active: false,
    });
  });

  it("finds the store of a one-time purchase", () => {
    const response = subscriberResponse({
      expires: null,
      productId: "lifetime",
    });
    delete response.subscriber.subscriptions.lifetime;
    response.subscriber.non_subscriptions.lifetime = [
      { id: "a", store: "play_store", is_sandbox: false },
      { id: "b", store: "app_store", is_sandbox: true },
    ];
    expect(rc.readEntitlement(response)).toMatchObject({
      store: "app_store",
      sandbox: true,
    });
  });

  it("refuses a response it cannot read rather than guessing", () => {
    const unreadable = [
      null,
      {},
      { request_date_ms: NOW },
      { request_date_ms: "soon", subscriber: {} },
      (() => {
        const r = subscriberResponse();
        r.subscriber.entitlements.pro.expires_date = "next month";
        return r;
      })(),
      (() => {
        const r = subscriberResponse();
        delete r.subscriber.entitlements.pro.expires_date;
        return r;
      })(),
    ];
    for (const response of unreadable) {
      expect(() => rc.readEntitlement(response)).toThrow(
        rc.RevenueCatResponseError
      );
    }
  });
});

describe("planEntitlementWrite", () => {
  const FREE = { subscriptionTier: "free" };
  /** A user RevenueCat made Pro in an earlier snapshot. */
  const rcPro = (overrides = {}) => ({
    subscriptionTier: "pro",
    subscriptionSource: "ios_iap",
    subscriptionExpiresAt: iso(NOW + 5 * DAY),
    revenueCat: {
      entitlementActive: true,
      productId: MONTHLY,
      store: "app_store",
      expiresAt: iso(NOW + 5 * DAY),
      sandbox: false,
      syncedAtMs: NOW - DAY,
    },
    ...overrides,
  });

  it("grants Pro with the platform source and the entitlement's expiry", () => {
    const plan = rc.planEntitlementWrite(FREE, snapshot());
    expect(plan.result).toBe("granted");
    expect(plan.conflict).toBe(false);
    expect(plan.write).toEqual({
      subscriptionTier: "pro",
      subscriptionSource: "ios_iap",
      subscriptionExpiresAt: iso(NOW + 30 * DAY),
      revenueCat: {
        entitlementActive: true,
        productId: MONTHLY,
        store: "app_store",
        expiresAt: iso(NOW + 30 * DAY),
        sandbox: false,
        syncedAtMs: NOW,
      },
    });
  });

  it("writes no expiry for a non-expiring entitlement", () => {
    const plan = rc.planEntitlementWrite(FREE, snapshot({ expires: null }));
    expect(plan.write.subscriptionTier).toBe("pro");
    expect(plan.write.subscriptionExpiresAt).toBeNull();
  });

  it("maps each platform store to its source", () => {
    for (const [store, source] of [
      ["app_store", "ios_iap"],
      ["mac_app_store", "ios_iap"],
      ["play_store", "android_iap"],
      ["stripe", "stripe"],
      ["rc_billing", "stripe"],
    ]) {
      expect(
        rc.planEntitlementWrite(FREE, snapshot({ store })).write
          .subscriptionSource
      ).toBe(source);
    }
  });

  it("records a grant from a store the app cannot manage without changing the tier", () => {
    for (const store of ["promotional", "amazon", null]) {
      const plan = rc.planEntitlementWrite(FREE, snapshot({ store }));
      expect(plan.result).toBe("unsupported-store");
      expect(Object.keys(plan.write)).toEqual(["revenueCat"]);
    }
  });

  it("flags a purchase over Pro from another platform, and the new purchase wins", () => {
    const plan = rc.planEntitlementWrite(
      { subscriptionTier: "pro", subscriptionSource: "stripe" },
      snapshot()
    );
    expect(plan.result).toBe("granted");
    expect(plan.conflict).toBe(true);
    expect(plan.write.subscriptionSource).toBe("ios_iap");
  });

  it("renews: a later expiry replaces the stored one", () => {
    const plan = rc.planEntitlementWrite(
      rcPro(),
      snapshot({ expires: NOW + 35 * DAY })
    );
    expect(plan.write.subscriptionExpiresAt).toBe(iso(NOW + 35 * DAY));
    expect(plan.conflict).toBe(false);
  });

  it("revokes Pro that RevenueCat granted once the entitlement lapses", () => {
    const plan = rc.planEntitlementWrite(
      rcPro(),
      snapshot({ expires: NOW - DAY })
    );
    expect(plan.result).toBe("revoked");
    expect(plan.write).toMatchObject({
      subscriptionTier: "free",
      subscriptionSource: null,
      subscriptionExpiresAt: iso(NOW - DAY),
      revenueCat: { entitlementActive: false, syncedAtMs: NOW },
    });
  });

  it("revokes when the entitlement is gone altogether", () => {
    const plan = rc.planEntitlementWrite(
      rcPro(),
      snapshot({ entitlement: false })
    );
    expect(plan.result).toBe("revoked");
    expect(plan.write.subscriptionTier).toBe("free");
  });

  it("never takes away Pro that another path granted", () => {
    const inactive = snapshot({ expires: NOW - DAY });
    const cases = {
      stripe: { subscriptionTier: "pro", subscriptionSource: "stripe" },
      "legacy Apple path": {
        subscriptionTier: "pro",
        subscriptionSource: "ios_iap",
      },
      "granted by hand": { subscriptionTier: "pro" },
      "another source since": rcPro({ subscriptionSource: "stripe" }),
      "RevenueCat already inactive": rcPro({
        revenueCat: { ...rcPro().revenueCat, entitlementActive: false },
      }),
    };
    for (const [name, userData] of Object.entries(cases)) {
      const plan = rc.planEntitlementWrite(userData, inactive);
      expect(plan.result, name).toBe("not-ours");
      expect(Object.keys(plan.write), name).toEqual(["revenueCat"]);
    }
  });

  it("leaves a lifetime purchase alone either way", () => {
    for (const s of [snapshot(), snapshot({ expires: NOW - DAY })]) {
      const plan = rc.planEntitlementWrite(rcPro({ planKind: "lifetime" }), s);
      expect(plan.result).toBe("lifetime");
      expect(Object.keys(plan.write)).toEqual(["revenueCat"]);
    }
  });

  it("ignores a snapshot older than the one already written", () => {
    const stored = rcPro({
      revenueCat: { ...rcPro().revenueCat, syncedAtMs: NOW + 1 },
    });
    expect(
      rc.planEntitlementWrite(stored, snapshot({ expires: NOW - DAY }))
    ).toEqual({
      write: null,
      result: "stale",
    });
  });

  it("writes the same bytes for the same snapshot, so a replay changes nothing", () => {
    const first = rc.planEntitlementWrite(FREE, snapshot());
    const second = rc.planEntitlementWrite(
      { ...FREE, ...first.write },
      snapshot()
    );
    expect(second.write).toEqual(first.write);
    expect(second.conflict).toBe(false);
  });
});

describe("uidsForEvent", () => {
  it("re-reads the purchaser", () => {
    expect(rc.uidsForEvent({ type: "RENEWAL", app_user_id: "uid-1" })).toEqual([
      "uid-1",
    ]);
  });

  it("re-reads both sides of a transfer", () => {
    expect(
      rc.uidsForEvent({
        type: "TRANSFER",
        app_user_id: "ignored",
        transferred_from: ["uid-old", "$RCAnonymousID:abc"],
        transferred_to: ["uid-new", "uid-old"],
      })
    ).toEqual(["uid-old", "uid-new"]);
  });

  it("drops ids that cannot be a Firebase uid", () => {
    for (const id of [
      "$RCAnonymousID:1234",
      "",
      "a/b",
      ".",
      "..",
      "__meta__",
      "x".repeat(129),
      42,
      null,
    ]) {
      expect(
        rc.uidsForEvent({ type: "INITIAL_PURCHASE", app_user_id: id })
      ).toEqual([]);
    }
  });
});

describe("isAuthorized", () => {
  const SECRET = "rc-webhook-secret-value";

  it("accepts the secret bare or as a bearer token", () => {
    expect(rc.isAuthorized(SECRET, SECRET)).toBe(true);
    expect(rc.isAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("refuses a wrong, partial or missing header", () => {
    for (const header of [
      undefined,
      "",
      "Bearer",
      `${SECRET}x`,
      SECRET.slice(0, -1),
      `bearer ${SECRET}`,
    ]) {
      expect(rc.isAuthorized(header, SECRET)).toBe(false);
    }
  });

  it("refuses everything when the secret is not provisioned", () => {
    expect(rc.isAuthorized("", "")).toBe(false);
    expect(rc.isAuthorized("Bearer ", "")).toBe(false);
    expect(rc.isAuthorized("anything", undefined)).toBe(false);
  });
});
