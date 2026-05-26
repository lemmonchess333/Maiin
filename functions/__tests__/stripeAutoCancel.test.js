/**
 * Sub1 P2.5 — `cancelDisplacedStripeSub` contract pins.
 *
 * Pinned behaviours (lock: Sub1b pin #2, deferred from PR #756):
 *
 *   1. Tracer — user with `stripeSubscriptionId` triggers
 *      `stripe.subscriptions.cancel(id, { prorate: true })`.
 *   2. User with no `stripeSubscriptionId` → no-op (no Stripe call).
 *   3. User doc missing entirely → no-op.
 *   4. Stripe `resource_missing` (already cancelled / never existed)
 *      → treated as success.
 *   5. Any other Stripe error → throws. Caller's job to log + not
 *      block the IAP success path.
 *   6. Required-args validation — missing stripe / firestore / uid
 *      throws.
 *   7. Cancel always passes `prorate: true` — pinned so future
 *      refactors can't silently drop the credit-note semantics.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function makeFirestoreStub({ userData = {}, missing = false } = {}) {
  return {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn(async () => ({
          exists: !missing,
          data: () => (missing ? null : userData),
        })),
      })),
    })),
  };
}

function makeStripeStub({ cancelImpl } = {}) {
  const cancel = vi.fn(
    cancelImpl || (async () => ({ id: "sub_test", status: "canceled" }))
  );
  return {
    stripe: { subscriptions: { cancel } },
    cancel,
  };
}

describe("cancelDisplacedStripeSub", () => {
  it("Cycle 1 (tracer): user with stripeSubscriptionId triggers cancel with prorate:true", async () => {
    const { cancelDisplacedStripeSub } = require("../lib/stripeAutoCancel");
    const firestore = makeFirestoreStub({
      userData: { stripeSubscriptionId: "sub_abc" },
    });
    const { stripe, cancel } = makeStripeStub();
    const result = await cancelDisplacedStripeSub({
      stripe,
      firestore,
      uid: "uid_alice",
    });
    expect(result.canceled).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith("sub_abc", { prorate: true });
  });

  it("Cycle 2: no stripeSubscriptionId → no-op, no Stripe call", async () => {
    const { cancelDisplacedStripeSub } = require("../lib/stripeAutoCancel");
    const firestore = makeFirestoreStub({ userData: {} });
    const { stripe, cancel } = makeStripeStub();
    const result = await cancelDisplacedStripeSub({
      stripe,
      firestore,
      uid: "uid_bob",
    });
    expect(result.canceled).toBe(false);
    expect(result.reason).toBe("no-stripe-sub-id");
    expect(cancel).not.toHaveBeenCalled();
  });

  it("Cycle 3: missing user doc → no-op", async () => {
    const { cancelDisplacedStripeSub } = require("../lib/stripeAutoCancel");
    const firestore = makeFirestoreStub({ missing: true });
    const { stripe, cancel } = makeStripeStub();
    const result = await cancelDisplacedStripeSub({
      stripe,
      firestore,
      uid: "uid_carol",
    });
    expect(result.canceled).toBe(false);
    expect(result.reason).toBe("no-user-doc");
    expect(cancel).not.toHaveBeenCalled();
  });

  it("Cycle 4: Stripe resource_missing (already cancelled) → treated as success", async () => {
    const { cancelDisplacedStripeSub } = require("../lib/stripeAutoCancel");
    const firestore = makeFirestoreStub({
      userData: { stripeSubscriptionId: "sub_gone" },
    });
    const { stripe } = makeStripeStub({
      cancelImpl: async () => {
        const err = new Error("No such subscription: sub_gone");
        err.code = "resource_missing";
        throw err;
      },
    });
    const result = await cancelDisplacedStripeSub({
      stripe,
      firestore,
      uid: "uid_dave",
    });
    expect(result.canceled).toBe(false);
    expect(result.reason).toBe("already-gone");
    expect(result.stripeSubId).toBe("sub_gone");
  });

  it("Cycle 5: any other Stripe error → throws", async () => {
    const { cancelDisplacedStripeSub } = require("../lib/stripeAutoCancel");
    const firestore = makeFirestoreStub({
      userData: { stripeSubscriptionId: "sub_x" },
    });
    const { stripe } = makeStripeStub({
      cancelImpl: async () => {
        const err = new Error("Stripe is down");
        err.code = "api_error";
        throw err;
      },
    });
    await expect(
      cancelDisplacedStripeSub({
        stripe,
        firestore,
        uid: "uid_eve",
      })
    ).rejects.toThrow(/Stripe is down/);
  });

  it("Cycle 6: missing required args throws", async () => {
    const { cancelDisplacedStripeSub } = require("../lib/stripeAutoCancel");
    await expect(cancelDisplacedStripeSub({})).rejects.toThrow(
      /stripe, firestore, uid are required/
    );
    await expect(cancelDisplacedStripeSub({ stripe: {} })).rejects.toThrow(
      /required/
    );
  });

  it("Cycle 7: cancel always passes prorate:true (credit-note semantics)", async () => {
    // Defensive — future refactors must not silently drop the prorate
    // flag. Without it, Stripe leaves the period unrefunded and the
    // user pays for unused time after IAP took over.
    const { cancelDisplacedStripeSub } = require("../lib/stripeAutoCancel");
    const firestore = makeFirestoreStub({
      userData: { stripeSubscriptionId: "sub_prorate" },
    });
    const { stripe, cancel } = makeStripeStub();
    await cancelDisplacedStripeSub({
      stripe,
      firestore,
      uid: "uid_frank",
    });
    const callArgs = cancel.mock.calls[0];
    expect(callArgs[1]).toEqual({ prorate: true });
  });
});
