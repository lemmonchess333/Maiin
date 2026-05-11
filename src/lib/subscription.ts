import type { UserProfile } from "./auth";
import { useMemo } from "react";
import { useAuth } from "./auth";

/* ================================
   FEATURE ACCESS
================================ */
//
// Display pricing was previously duplicated here as a `pricing`
// object. Pricing now lives in `src/lib/proPlans.ts` — the single
// source of truth that ProModal, Upgrade.tsx, and AdaptiveSummary
// all consume. This module owns tier / trial / access logic only.

export const SCAN_LIMITS = {
  free: 10,
  pro: 300,
} as const;

export const featureAccess = {
  free: {
    workoutLogging: true,
    foodLogging: true,
    basicSummary: true,
    aiAdjustments: false,
    plateauDetection: false,
    phaseModes: false,
    performanceInsights: false,
  },
  pro: {
    workoutLogging: true,
    foodLogging: true,
    basicSummary: true,
    aiAdjustments: true,
    plateauDetection: true,
    phaseModes: true,
    performanceInsights: true,
  },
};

/* ================================
   TRIAL + SUBSCRIPTION INFO (from feature branch)
================================ */

export type Tier = "free" | "pro";

export interface SubscriptionInfo {
  tier: Tier;
  isInTrial: boolean;
  trialDaysLeft: number;
  isPro: boolean;
  features: typeof featureAccess.free;
}

export function getSubscriptionInfo(
  profile: UserProfile | null
): SubscriptionInfo {
  if (!profile) {
    return { tier: "free", isInTrial: false, trialDaysLeft: 0, isPro: false, features: featureAccess.free };
  }

  // Dev override or Stripe webhook: subscriptionTier manually set to "pro"
  if (profile.subscriptionTier === "pro") {
    return { tier: "pro", isInTrial: false, trialDaysLeft: 0, isPro: true, features: featureAccess.pro };
  }

  // Check trial
  if (profile.trialExpiresAt) {
    const expiresAt = new Date(profile.trialExpiresAt);
    const now = new Date();
    const diffMs = expiresAt.getTime() - now.getTime();
    const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    if (daysLeft > 0) {
      return {
        tier: "free",
        isInTrial: true,
        trialDaysLeft: daysLeft,
        isPro: true, // During trial, user has full Pro access
        features: featureAccess.pro,
      };
    }
  }

  // No trial, no pro subscription
  return { tier: "free", isInTrial: false, trialDaysLeft: 0, isPro: false, features: featureAccess.free };
}

/* ================================
   HOOK
================================ */

export function useSubscription(): SubscriptionInfo {
  const { profile } = useAuth();
  return useMemo(() => getSubscriptionInfo(profile), [profile]);
}
