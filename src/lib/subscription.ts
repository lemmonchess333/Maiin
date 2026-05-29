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
//   2. Consult `useSubscription().isPro` directly at the gated
//      surface; ad-hoc surface-level checks are the active pattern
//      (the old `ProGate` wrapper component was removed because it
//      had zero callsites).
//   3. If you need the user-visible copy to live on a feature
//      registry rather than scattered in components, extend
//      `proFeatures.ts`.
//
// Current real Pro gates (search `useSubscription` destructuring
// across `src/`):
//   - `useScanUsage.ts` — `isUnlimited = isPro || isInTrial`
//     drives the AI-scan ceiling. Post-F1b uses daily windows +
//     per-action counters (DAILY_AI_LIMITS below).
//   - `Program.tsx` — `!isPro` derives `phaseLocked` which now gates
//     ONLY the "Advance to Next Week" button. Pgm4 made programme
//     editing free (the unified /settings/training editor), so the
//     old Configure / Settings / Reset gate was removed.
//
// Display pricing lives in `src/lib/proPlans.ts` — the single
// source of truth that ProModal, Upgrade.tsx, and AdaptiveSummary
// all consume. This module owns tier / trial / access logic only.

/**
 * F1b — daily AI scan limits, per action. Mirror of
 * `functions/lib/aiScanQuota.js DAILY_LIMITS`. Both must move
 * together if the lock is renegotiated. Image-AI is Pro-only
 * (free=0); the Scan Meal CTA on the Food page reads
 * `image_ai.limit === 0` to render an upgrade prompt instead of
 * the camera button for free users.
 */
export const DAILY_AI_LIMITS = {
  free: { text_ai: 10, image_ai: 0 },
  pro: { text_ai: 100, image_ai: 100 },
} as const;

/**
 * @deprecated Pre-F1b shared monthly counter. Retained only for
 * legacy callsites; new code should consume `DAILY_AI_LIMITS` via
 * `useScanUsage(action)`. Will be removed once all callers migrate.
 */
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

  // Dev override or webhook: subscriptionTier manually set to "pro".
  // Defence-in-depth — if subscriptionExpiresAt has elapsed, treat as
  // free even when the tier is still "pro". Apple EXPIRED notifications
  // can be dropped after Apple's retry window (lost / 500 / replay
  // collision) and Stripe webhook delivery has rare gaps; either path
  // can leave a user stuck on a paid tier with no auto-recovery
  // without this check. If the timestamp is absent (legacy doc / dev
  // override / Stripe path that hasn't been backfilled), fall through
  // to the original behaviour.
  if (profile.subscriptionTier === "pro") {
    const expiresRaw = profile.subscriptionExpiresAt;
    const expiresMs = expiresRaw ? Date.parse(expiresRaw) : NaN;
    if (Number.isFinite(expiresMs) && expiresMs < Date.now()) {
      // Expired — fall through to trial / free check below.
    } else {
      return { tier: "pro", isInTrial: false, trialDaysLeft: 0, isPro: true };
    }
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
