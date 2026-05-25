/**
 * Sub1 P2 — `resolveSubscriptionUpdate` contract pins.
 *
 * Behaviours pinned (locked design = Sub1b → C, pins #2 + #3):
 *   1. Tracer — Pro write on a fresh user records both tier + source
 *      and reports no conflict.
 *   2. Same-source renewal — Pro/stripe overwriting Pro/stripe is
 *      not a conflict (subscription update event mid-stream).
 *   3. Cross-platform — Pro/ios_iap arriving while user already has
 *      Pro/stripe IS a conflict; the new source wins (Pro/ios_iap
 *      writes) but `conflict: true` + reason is surfaced to the
 *      caller so the alert layer can log + notify ops for forensic
 *      review + manual refund of the older Stripe sub.
 *   4. Cross-platform inverse — Pro/stripe arriving while user has
 *      Pro/ios_iap is also a conflict (symmetry).
 *   5. Downgrades never conflict — incomingTier="free" applies
 *      regardless of source state and nulls the source field.
 *   6. Input validation — invalid `incomingTier` throws.
 *   7. Input validation — Pro write without a valid `incomingSource`
 *      throws (defensive: every Pro write must be platform-tagged
 *      so the cross-platform guard can do its job).
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

describe("resolveSubscriptionUpdate", () => {
  it("Cycle 1 (tracer): Pro/stripe on a fresh user writes both tier + source, no conflict", () => {
    const {
      resolveSubscriptionUpdate,
      SOURCE_STRIPE,
    } = require("../lib/subscriptionReconciliation");
    const result = resolveSubscriptionUpdate({
      currentTier: undefined,
      currentSource: undefined,
      incomingTier: "pro",
      incomingSource: SOURCE_STRIPE,
    });
    expect(result.writeTier).toBe("pro");
    expect(result.writeSource).toBe("stripe");
    expect(result.conflict).toBe(false);
    expect(result.conflictReason).toBeNull();
  });

  it("Cycle 2: same-source renewal (Pro/stripe → Pro/stripe) is not a conflict", () => {
    const {
      resolveSubscriptionUpdate,
      SOURCE_STRIPE,
    } = require("../lib/subscriptionReconciliation");
    const result = resolveSubscriptionUpdate({
      currentTier: "pro",
      currentSource: SOURCE_STRIPE,
      incomingTier: "pro",
      incomingSource: SOURCE_STRIPE,
    });
    expect(result.conflict).toBe(false);
    expect(result.writeSource).toBe("stripe");
  });

  it("Cycle 3 (cross-platform): Pro/ios_iap arriving while user has Pro/stripe is a conflict; new source wins", () => {
    const {
      resolveSubscriptionUpdate,
      SOURCE_STRIPE,
      SOURCE_IOS_IAP,
    } = require("../lib/subscriptionReconciliation");
    const result = resolveSubscriptionUpdate({
      currentTier: "pro",
      currentSource: SOURCE_STRIPE,
      incomingTier: "pro",
      incomingSource: SOURCE_IOS_IAP,
    });
    expect(result.writeTier).toBe("pro");
    expect(result.writeSource).toBe("ios_iap"); // new platform wins
    expect(result.conflict).toBe(true);
    expect(result.conflictReason).toMatch(/stored=stripe/);
    expect(result.conflictReason).toMatch(/incoming=ios_iap/);
  });

  it("Cycle 4 (cross-platform inverse): Pro/stripe arriving while user has Pro/ios_iap is a conflict", () => {
    const {
      resolveSubscriptionUpdate,
      SOURCE_STRIPE,
      SOURCE_IOS_IAP,
    } = require("../lib/subscriptionReconciliation");
    const result = resolveSubscriptionUpdate({
      currentTier: "pro",
      currentSource: SOURCE_IOS_IAP,
      incomingTier: "pro",
      incomingSource: SOURCE_STRIPE,
    });
    expect(result.writeSource).toBe("stripe"); // new platform wins
    expect(result.conflict).toBe(true);
    expect(result.conflictReason).toMatch(/stored=ios_iap/);
    expect(result.conflictReason).toMatch(/incoming=stripe/);
  });

  it("Cycle 5 (downgrade): incomingTier=free applies regardless of source and nulls source", () => {
    const {
      resolveSubscriptionUpdate,
      SOURCE_STRIPE,
    } = require("../lib/subscriptionReconciliation");
    // Pro/stripe → free/any — typical Stripe cancellation webhook.
    const result = resolveSubscriptionUpdate({
      currentTier: "pro",
      currentSource: SOURCE_STRIPE,
      incomingTier: "free",
      incomingSource: SOURCE_STRIPE,
    });
    expect(result.writeTier).toBe("free");
    expect(result.writeSource).toBeNull();
    expect(result.conflict).toBe(false);
  });

  it("Cycle 5 guard: free→free is a no-op shape (still no conflict, source nulled)", () => {
    const {
      resolveSubscriptionUpdate,
    } = require("../lib/subscriptionReconciliation");
    const result = resolveSubscriptionUpdate({
      currentTier: "free",
      currentSource: undefined,
      incomingTier: "free",
      incomingSource: undefined,
    });
    expect(result.writeTier).toBe("free");
    expect(result.writeSource).toBeNull();
    expect(result.conflict).toBe(false);
  });

  it("Cycle 6 (validation): invalid incomingTier throws", () => {
    const {
      resolveSubscriptionUpdate,
      SOURCE_STRIPE,
    } = require("../lib/subscriptionReconciliation");
    expect(() =>
      resolveSubscriptionUpdate({
        currentTier: "free",
        currentSource: undefined,
        incomingTier: "trial",
        incomingSource: SOURCE_STRIPE,
      })
    ).toThrow(/incomingTier/);
  });

  it("Cycle 7 (validation): Pro write without a valid incomingSource throws", () => {
    const {
      resolveSubscriptionUpdate,
    } = require("../lib/subscriptionReconciliation");
    expect(() =>
      resolveSubscriptionUpdate({
        currentTier: "free",
        currentSource: undefined,
        incomingTier: "pro",
        incomingSource: "paypal",
      })
    ).toThrow(/incomingSource/);
    expect(() =>
      resolveSubscriptionUpdate({
        currentTier: "free",
        currentSource: undefined,
        incomingTier: "pro",
        incomingSource: undefined,
      })
    ).toThrow(/incomingSource/);
  });
});
