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
 *   - A sandbox purchase is free, so it grants Pro only to a uid on
 *     REVENUECAT_SANDBOX_UIDS. For anyone else it counts as no entitlement,
 *     and an unset or empty list grants it to nobody.
 *   - The webhook secret check fails closed: no secret, no entry.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
    expect(snapshot()).toEqual({
      present: true,
      active: true,
      expiresAtMs: NOW + 30 * DAY,
      productId: MONTHLY,
      store: "app_store",
      sandbox: false,
      syncedAtMs: NOW,
    });
  });

  it("marks a sandbox purchase and leaves what it is worth to planEntitlementWrite", () => {
    // What a sandbox purchase grants depends on whose it is; the sandbox
    // block under planEntitlementWrite pins that.
    expect(snapshot({ sandbox: true })).toMatchObject({
      store: "app_store",
      sandbox: true,
    });
  });

  it("reads a purchase as production only when RevenueCat says so", () => {
    for (const flag of [undefined, null, "false", 0]) {
      const response = subscriberResponse();
      const purchase = response.subscriber.subscriptions[MONTHLY];
      if (flag === undefined) delete purchase.is_sandbox;
      else purchase.is_sandbox = flag;
      expect(rc.readEntitlement(response).sandbox, String(flag)).toBe(true);
    }
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

  describe("sandbox purchases", () => {
    const sandbox = (options) => snapshot({ sandbox: true, ...options });
    const LISTED = { sandboxAllowed: true };

    it("grant Pro when the uid is on the list", () => {
      const plan = rc.planEntitlementWrite(FREE, sandbox(), LISTED);
      expect(plan.result).toBe("granted");
      expect(plan.sandboxRefused).toBeUndefined();
      expect(plan.write).toMatchObject({
        subscriptionTier: "pro",
        subscriptionSource: "ios_iap",
        subscriptionExpiresAt: iso(NOW + 30 * DAY),
        revenueCat: { entitlementActive: true, sandbox: true },
      });
    });

    it("grant nothing to anyone else, and say they were refused", () => {
      // Only `true` lets one through: a missing option fails closed.
      for (const options of [
        undefined,
        {},
        { sandboxAllowed: false },
        { sandboxAllowed: "true" },
        { sandboxAllowed: 1 },
      ]) {
        const name = JSON.stringify(options);
        const plan = rc.planEntitlementWrite(FREE, sandbox(), options);
        expect(plan.result, name).toBe("not-ours");
        expect(plan.sandboxRefused, name).toBe(true);
        expect(plan.write, name).toEqual({
          revenueCat: {
            entitlementActive: false,
            productId: MONTHLY,
            store: "app_store",
            expiresAt: iso(NOW + 30 * DAY),
            sandbox: true,
            syncedAtMs: NOW,
          },
        });
      }
    });

    it("leave Pro from another source alone", () => {
      const cases = {
        stripe: { subscriptionTier: "pro", subscriptionSource: "stripe" },
        "legacy Apple path": {
          subscriptionTier: "pro",
          subscriptionSource: "ios_iap",
        },
        "granted by hand": { subscriptionTier: "pro" },
        lifetime: rcPro({ planKind: "lifetime" }),
      };
      for (const [name, userData] of Object.entries(cases)) {
        const plan = rc.planEntitlementWrite(userData, sandbox());
        expect(plan.sandboxRefused, name).toBe(true);
        expect(Object.keys(plan.write), name).toEqual(["revenueCat"]);
        expect(plan.write.revenueCat.entitlementActive, name).toBe(false);
      }
    });

    it("do not make RevenueCat the owner of Pro it never granted", () => {
      // Legacy Apple Pro, then a refused sandbox purchase, then that
      // purchase lapsing. Had the refusal been recorded as an active
      // entitlement, the lapse would take the Apple Pro away.
      const legacyApple = {
        subscriptionTier: "pro",
        subscriptionSource: "ios_iap",
      };
      const refusal = rc.planEntitlementWrite(legacyApple, sandbox());
      const lapse = rc.planEntitlementWrite(
        { ...legacyApple, ...refusal.write },
        sandbox({ expires: NOW + DAY, requestMs: NOW + 2 * DAY })
      );
      expect(lapse.result).toBe("not-ours");
      expect(Object.keys(lapse.write)).toEqual(["revenueCat"]);
    });

    it("take back the Pro a sandbox purchase gave once the uid is off the list", () => {
      const tester = rcPro({
        revenueCat: { ...rcPro().revenueCat, sandbox: true },
      });
      const plan = rc.planEntitlementWrite(tester, sandbox());
      expect(plan.result).toBe("revoked");
      expect(plan.sandboxRefused).toBe(true);
      expect(plan.write).toMatchObject({
        subscriptionTier: "free",
        subscriptionSource: null,
        subscriptionExpiresAt: null,
        revenueCat: { entitlementActive: false, sandbox: true },
      });
    });

    it("are not refused once they have lapsed anyway", () => {
      const plan = rc.planEntitlementWrite(
        FREE,
        sandbox({ expires: NOW - DAY })
      );
      expect(plan.result).toBe("not-ours");
      expect(plan.sandboxRefused).toBeUndefined();
    });

    it("change nothing for a production purchase, listed or not", () => {
      for (const options of [undefined, { sandboxAllowed: false }, LISTED]) {
        const name = JSON.stringify(options);
        const plan = rc.planEntitlementWrite(FREE, snapshot(), options);
        expect(plan.result, name).toBe("granted");
        expect(plan.sandboxRefused, name).toBeUndefined();
        expect(plan.write.subscriptionTier, name).toBe("pro");
        expect(plan.write.revenueCat.entitlementActive, name).toBe(true);
      }
    });
  });
});

describe("the sandbox allow-list (REVENUECAT_SANDBOX_UIDS)", () => {
  const original = process.env.REVENUECAT_SANDBOX_UIDS;
  beforeEach(() => {
    delete process.env.REVENUECAT_SANDBOX_UIDS;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.REVENUECAT_SANDBOX_UIDS;
    else process.env.REVENUECAT_SANDBOX_UIDS = original;
  });

  it("is empty when unset or blank, so nobody's sandbox purchase counts", () => {
    for (const value of [undefined, "", "   ", ",", " , ,"]) {
      if (value === undefined) delete process.env.REVENUECAT_SANDBOX_UIDS;
      else process.env.REVENUECAT_SANDBOX_UIDS = value;
      const name = JSON.stringify(value);
      expect(rc.getSandboxUidAllowlist().size, name).toBe(0);
      expect(rc.isSandboxAllowedUid("uid-owner"), name).toBe(false);
    }
  });

  it("trims each entry and drops empty ones", () => {
    process.env.REVENUECAT_SANDBOX_UIDS = " uid-owner , ,uid-review ,";
    expect([...rc.getSandboxUidAllowlist()]).toEqual([
      "uid-owner",
      "uid-review",
    ]);
    expect(rc.isSandboxAllowedUid("uid-owner")).toBe(true);
    expect(rc.isSandboxAllowedUid("uid-review")).toBe(true);
  });

  it("matches whole uids only", () => {
    process.env.REVENUECAT_SANDBOX_UIDS = "uid-owner";
    for (const uid of ["uid-other", "uid-owne", "uid-owner2", " uid-owner"]) {
      expect(rc.isSandboxAllowedUid(uid), uid).toBe(false);
    }
  });

  it("refuses anything that is not a non-empty string", () => {
    process.env.REVENUECAT_SANDBOX_UIDS = "undefined,null,42";
    for (const uid of [undefined, null, 42, "", {}]) {
      expect(rc.isSandboxAllowedUid(uid), String(uid)).toBe(false);
    }
  });

  it("reads the environment on every call", () => {
    process.env.REVENUECAT_SANDBOX_UIDS = "uid-owner";
    expect(rc.isSandboxAllowedUid("uid-owner")).toBe(true);
    process.env.REVENUECAT_SANDBOX_UIDS = "uid-review";
    expect(rc.isSandboxAllowedUid("uid-owner")).toBe(false);
    expect(rc.isSandboxAllowedUid("uid-review")).toBe(true);
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
