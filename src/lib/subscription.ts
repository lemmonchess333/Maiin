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
//   - `Program.tsx` — NO LONGER GATED (2026-08-04). `phaseLocked` and
//     its `useSubscription` call are gone: the last thing it held was
//     the "Start next week" button, and gating that was the wrong
//     trade. It is not a premium capability, it is the only way to tell
//     the app you finished your week early — without it a user who
//     trains six days by Wednesday has no forward affordance and waits
//     for Sunday. (Pgm4 had already made programme editing free.)
//
// Display pricing lives in `src/lib/proPlans.ts` — the single
// source of truth that ProModal, Upgrade.tsx, and AdaptiveSummary
// all consume. This module owns tier / trial / access logic only.

/**
 * F1b — daily AI scan limits, per action. Mirror of
 * `functions/lib/aiScanQuota.js DAILY_LIMITS`. Both must move
 * together if the lock is renegotiated — pinned by
 * `aiScanQuota.parity.cross.test.ts` (drift fails CI). Image-AI is Pro-only
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
  /**
   * Which trial is running, when one is. "billed" is the card trial at
   * checkout (the App Store introductory offer via the RevenueCat
   * webhook, or Stripe `trialing`) — the subscription is live and
   * converts unless cancelled, so the surfaces read "manage", never
   * "subscribe". "onboarding" is the legacy no-card week for profiles
   * that still hold one.
   */
  trialKind: "billed" | "onboarding" | null;
  /** ISO end of whichever trial is running; null otherwise. */
  trialEndsAt: string | null;
}

const NO_TRIAL = { trialKind: null, trialEndsAt: null } as const;

function daysUntil(iso: string, now: Date): number {
  const ms = Date.parse(iso) - now.getTime();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export function getSubscriptionInfo(
  profile: UserProfile | null
): SubscriptionInfo {
  if (!profile) {
    return {
      tier: "free",
      isInTrial: false,
      trialDaysLeft: 0,
      isPro: false,
      ...NO_TRIAL,
    };
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
      // The billed trial: Pro is live and the server has recorded when
      // the trial period ends. Past that instant the field is stale
      // until the conversion webhook clears it, so it only counts
      // while it is ahead of now.
      const trialRaw = profile.subscriptionTrialEndsAt;
      const trialMs = trialRaw ? Date.parse(trialRaw) : NaN;
      if (Number.isFinite(trialMs) && trialMs > Date.now()) {
        return {
          tier: "pro",
          isInTrial: true,
          trialDaysLeft: daysUntil(trialRaw!, new Date()),
          isPro: true,
          trialKind: "billed",
          trialEndsAt: new Date(trialMs).toISOString(),
        };
      }
      return {
        tier: "pro",
        isInTrial: false,
        trialDaysLeft: 0,
        isPro: true,
        ...NO_TRIAL,
      };
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
        trialKind: "onboarding",
        trialEndsAt: expiresAt.toISOString(),
      };
    }
  }

  // No trial, no pro subscription
  return {
    tier: "free",
    isInTrial: false,
    trialDaysLeft: 0,
    isPro: false,
    ...NO_TRIAL,
  };
}

/* ================================
   HOOK
================================ */

/**
 * True once the onboarding free week (`trialExpiresAt`) has lapsed.
 *
 * The free week is the reverse trial — full Pro from onboarding, no card
 * — and the card trial at checkout is offered AFTER it as an extension
 * ("7 more days free"), so the surfaces that sell Pro need to know which
 * side of the lapse the user is on: a first-timer is offered a trial, a
 * lapsed user is offered to keep what they had. Tier-agnostic on
 * purpose (a subscriber's old expiry is still "lapsed"); callers that
 * care combine it with `isPro`.
 */
export function hasLapsedOnboardingTrial(
  profile: Pick<UserProfile, "trialExpiresAt"> | null | undefined,
  now: Date = new Date()
): boolean {
  const raw = profile?.trialExpiresAt;
  if (!raw) return false;
  const expires = Date.parse(raw);
  return Number.isFinite(expires) && expires < now.getTime();
}

/**
 * Whether checkout may offer the card trial. One trial per account,
 * total: the onboarding free week (`trialExpiresAt`) IS the trial, so a
 * profile that ever held one — live or lapsed, flag stamped or not — is
 * offered the price. The flag alone covers accounts whose free week was
 * withheld (ledger, address cap) and then took the trial at checkout.
 * No profile (signed-out web) reads as eligible; the server decides.
 */
export function isCheckoutTrialEligible(
  profile:
    | Pick<UserProfile, "hasUsedTrial" | "trialExpiresAt">
    | null
    | undefined
): boolean {
  if (!profile) return true;
  return !profile.hasUsedTrial && !profile.trialExpiresAt;
}

export function useSubscription(): SubscriptionInfo {
  const { profile } = useAuth();
  return useMemo(() => getSubscriptionInfo(profile), [profile]);
}
