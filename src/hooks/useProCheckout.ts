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
 *     resolves into a Firestore subscriptionTier update via RevenueCat)
 *   - One analytics emission (checkout_started / checkout_failed)
 *   - Plan captured at submit time so a fast re-tap mid-flight
 *     can't swap the plan during the network round-trip
 *
 * Since App1 Q20 the state is one `CheckoutState` (`checkoutFlow.ts`),
 * moved only by `checkoutTransition`: one purchase at a time, and a
 * purchase the store has is a note, never an error. What the paywall draws
 * is read from it, so the three values it returns cannot disagree.
 */
import { useState, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "@/lib/toast";
import { useAuth } from "@/lib/auth";
import { purchase, type CheckoutEntryPoint } from "@/lib/purchaseProvider";
import { isNativeIOS } from "@/lib/purchaseProvider";
import {
  SIGN_IN_MESSAGE,
  checkoutTransition,
  checkoutView,
  type CheckoutEvent,
  type CheckoutState,
  type PurchaseOutcome,
} from "@/lib/checkoutFlow";
import { track, type PaywallSource } from "@/lib/paywallAnalytics";
import type { PlanId } from "@/lib/proPlans";
import type { ProFeatureKey } from "@/lib/proFeatures";

export interface StartCheckoutOptions {
  /** Analytics dimension (`upgrade_page`, `feature_gate`, etc.). */
  source?: PaywallSource;
  /** Where the paywall was opened from. When unset, the hook derives it
   *  from the current pathname. */
  entryPoint?: CheckoutEntryPoint;
  /** Feature gate that triggered the modal, when relevant — only
   *  forwarded to analytics. */
  featureKey?: ProFeatureKey;
  /** Whether the paywall offered a trial. The trial is the store's own:
   *  App Store Connect's introductory offer, or the web product's. */
  withTrial?: boolean;
}

/**
 * Map the current router pathname to a closed-set entry-point token.
 * Any path that doesn't pattern-match a blessed entry falls back to
 * `"settings"`, mirroring the previous default. The function exists
 * so callers that pass no explicit `entryPoint` still get a sensible
 * return surface (paywall modal opened on /upgrade returns to
 * /upgrade rather than always landing on /settings).
 */
function entryPointFromPath(pathname: string): CheckoutEntryPoint {
  if (pathname.includes("/upgrade")) return "upgrade";
  if (pathname.includes("/settings")) return "settings";
  if (pathname === "/" || pathname.endsWith("/home")) return "home";
  return "settings";
}

const START_FAILED = "Couldn’t start checkout. Try again.";

export interface UseProCheckoutResult {
  loading: boolean;
  error: string | null;
  /** Set when the store has the purchase and Pro is not on yet: a sentence
   *  to show calmly, never as an error. */
  notice: string | null;
  startCheckout: (
    plan: PlanId,
    options?: StartCheckoutOptions
  ) => Promise<void>;
  /** True when the auth context has no user — callers can flip the
   *  CTA label to "Sign in to start Pro" rather than rendering a
   *  disabled button with no explanation. */
  requiresSignIn: boolean;
}

export function useProCheckout(): UseProCheckoutResult {
  const { user } = useAuth();
  const location = useLocation();
  const [state, setState] = useState<CheckoutState>({ kind: "idle" });
  /* The same state for the handler, which must see a purchase begun
     before the next render; `send` is the one place either is written. */
  const stateRef = useRef(state);
  const send = useCallback((event: CheckoutEvent): CheckoutState => {
    const next = checkoutTransition(stateRef.current, event);
    if (next !== stateRef.current) {
      stateRef.current = next;
      setState(next);
    }
    return next;
  }, []);

  const startCheckout = useCallback(
    async (plan: PlanId, options: StartCheckoutOptions = {}) => {
      // Capture plan at submit so a mid-flight selection change
      // can't swap which plan is purchased.
      const submittedPlan = plan;
      const before = stateRef.current;
      const started = send({
        type: "start",
        plan: submittedPlan,
        signedIn: !!user,
      });
      // One purchase at a time.
      if (started === before) return;

      // Auth-less branch. Per the spec we don't disable the CTA —
      // we route the user to sign in. In Tropos, the unauthenticated
      // experience is the catch-all Login route (App.tsx renders
      // Login when `!user`), so navigation isn't needed; surfacing a
      // clear inline message + toast is enough. The Login flow then
      // brings them back to the same page on success because
      // `<Login />` is rendered in place rather than at a /login URL.
      if (!user) {
        toast.error(SIGN_IN_MESSAGE);
        return;
      }

      const platform = isNativeIOS() ? "ios" : "web";
      const dimensions = {
        source: options.source ?? "unknown",
        featureKey: options.featureKey,
        selectedPlan: submittedPlan,
        platform,
      } as const;

      track("checkout_started", dimensions);

      let outcome: PurchaseOutcome;
      try {
        outcome = await purchase(submittedPlan, user.uid, user.email || "", {
          entryPoint:
            options.entryPoint ?? entryPointFromPath(location.pathname),
          source: options.source,
          withTrial: options.withTrial,
        });
      } catch (err) {
        outcome = {
          kind: "failed",
          message: START_FAILED,
          detail: err instanceof Error ? err.message : String(err),
        };
      }
      send({ type: "settled", outcome });

      switch (outcome.kind) {
        case "cancelled":
          // Closing the store's sheet is a choice, not an error.
          track("checkout_cancelled", dimensions);
          break;
        case "pending":
          // The store has not refused. The subscription listener switches
          // Pro on when the server hears; until then say what is awaited.
          track("checkout_pending", {
            ...dimensions,
            pending: outcome.pending,
          });
          break;
        case "failed":
          toast.error(outcome.message);
          track("checkout_failed", {
            ...dimensions,
            // What went wrong underneath, where there is more to say than
            // the sentence shown.
            error: outcome.detail ?? outcome.message,
          });
          break;
        case "bought":
        case "redirected":
          // On the web, purchase() has already sent the window to
          // RevenueCat's checkout, and Upgrade syncs Pro on the way back.
          // On Apple IAP, AuthProvider's subscription listener picks up the
          // server-confirmed tier, including a delayed webhook when the
          // best-effort sync fails. Restore uses the same listener, so
          // neither surface needs its own refresh race.
          break;
      }
    },
    [user, location.pathname, send]
  );

  return {
    ...checkoutView(state),
    startCheckout,
    requiresSignIn: !user,
  };
}
