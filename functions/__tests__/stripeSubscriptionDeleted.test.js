/**
 * TDD pins for the Stripe `customer.subscription.deleted` source-ownership
 * guard (2026-07-09 money-path audit, finding F3 — Stripe→Apple migration
 * strips Pro from a paying user).
 *
 * The exploit: a Stripe-Pro user buys Apple IAP; the Apple write sets
 * subscriptionSource='ios_iap' but leaves stripeSubscriptionId set and does not
 * bump subscriptionUpdatedAt. The displaced Stripe sub is auto-cancelled →
 * customer.subscription.deleted fires. Pre-fix the id-match + staleness guards
 * both passed and the handler stripped the freshly-purchased Apple Pro to free.
 * The source-ownership guard refuses the downgrade when the entitlement is no
 * longer Stripe's.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  shouldIgnoreSubscriptionDeleted,
} = require("../lib/stripeSubscriptionDeleted");

describe("shouldIgnoreSubscriptionDeleted", () => {
  it("DOWNGRADES a genuine Stripe cancel (source=stripe, id matches, fresh event)", () => {
    const res = shouldIgnoreSubscriptionDeleted({
      userData: {
        subscriptionSource: "stripe",
        stripeSubscriptionId: "sub_X",
        subscriptionUpdatedAt: 1000,
      },
      subscriptionId: "sub_X",
      eventCreated: 2000,
    });
    expect(res).toEqual({ ignore: false, reason: null });
  });

  it("IGNORES the displaced Stripe cancel after an Apple migration (F3 — the fix)", () => {
    // Post-migration doc: source flipped to ios_iap, but stripeSubscriptionId
    // still set and subscriptionUpdatedAt NOT bumped — so id-match + staleness
    // both pass. Only the source guard saves the Apple Pro.
    const res = shouldIgnoreSubscriptionDeleted({
      userData: {
        subscriptionSource: "ios_iap",
        stripeSubscriptionId: "sub_X",
        subscriptionUpdatedAt: 1000,
      },
      subscriptionId: "sub_X",
      eventCreated: 2000,
    });
    expect(res.ignore).toBe(true);
    expect(res.reason).toBe("owned-by-ios_iap");
  });

  it("still DOWNGRADES a legacy Stripe-era doc with no source field (falsy source = Stripe-owned)", () => {
    const res = shouldIgnoreSubscriptionDeleted({
      userData: {
        stripeSubscriptionId: "sub_X",
        subscriptionUpdatedAt: 1000,
      },
      subscriptionId: "sub_X",
      eventCreated: 2000,
    });
    expect(res).toEqual({ ignore: false, reason: null });
  });

  it("IGNORES a lifetime entitlement", () => {
    const res = shouldIgnoreSubscriptionDeleted({
      userData: { planKind: "lifetime", subscriptionSource: "stripe" },
      subscriptionId: "sub_X",
      eventCreated: 2000,
    });
    expect(res).toEqual({ ignore: true, reason: "lifetime" });
  });

  it("IGNORES when the stored subscription id differs (a different sub was cancelled)", () => {
    const res = shouldIgnoreSubscriptionDeleted({
      userData: {
        subscriptionSource: "stripe",
        stripeSubscriptionId: "sub_CURRENT",
        subscriptionUpdatedAt: 1000,
      },
      subscriptionId: "sub_OLD",
      eventCreated: 2000,
    });
    expect(res).toEqual({ ignore: true, reason: "sub-id-mismatch" });
  });

  it("IGNORES a stale event (a newer update already landed)", () => {
    const res = shouldIgnoreSubscriptionDeleted({
      userData: {
        subscriptionSource: "stripe",
        stripeSubscriptionId: "sub_X",
        subscriptionUpdatedAt: 5000,
      },
      subscriptionId: "sub_X",
      eventCreated: 2000,
    });
    expect(res).toEqual({ ignore: true, reason: "stale" });
  });

  it("IGNORES when there is no stored user data (defensive)", () => {
    const res = shouldIgnoreSubscriptionDeleted({
      userData: null,
      subscriptionId: "sub_X",
      eventCreated: 2000,
    });
    expect(res).toEqual({ ignore: true, reason: "no-user" });
  });
});
