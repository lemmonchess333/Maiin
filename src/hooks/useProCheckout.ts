/**
 * useProCheckout — shared checkout state machine.
 *
 * Pre-unification ProModal and Upgrade.tsx each owned their own
 * `loading` flag, `error` state, and `purchase()` call. The two
 * implementations had diverged subtly already (different error
 * copy, different unauthenticated handling), and the spec called
 * out the resulting "duplicated checkout logic" as the next break-
 * point waiting to happen. This hook is the single implementation:
 *
 *   - One loading flag (callers expose it on their CTA)
 *   - One error pattern (rendered as a role="alert" above the CTA)
 *   - One unauthenticated-user branch (toast + inline error, no
 *     dead disabled CTA)
 *   - One success path (Stripe redirects internally; Apple IAP
 *     resolves into a Firestore subscriptionTier update via the
 *     verifyApplePurchase callable)
 *   - One analytics emission (checkout_started / checkout_failed)
 *   - Plan captured at submit time so a fast re-tap mid-flight
 *     can't swap the plan during the network round-trip
 */
import { useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { purchase } from "@/lib/purchaseProvider";
import { isNativeIOS } from "@/lib/purchaseProvider";
import { track, type PaywallSource } from "@/lib/paywallAnalytics";
import type { PlanId } from "@/lib/proPlans";
import type { ProFeatureKey } from "@/lib/proFeatures";

export interface StartCheckoutOptions {
  /** Analytics dimension (`upgrade_page`, `feature_gate`, etc.). */
  source?: PaywallSource;
  /** Path to return to after a successful Stripe checkout. */
  successPath?: string;
  /** Path to return to after a cancelled Stripe checkout. */
  cancelPath?: string;
  /** Feature gate that triggered the modal, when relevant — only
   *  forwarded to analytics. */
  featureKey?: ProFeatureKey;
}

const SIGN_IN_MESSAGE = "Sign in to start Pro.";

export interface UseProCheckoutResult {
  loading: boolean;
  error: string | null;
  startCheckout: (plan: PlanId, options?: StartCheckoutOptions) => Promise<void>;
  clearError: () => void;
  /** True when the auth context has no user — callers can flip the
   *  CTA label to "Sign in to start Pro" rather than rendering a
   *  disabled button with no explanation. */
  requiresSignIn: boolean;
}

export function useProCheckout(): UseProCheckoutResult {
  const { user } = useAuth();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCheckout = useCallback(
    async (plan: PlanId, options: StartCheckoutOptions = {}) => {
      if (loading) return;

      // Auth-less branch. Per the spec we don't disable the CTA —
      // we route the user to sign in. In Tropos, the unauthenticated
      // experience is the catch-all Login route (App.tsx renders
      // Login when `!user`), so navigation isn't needed; surfacing a
      // clear inline message + toast is enough. The Login flow then
      // brings them back to the same page on success because
      // `<Login />` is rendered in place rather than at a /login URL.
      if (!user) {
        setError(SIGN_IN_MESSAGE);
        toast.error(SIGN_IN_MESSAGE);
        return;
      }

      setError(null);
      setLoading(true);

      // Capture plan at submit so a mid-flight selection change
      // can't swap which plan is purchased.
      const submittedPlan = plan;
      const platform = isNativeIOS() ? "ios" : "web";

      track("checkout_started", {
        source: options.source ?? "unknown",
        featureKey: options.featureKey,
        selectedPlan: submittedPlan,
        platform,
      });

      try {
        const result = await purchase(
          submittedPlan,
          user.uid,
          user.email || "",
          {
            successPath: options.successPath ?? location.pathname,
            cancelPath: options.cancelPath ?? location.pathname,
            source: options.source,
          },
        );
        if (!result.success) {
          const message =
            result.error || "Couldn't start checkout. Please try again.";
          setError(message);
          toast.error(message);
          track("checkout_failed", {
            source: options.source ?? "unknown",
            featureKey: options.featureKey,
            selectedPlan: submittedPlan,
            platform,
            error: message,
          });
        }
        // Success path: on Stripe, purchase() has already navigated
        // the window away. On Apple IAP, success is a verified
        // transaction — Firestore picks up the new tier via the
        // verifyApplePurchase callable. Either way nothing to do
        // here beyond clearing the loading flag in finally.
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Couldn't start checkout. Please try again.";
        setError(message);
        toast.error(message);
        track("checkout_failed", {
          source: options.source ?? "unknown",
          featureKey: options.featureKey,
          selectedPlan: submittedPlan,
          platform,
          error: message,
        });
      } finally {
        setLoading(false);
      }
    },
    [loading, user, location.pathname],
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    loading,
    error,
    startCheckout,
    clearError,
    requiresSignIn: !user,
  };
}
