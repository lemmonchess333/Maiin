/**
 * One line per account state, shared by Settings and the offer page.
 * The cases are the ones a user can actually be in; the copy for the
 * cancelled ones must never say "unless you cancel".
 */
import { describe, it, expect } from "vitest";
import { describePlanStatus } from "../subscriptionStatusCopy";

const END = "2026-09-20T09:00:00Z";
const base = {
  tier: "pro" as const,
  isInTrial: true,
  trialKind: "billed" as const,
  trialEndsAt: END,
  trialDaysLeft: 7,
  autoRenew: true as boolean | null,
  renewsAt: END,
  planId: "monthly" as const,
};

describe("describePlanStatus", () => {
  it("a billed trial: ends on a date, then the price, unless you cancel — and manages", () => {
    expect(describePlanStatus(base)).toMatchObject({
      state: "billed_trial",
      title: "Free trial",
      detail: "Ends 20 Sept, then £3.99/mo unless you cancel",
      action: "manage",
      cancelled: false,
    });
    // Unknown plan: the line stops at the date rather than guessing.
    expect(describePlanStatus({ ...base, planId: null }).detail).toBe(
      "Ends 20 Sept unless you cancel"
    );
    // Unknown end: fall back to the days left.
    expect(
      describePlanStatus({ ...base, trialEndsAt: null, trialDaysLeft: 1 })
        .detail
    ).toBe("1 day left, then £3.99/mo");
    // The server has not said either way: still the renewing line.
    expect(describePlanStatus({ ...base, autoRenew: null }).action).toBe(
      "manage"
    );
  });

  it("a cancelled billed trial: won't renew, no price, Resubscribe", () => {
    const s = describePlanStatus({ ...base, autoRenew: false });
    expect(s).toMatchObject({
      state: "billed_trial",
      detail: "Ends 20 Sept · won't renew",
      action: "resubscribe",
      cancelled: true,
    });
    expect(s.detail).not.toMatch(/unless you cancel|£/);
    expect(
      describePlanStatus({ ...base, autoRenew: false, trialEndsAt: null })
        .detail
    ).toBe("7 days left · won't renew");
  });

  it("Pro renews on a date, or ends on it once cancelled", () => {
    const pro = {
      ...base,
      isInTrial: false,
      trialKind: null,
      trialEndsAt: null,
    };
    expect(
      describePlanStatus({ ...pro, renewsAt: "2026-10-20T09:00:00Z" })
    ).toMatchObject({
      state: "pro",
      title: "Pro",
      detail: "Renews 20 Oct",
      action: "manage",
    });
    expect(describePlanStatus({ ...pro, renewsAt: null }).detail).toBe(
      "Full access"
    );
    expect(
      describePlanStatus({
        ...pro,
        renewsAt: "2026-10-20T09:00:00Z",
        autoRenew: false,
      })
    ).toMatchObject({
      detail: "Ends 20 Oct · won't renew",
      action: "resubscribe",
    });
    expect(
      describePlanStatus({ ...pro, renewsAt: null, autoRenew: false }).detail
    ).toBe("Won't renew");
  });

  it("the legacy free week and the free plan both go to the offer", () => {
    expect(
      describePlanStatus({
        ...base,
        tier: "free",
        trialKind: "onboarding",
        trialDaysLeft: 3,
        autoRenew: null,
      })
    ).toMatchObject({
      state: "onboarding_trial",
      title: "Pro trial",
      detail: "3 days left",
      action: "offer",
    });
    expect(
      describePlanStatus({
        ...base,
        tier: "free",
        isInTrial: false,
        trialKind: null,
        trialEndsAt: null,
        trialDaysLeft: 0,
        autoRenew: null,
        // A stale flag from a lapsed subscription must not read as cancelled.
        renewsAt: null,
      })
    ).toMatchObject({
      state: "free",
      title: "Upgrade to Pro",
      detail: "Free plan",
      action: "offer",
      cancelled: false,
    });
  });
});
