import type { UserProfile } from "./auth";

export interface SubscriptionInfo {
  tier: "free" | "pro";
  isInTrial: boolean;
  trialDaysLeft: number;
  isPro: boolean;
}

export function getSubscriptionInfo(
  profile: UserProfile | null
): SubscriptionInfo {
  if (!profile) {
    return { tier: "free", isInTrial: false, trialDaysLeft: 0, isPro: false };
  }

  // Dev override: if subscriptionTier is manually set to "pro" (Dev toggle or Stripe webhook)
  if (profile.subscriptionTier === "pro") {
    return { tier: "pro", isInTrial: false, trialDaysLeft: 0, isPro: true };
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
      };
    }
  }

  // No trial, no pro subscription
  return { tier: "free", isInTrial: false, trialDaysLeft: 0, isPro: false };
}

// Hook-style helper
import { useMemo } from "react";
import { useAuth } from "./auth";

export function useSubscription(): SubscriptionInfo {
  const { profile } = useAuth();
  return useMemo(() => getSubscriptionInfo(profile), [profile]);
}
