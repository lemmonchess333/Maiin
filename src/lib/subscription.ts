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

// Sub2 — Pro scope shrinkage (locked in /grill-me). Two flags moved
// from Pro to free per Sub2c's "safety + observability features stay
// free" principle:
//   - plateauDetection: a SAFETY feature flagging stalling/regressing
//     users. Gating safety behind Pro is hostile + drives churn
//     before users see Tropos's value.
//   - performanceInsights: P2 made the Performance Index a Home-card
//     hero + iOS Widget + Watch Smart Stack. Pre-Sub2 the underlying
//     score was Pro-gated which contradicted the hero positioning.
//
// Pro still gates aiAdjustments (adaptive macros), phaseModes
// (day-type-specific macros), and the AI-augmented food / coaching
// features — anything where AI cost or compounding-optimisation
// value justifies the paywall.
export const featureAccess = {
  free: {
    workoutLogging: true,
    foodLogging: true,
    basicSummary: true,
    aiAdjustments: false,
    plateauDetection: true,
    phaseModes: false,
    performanceInsights: true,
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
