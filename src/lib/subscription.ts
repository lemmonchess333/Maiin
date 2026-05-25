import type { UserProfile } from "./auth";
import { useMemo } from "react";
import { useAuth } from "./auth";

/* ================================
   PRO GATING — where it actually lives
================================ */
//
// As of the 2026-05-24 Sub2 audit, the `featureAccess` flag map
// previously exported from this module was cosmetic — 6 of 7 flags
// were never read, and the one that was (`phaseModes`, in
// `src/pages/Program.tsx`) gated the program-configuration buttons
// rather than the day-type macros its name implied. The map has
// been removed; this comment is the contributor-facing pointer to
// where Pro gating actually happens.
//
// To add a new Pro gate:
//   1. Decide whether the gate is a wholesale-card wrapper or
//      surface-level (Sub2d pin #1 prefers surface-level lock icons
//      over whole-card blur). Add a new `ProFeatureKey` to
//      `src/lib/proFeatures.ts` for the modal hero copy.
//   2. Wrap the gated surface in `<ProGate featureKey="...">` for
//      the wholesale pattern, OR consult `useSubscription().isPro`
//      directly for partial gating (the post-Sub2c-#3 pattern in
//      `AdaptiveTDEECard.tsx`).
//   3. If you need the user-visible copy to live on a feature
//      registry rather than scattered in components, extend
//      `proFeatures.ts`.
//
// Current real Pro gates (search `<ProGate` + `useSubscription`
// destructuring across `src/`):
//   - `AdaptiveTDEECard.tsx` — adaptive_tdee partial gating
//     (Sub2c pin #3; header free, callouts Pro)
//   - `AdaptiveSummary.tsx` — Apply button gated by direct
//     `isPro` check
//   - `useScanUsage.ts` — `isUnlimited = isPro || isInTrial`
//     drives the monthly AI-scan ceiling
//   - `Program.tsx` — `!isPro` derives `phaseLocked` which gates
//     the program-configuration buttons (Configure / Settings /
//     Refresh)
//
// Display pricing lives in `src/lib/proPlans.ts` — the single
// source of truth that ProModal, Upgrade.tsx, and AdaptiveSummary
// all consume. This module owns tier / trial / access logic only.

export const SCAN_LIMITS = {
  free: 10,
  pro: 300,
} as const;

/* ================================
   TRIAL + SUBSCRIPTION INFO
================================ */

export type Tier = "free" | "pro";

export interface SubscriptionInfo {
  tier: Tier;
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

  // Dev override or Stripe webhook: subscriptionTier manually set to "pro"
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

/* ================================
   HOOK
================================ */

export function useSubscription(): SubscriptionInfo {
  const { profile } = useAuth();
  return useMemo(() => getSubscriptionInfo(profile), [profile]);
}
