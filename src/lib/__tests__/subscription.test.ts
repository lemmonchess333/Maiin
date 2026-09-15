import { describe, it, expect } from "vitest";
import {
  getSubscriptionInfo,
  hasLapsedOnboardingTrial,
  isCheckoutTrialEligible,
} from "../subscription";
import type { UserProfile } from "../auth";

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "u1",
    email: "test@example.com",
    displayName: "Test User",
    currentStreak: 0,
    longestStreak: 0,
    lastLogDate: "",
    ...overrides,
  } as UserProfile;
}

describe("getSubscriptionInfo", () => {
  it("returns free tier for null profile", () => {
    const info = getSubscriptionInfo(null);
    expect(info.tier).toBe("free");
    expect(info.isPro).toBe(false);
    expect(info.isInTrial).toBe(false);
    expect(info.trialDaysLeft).toBe(0);
  });

  it("returns free tier for profile without subscription", () => {
    const info = getSubscriptionInfo(makeProfile());
    expect(info.tier).toBe("free");
    expect(info.isPro).toBe(false);
  });

  it('returns pro tier for subscriptionTier = "pro"', () => {
    const info = getSubscriptionInfo(makeProfile({ subscriptionTier: "pro" }));
    expect(info.tier).toBe("pro");
    expect(info.isPro).toBe(true);
    expect(info.isInTrial).toBe(false);
  });

  it("returns active trial with pro access when trial is active", () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const info = getSubscriptionInfo(
      makeProfile({
        trialExpiresAt: future.toISOString(),
      })
    );
    expect(info.tier).toBe("free");
    expect(info.isInTrial).toBe(true);
    expect(info.isPro).toBe(true);
    expect(info.trialDaysLeft).toBeGreaterThanOrEqual(4);
    expect(info.trialDaysLeft).toBeLessThanOrEqual(6);
  });

  it("returns expired trial as free", () => {
    const past = new Date();
    past.setDate(past.getDate() - 5);
    const info = getSubscriptionInfo(
      makeProfile({
        trialExpiresAt: past.toISOString(),
      })
    );
    expect(info.tier).toBe("free");
    expect(info.isInTrial).toBe(false);
    expect(info.isPro).toBe(false);
    expect(info.trialDaysLeft).toBe(0);
  });

  it("pro subscription takes priority over trial", () => {
    const future = new Date();
    future.setDate(future.getDate() + 10);
    const info = getSubscriptionInfo(
      makeProfile({
        subscriptionTier: "pro",
        trialExpiresAt: future.toISOString(),
      })
    );
    expect(info.tier).toBe("pro");
    expect(info.isInTrial).toBe(false);
  });

  /**
   * The backlog listed a manual client roundtrip here, on the stated worry
   * that "`Date.parse` of the stored string is locale-sensitive".
   *
   * It is not, for the only format ever written. `Date.parse` is
   * implementation-defined for arbitrary strings, but ECMA-262 mandates
   * deterministic parsing of the ISO 8601 format — and the sole writer of
   * this field is `functions/applePurchase.js`, which stores
   * `expiresAt.toISOString()`. A UTC-offset ISO string denotes one absolute
   * instant regardless of the reader's timezone or locale.
   *
   * So these pin the contract rather than defer to a device: the format the
   * server writes, and the verdict's independence from the reader's clock
   * zone. If a future writer stores something non-ISO, the first test fails
   * and the concern becomes real again.
   */
  it("the stored format is ISO 8601 with a UTC designator", () => {
    // Mirrors what applePurchase.js writes. If this shape changes, the
    // locale-independence argument below no longer holds.
    const written = new Date(Date.UTC(2026, 7, 2, 21, 0, 0)).toISOString();
    expect(written).toBe("2026-08-02T21:00:00.000Z");
    expect(Date.parse(written)).toBe(Date.UTC(2026, 7, 2, 21, 0, 0));
  });

  it("an elapsed expiry reads as free from any timezone", () => {
    // The actual worry, tested directly: same stored string, readers whose
    // local offset spans a full day either side of UTC.
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const original = process.env.TZ;
    try {
      for (const tz of ["UTC", "Pacific/Kiritimati", "Pacific/Midway"]) {
        process.env.TZ = tz;
        const info = getSubscriptionInfo(
          makeProfile({
            subscriptionTier: "pro",
            subscriptionSource: "ios_iap",
            subscriptionExpiresAt: past,
          })
        );
        expect(info.isPro, `expired should read free in ${tz}`).toBe(false);
      }
    } finally {
      process.env.TZ = original;
    }
  });

  it("treats subscriptionTier=pro with an elapsed expiresAt as free (dropped-webhook defence)", () => {
    // Apple's EXPIRED notification or a Stripe webhook can be lost
    // — without the client-side expiry check, the user would remain
    // Pro indefinitely on stale state.
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const info = getSubscriptionInfo(
      makeProfile({
        subscriptionTier: "pro",
        subscriptionSource: "ios_iap",
        subscriptionExpiresAt: past,
      })
    );
    expect(info.tier).toBe("free");
    expect(info.isPro).toBe(false);
  });

  it("keeps pro when subscriptionExpiresAt is in the future", () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const info = getSubscriptionInfo(
      makeProfile({
        subscriptionTier: "pro",
        subscriptionSource: "stripe",
        subscriptionExpiresAt: future,
      })
    );
    expect(info.tier).toBe("pro");
    expect(info.isPro).toBe(true);
  });

  it("keeps pro when subscriptionExpiresAt is absent (legacy / Stripe back-compat)", () => {
    const info = getSubscriptionInfo(makeProfile({ subscriptionTier: "pro" }));
    expect(info.tier).toBe("pro");
    expect(info.isPro).toBe(true);
  });

  it("trial expiry at exact midnight boundary is expired", () => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    // Set trial to expire at start of today (already passed)
    const info = getSubscriptionInfo(
      makeProfile({
        trialExpiresAt: now.toISOString(),
      })
    );
    expect(info.isPro).toBe(false);
    expect(info.isInTrial).toBe(false);
  });

  it("trial expiring 1ms ago is expired", () => {
    const justExpired = new Date(Date.now() - 1);
    const info = getSubscriptionInfo(
      makeProfile({
        trialExpiresAt: justExpired.toISOString(),
      })
    );
    expect(info.isPro).toBe(false);
    expect(info.trialDaysLeft).toBe(0);
  });

  it("trial expiring soon is still active", () => {
    const almostExpired = new Date(Date.now() + 5000);
    const info = getSubscriptionInfo(
      makeProfile({
        trialExpiresAt: almostExpired.toISOString(),
      })
    );
    expect(info.isPro).toBe(true);
    expect(info.isInTrial).toBe(true);
    expect(info.trialDaysLeft).toBe(1);
  });

  it("lapsed pro (subscriptionTier free, no trial) is free", () => {
    const info = getSubscriptionInfo(
      makeProfile({
        subscriptionTier: "free",
        trialExpiresAt: new Date(Date.now() - 86400000).toISOString(),
      })
    );
    expect(info.isPro).toBe(false);
    expect(info.tier).toBe("free");
  });

  it("handles malformed trialExpiresAt gracefully", () => {
    const info = getSubscriptionInfo(
      makeProfile({
        trialExpiresAt: "not-a-date",
      })
    );
    // NaN date comparisons should result in free tier
    expect(info.isPro).toBe(false);
  });

  it("transition: free → trial → pro → lapsed states are correct", () => {
    // Free user
    const free = getSubscriptionInfo(makeProfile({ subscriptionTier: "free" }));
    expect(free.isPro).toBe(false);

    // Trial active
    const future = new Date(Date.now() + 7 * 86400000);
    const trial = getSubscriptionInfo(
      makeProfile({ trialExpiresAt: future.toISOString() })
    );
    expect(trial.isPro).toBe(true);
    expect(trial.isInTrial).toBe(true);

    // Pro subscriber
    const pro = getSubscriptionInfo(makeProfile({ subscriptionTier: "pro" }));
    expect(pro.isPro).toBe(true);
    expect(pro.isInTrial).toBe(false);

    // Lapsed (was pro, now free, trial expired)
    const lapsed = getSubscriptionInfo(
      makeProfile({
        subscriptionTier: "free",
        trialExpiresAt: new Date(Date.now() - 86400000).toISOString(),
      })
    );
    expect(lapsed.isPro).toBe(false);
    expect(lapsed.isInTrial).toBe(false);
  });
});

// Display pricing moved to src/lib/proPlans.ts in the paywall
// architecture unification; its shape is now pinned by
// proPlans.test.ts (PRO_PLANS shape + getCheckoutCtaLabel +
// getRenewalDisclosure + getInlinePriceSummary). subscription.ts no
// longer owns pricing — only tier / trial / access logic.
//
// The `featureAccess` flag map previously tested here was deleted
// in the 2026-05-24 Sub2 audit follow-up; 6 of its 7 flags were
// never read at any callsite. Real Pro gating is verified at the
// gated surfaces themselves (search `useSubscription().isPro` —
// Home, Program, Food, Upgrade, useScanUsage).

describe("hasLapsedOnboardingTrial", () => {
  const now = new Date("2026-09-13T12:00:00Z");

  it("is true once the free week's expiry is behind now", () => {
    expect(
      hasLapsedOnboardingTrial({ trialExpiresAt: "2026-09-10T09:00:00Z" }, now)
    ).toBe(true);
  });

  it("is false while the free week is live, and for a profile that never had one", () => {
    expect(
      hasLapsedOnboardingTrial({ trialExpiresAt: "2026-09-15T09:00:00Z" }, now)
    ).toBe(false);
    expect(hasLapsedOnboardingTrial({ trialExpiresAt: null }, now)).toBe(false);
    expect(hasLapsedOnboardingTrial(null, now)).toBe(false);
  });

  it("is false for an unreadable expiry — never sells an extension of nothing", () => {
    expect(
      hasLapsedOnboardingTrial({ trialExpiresAt: "not a date" }, now)
    ).toBe(false);
  });

  it("does not care about tier — a subscriber's old expiry still reads as lapsed", () => {
    expect(
      hasLapsedOnboardingTrial(
        {
          trialExpiresAt: "2026-09-10T09:00:00Z",
          subscriptionTier: "pro",
        } as never,
        now
      )
    ).toBe(true);
  });
});

describe("isCheckoutTrialEligible — one trial per account", () => {
  it("a profile that ever held the onboarding free week is not eligible: live or lapsed, flag or no flag", () => {
    expect(
      isCheckoutTrialEligible({
        hasUsedTrial: false,
        trialExpiresAt: "2020-01-01T00:00:00Z",
      })
    ).toBe(false);
    expect(
      isCheckoutTrialEligible({
        hasUsedTrial: false,
        trialExpiresAt: "2999-01-01T00:00:00Z",
      })
    ).toBe(false);
    expect(
      isCheckoutTrialEligible({ hasUsedTrial: true, trialExpiresAt: null })
    ).toBe(false);
  });

  it("eligible only with neither the flag nor an expiry on the profile, and with no profile at all", () => {
    expect(
      isCheckoutTrialEligible({ hasUsedTrial: false, trialExpiresAt: null })
    ).toBe(true);
    expect(isCheckoutTrialEligible({ trialExpiresAt: null })).toBe(true);
    expect(isCheckoutTrialEligible(null)).toBe(true);
  });
});

describe("getSubscriptionInfo — the billed trial", () => {
  const future = (days: number) =>
    new Date(Date.now() + days * 864e5).toISOString();

  it("Pro with a trial end ahead is in a billed trial with the days left", () => {
    const info = getSubscriptionInfo(
      makeProfile({
        subscriptionTier: "pro",
        subscriptionExpiresAt: future(7),
        subscriptionTrialEndsAt: future(7),
      })
    );
    expect(info).toMatchObject({
      tier: "pro",
      isPro: true,
      isInTrial: true,
      trialKind: "billed",
      trialDaysLeft: 7,
    });
    expect(info.trialEndsAt).not.toBeNull();
  });

  it("Pro with the trial end behind now has converted — no trial, still Pro", () => {
    const info = getSubscriptionInfo(
      makeProfile({
        subscriptionTier: "pro",
        subscriptionExpiresAt: future(30),
        subscriptionTrialEndsAt: future(-1),
      })
    );
    expect(info).toMatchObject({
      tier: "pro",
      isPro: true,
      isInTrial: false,
      trialKind: null,
      trialEndsAt: null,
    });
  });

  it("a lapsed subscription is free even with a stale trial end on the profile", () => {
    const info = getSubscriptionInfo(
      makeProfile({
        subscriptionTier: "pro",
        subscriptionExpiresAt: future(-1),
        subscriptionTrialEndsAt: future(-1),
      })
    );
    expect(info).toMatchObject({ tier: "free", isPro: false, trialKind: null });
  });

  it("the legacy free week reports its own kind", () => {
    const info = getSubscriptionInfo(
      makeProfile({ trialExpiresAt: future(3) })
    );
    expect(info).toMatchObject({ isInTrial: true, trialKind: "onboarding" });
  });
});

describe("getSubscriptionInfo — auto-renew", () => {
  const future = (days: number) =>
    new Date(Date.now() + days * 864e5).toISOString();

  it("carries the server's answer for a live trial and for Pro, only when it is a boolean", () => {
    const trial = (subscriptionAutoRenew: unknown) =>
      getSubscriptionInfo(
        makeProfile({
          subscriptionTier: "pro",
          subscriptionExpiresAt: future(7),
          subscriptionTrialEndsAt: future(7),
          subscriptionAutoRenew,
        } as Partial<UserProfile>)
      );
    expect(trial(false)).toMatchObject({
      trialKind: "billed",
      autoRenew: false,
    });
    expect(trial(true)).toMatchObject({ trialKind: "billed", autoRenew: true });
    expect(trial(undefined).autoRenew).toBeNull();
    expect(trial(null).autoRenew).toBeNull();
    expect(trial("false").autoRenew).toBeNull();

    const pro = getSubscriptionInfo(
      makeProfile({
        subscriptionTier: "pro",
        subscriptionExpiresAt: future(30),
        subscriptionAutoRenew: false,
      })
    );
    expect(pro).toMatchObject({
      isPro: true,
      isInTrial: false,
      autoRenew: false,
    });
  });

  it("is null whenever there is nothing to renew: free, lapsed, the legacy week, no profile", () => {
    expect(getSubscriptionInfo(null).autoRenew).toBeNull();
    expect(
      getSubscriptionInfo(makeProfile({ subscriptionTier: "free" })).autoRenew
    ).toBeNull();
    expect(
      getSubscriptionInfo(
        makeProfile({
          subscriptionTier: "pro",
          subscriptionExpiresAt: future(-1),
          subscriptionAutoRenew: false,
        })
      ).autoRenew
    ).toBeNull();
    expect(
      getSubscriptionInfo(makeProfile({ trialExpiresAt: future(3) })).autoRenew
    ).toBeNull();
  });
});
