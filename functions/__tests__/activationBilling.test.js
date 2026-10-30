import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const billing = require("../lib/activationBilling.js");
const AT = Date.parse("2026-10-30T12:00:00Z");

describe("provider-verified activation billing facts", () => {
  it("accepts only known onboarding platforms", () => {
    for (const value of ["ios", "web", "android"])
      expect(billing.validOnboardingPlatform(value)).toBe(true);
    for (const value of ["", "iPhone", null, 42])
      expect(billing.validOnboardingPlatform(value)).toBe(false);
  });

  it("keeps only the earliest verified start of each kind", () => {
    const trial = { kind: "trial", source: "ios_iap", atMs: AT };
    const first = billing.nextBillingFirsts(null, trial);
    expect(first).toEqual({ trial: { source: "ios_iap", atMs: AT } });
    expect(billing.nextBillingFirsts(first, trial)).toBeNull();
    expect(
      billing.nextBillingFirsts(first, { ...trial, atMs: AT + 1000 })
    ).toBeNull();
    const corrected = billing.nextBillingFirsts(first, {
      ...trial,
      atMs: AT - 1000,
    });
    expect(corrected.trial.atMs).toBe(AT - 1000);
    expect(
      billing.nextBillingFirsts(corrected, {
        kind: "paid",
        source: "ios_iap",
        atMs: AT + 7 * 86_400_000,
      })
    ).toHaveProperty("trial.atMs", AT - 1000);
    expect(
      billing.nextBillingFirsts(first, {
        kind: "paid",
        source: "client",
        atMs: AT,
      })
    ).toBeNull();
  });

  it("takes trial and paid dates only from a production active RevenueCat entitlement", () => {
    const base = {
      active: true,
      sandbox: false,
      store: "app_store",
      syncedAtMs: AT,
      purchaseAtMs: AT - 1000,
      periodType: "normal",
      trial: null,
    };
    const granted = { result: "granted", conflict: false };
    expect(billing.revenueCatObservation(base, granted)).toEqual({
      kind: "paid",
      source: "ios_iap",
      atMs: AT - 1000,
    });
    expect(
      billing.revenueCatObservation(
        {
          ...base,
          periodType: "trial",
          trial: { startedAtMs: AT - 2000 },
        },
        granted
      )
    ).toEqual({ kind: "trial", source: "ios_iap", atMs: AT - 2000 });
    for (const patch of [
      { sandbox: true },
      { active: false },
      { store: "unknown" },
      { periodType: "intro" },
      { purchaseAtMs: AT + 1000 },
    ])
      expect(billing.revenueCatObservation({ ...base, ...patch }, granted))
        .toBeNull();
    expect(
      billing.revenueCatObservation(base, { result: "granted", conflict: true })
    ).toBeNull();
  });

  it("requires a signed paid checkout or a positive paid invoice for Stripe", () => {
    const checkout = {
      type: "checkout.session.completed",
      livemode: true,
      created: AT / 1000,
      data: {
        object: {
          mode: "subscription",
          subscription: "sub_1",
          payment_status: "paid",
          amount_total: 3499,
        },
      },
    };
    expect(billing.stripePaidObservation(checkout)).toEqual({
      kind: "paid",
      source: "stripe",
      atMs: AT,
    });
    expect(
      billing.stripePaidObservation({
        ...checkout,
        data: { object: { payment_status: "no_payment_required" } },
      })
    ).toBeNull();
    expect(
      billing.stripePaidObservation({
        ...checkout,
        data: { object: { payment_status: "paid", amount_total: 0 } },
      })
    ).toBeNull();
    expect(
      billing.stripePaidObservation({
        ...checkout,
        data: {
          object: {
            mode: "payment",
            payment_status: "paid",
            amount_total: 3499,
          },
        },
      })
    ).toBeNull();
    expect(
      billing.stripePaidObservation({ ...checkout, livemode: false })
    ).toBeNull();
    expect(
      billing.stripePaidObservation({
        type: "invoice.paid",
        livemode: true,
        created: AT / 1000,
        data: { object: { amount_paid: 499 } },
      })
    ).toMatchObject({ kind: "paid", atMs: AT });
    expect(
      billing.stripePaidObservation({
        type: "invoice.paid",
        livemode: true,
        created: AT / 1000,
        data: { object: { amount_paid: 0 } },
      })
    ).toBeNull();
    expect(
      billing.stripeTrialObservation({ status: "trialing", trial_start: AT / 1000 })
    ).toMatchObject({ kind: "trial", atMs: AT });
    expect(billing.stripeTrialObservation({ status: "active" })).toBeNull();
  });
});
