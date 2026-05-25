/**
 * TDD pins for Sub1a P1 — trial rebuild.
 *
 * The trial decision and the `hasUsedTrial` write happen in a helper
 * module so they're testable against stub Stripe / Firestore handles
 * without booting firebase-admin. The HTTP handler in `index.js`
 * delegates to this module and is responsible only for auth,
 * rate-limiting, allowlist enforcement, and URL building.
 *
 * Invariants pinned here (Sub1 lock row STATUS 2026-05-24a, Option A):
 *   - `withTrial: true` + `hasUsedTrial: false` → Stripe session
 *     carries `subscription_data.trial_period_days: 7`, user doc
 *     atomically updated to `hasUsedTrial: true`.
 *   - `withTrial: true` + `hasUsedTrial: true` → NO trial. User has
 *     used their lifetime trial slot; no second free week (matches
 *     Sub1a pin #1 trial-shopping protection).
 *   - `withTrial: false` (or omitted) → no trial regardless of flag
 *     state. Lets returning users buy without re-paying-for-trial.
 *   - `hasUsedTrial: true` write is in the SAME transaction as the
 *     read, so two parallel checkout attempts can't both consume the
 *     trial slot (race-safe).
 *   - Abandoned checkouts still consume the slot — that's intentional
 *     per the playbook: prevents click-trial-bail-retry-trial loops.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * Construct a stub Firestore handle that supports the limited surface
 * the helper uses: `firestore.collection("users").doc(uid)` returning
 * an object with `.get()` + `.runTransaction()`.
 */
function makeFirestoreStub({ userData = {} } = {}) {
  const userDocSet = vi.fn();
  const userDocGet = vi.fn(async () => ({
    exists: true,
    data: () => userData,
  }));

  const userDocRef = {
    get: userDocGet,
    set: userDocSet,
  };

  const firestore = {
    collection: vi.fn(() => ({
      doc: vi.fn(() => userDocRef),
    })),
    /**
     * Transaction stub: passes the txn handle to the callback and
     * records every `set` call so the test can assert atomic-write
     * ordering. The real handle would return committed-state reads;
     * the stub returns `userData` from the test fixture.
     */
    runTransaction: vi.fn(async (callback) => {
      const txnSets = [];
      const txn = {
        get: vi.fn(async () => ({
          exists: true,
          data: () => userData,
        })),
        set: vi.fn((ref, data, opts) => {
          txnSets.push({ ref, data, opts });
        }),
        update: vi.fn((ref, data) => {
          txnSets.push({ ref, data, op: "update" });
        }),
      };
      const result = await callback(txn);
      firestore._lastTxnSets = txnSets;
      return result;
    }),
    _lastTxnSets: [],
  };
  return { firestore, userDocSet, userDocGet };
}

/**
 * Stub Stripe client. Captures the args passed to
 * `checkout.sessions.create` so the test can assert the trial
 * parameters reached the SDK call site.
 */
function makeStripeStub() {
  const sessionCreate = vi.fn(async (args) => ({
    id: "cs_test_123",
    url: "https://checkout.stripe.example/cs_test_123",
    _args: args,
  }));
  const stripe = {
    checkout: { sessions: { create: sessionCreate } },
  };
  return { stripe, sessionCreate };
}

describe("createTrialCheckoutSession", () => {
  it("Cycle 1 (tracer): withTrial=true + hasUsedTrial=false grants trial — Stripe gets trial_period_days=7", async () => {
    const { createTrialCheckoutSession } = require("../lib/checkoutTrial");
    const { firestore } = makeFirestoreStub({
      userData: { stripeCustomerId: "cus_existing", hasUsedTrial: false },
    });
    const { stripe, sessionCreate } = makeStripeStub();

    const result = await createTrialCheckoutSession({
      stripe,
      firestore,
      uid: "uid_alice",
      priceId: "price_pro_monthly",
      mode: "subscription",
      withTrial: true,
      successUrl: "https://app.example/success",
      cancelUrl: "https://app.example/cancel",
      customerId: "cus_existing",
      metadata: { firebaseUid: "uid_alice", planKind: "pro_monthly" },
    });

    expect(sessionCreate).toHaveBeenCalledTimes(1);
    const args = sessionCreate.mock.calls[0][0];
    expect(args.subscription_data).toEqual({ trial_period_days: 7 });
    expect(args.customer).toBe("cus_existing");
    expect(args.mode).toBe("subscription");
    expect(result.trialGranted).toBe(true);
    expect(result.session.id).toBe("cs_test_123");
  });

  it("Cycle 2: withTrial=true + hasUsedTrial=true does NOT pass trial_period_days (no second trial)", async () => {
    const { createTrialCheckoutSession } = require("../lib/checkoutTrial");
    const { firestore } = makeFirestoreStub({
      userData: { stripeCustomerId: "cus_existing", hasUsedTrial: true },
    });
    const { stripe, sessionCreate } = makeStripeStub();

    const result = await createTrialCheckoutSession({
      stripe,
      firestore,
      uid: "uid_bob",
      priceId: "price_pro_monthly",
      mode: "subscription",
      withTrial: true,
      successUrl: "https://app.example/success",
      cancelUrl: "https://app.example/cancel",
      customerId: "cus_existing",
      metadata: {},
    });

    const args = sessionCreate.mock.calls[0][0];
    expect(args.subscription_data).toBeUndefined();
    expect(result.trialGranted).toBe(false);
    // Did NOT write hasUsedTrial again (would be a no-op but
    // unnecessary; pin avoids touching the doc when no decision changes).
    expect(firestore._lastTxnSets).toHaveLength(0);
  });

  it("Cycle 3: withTrial=true + hasUsedTrial=false atomically sets hasUsedTrial=true on the user doc (race-safe)", async () => {
    const { createTrialCheckoutSession } = require("../lib/checkoutTrial");
    const { firestore } = makeFirestoreStub({
      userData: { stripeCustomerId: "cus_existing", hasUsedTrial: false },
    });
    const { stripe } = makeStripeStub();

    await createTrialCheckoutSession({
      stripe,
      firestore,
      uid: "uid_carol",
      priceId: "price_pro_monthly",
      mode: "subscription",
      withTrial: true,
      successUrl: "https://app.example/success",
      cancelUrl: "https://app.example/cancel",
      customerId: "cus_existing",
      metadata: {},
    });

    // Atomic: exactly one set call inside the transaction, with
    // { merge: true } so it doesn't clobber sibling fields.
    expect(firestore.runTransaction).toHaveBeenCalledTimes(1);
    expect(firestore._lastTxnSets).toHaveLength(1);
    const txnWrite = firestore._lastTxnSets[0];
    expect(txnWrite.data).toEqual({ hasUsedTrial: true });
    expect(txnWrite.opts).toEqual({ merge: true });
  });

  it("Cycle 4: mapSubscriptionStatusToTier pins trialing → active transition keeps tier=pro", async () => {
    const { mapSubscriptionStatusToTier } = require("../lib/checkoutTrial");
    // The Sub1a P1 invariant: when Stripe flips a subscription from
    // `trialing` to `active` at the end of the trial period, the
    // user stays Pro. The webhook handler at index.js:1583 maps both
    // statuses to "pro" via this helper.
    expect(mapSubscriptionStatusToTier("trialing")).toBe("pro");
    expect(mapSubscriptionStatusToTier("active")).toBe("pro");
    // The terminal states that downgrade the user.
    expect(mapSubscriptionStatusToTier("canceled")).toBe("free");
    expect(mapSubscriptionStatusToTier("incomplete")).toBe("free");
    expect(mapSubscriptionStatusToTier("incomplete_expired")).toBe("free");
    expect(mapSubscriptionStatusToTier("past_due")).toBe("free");
    expect(mapSubscriptionStatusToTier("unpaid")).toBe("free");
    // Unknown statuses fall to free (fail-closed; no Pro-by-accident).
    expect(mapSubscriptionStatusToTier("paused")).toBe("free");
    expect(mapSubscriptionStatusToTier(undefined)).toBe("free");
  });

  it("Cycle 3 guard: withTrial=false does NOT touch hasUsedTrial regardless of current value", async () => {
    const { createTrialCheckoutSession } = require("../lib/checkoutTrial");
    const { firestore } = makeFirestoreStub({
      userData: { stripeCustomerId: "cus_existing", hasUsedTrial: false },
    });
    const { stripe, sessionCreate } = makeStripeStub();

    const result = await createTrialCheckoutSession({
      stripe,
      firestore,
      uid: "uid_dave",
      priceId: "price_pro_monthly",
      mode: "subscription",
      withTrial: false,
      successUrl: "https://app.example/success",
      cancelUrl: "https://app.example/cancel",
      customerId: "cus_existing",
      metadata: {},
    });

    const args = sessionCreate.mock.calls[0][0];
    expect(args.subscription_data).toBeUndefined();
    expect(result.trialGranted).toBe(false);
    // No write — user hasn't used their trial yet; they didn't claim
    // it on this checkout, so the flag stays false for later.
    expect(firestore._lastTxnSets).toHaveLength(0);
  });
});
