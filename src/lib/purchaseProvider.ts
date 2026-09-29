/**
 * Purchase Provider Abstraction (App Store Guideline 3.1.1)
 *
 * Detects platform and routes purchases to the correct provider:
 * - iOS native: Apple In-App Purchase (StoreKit via Capacitor plugin)
 * - Web / Android: Stripe Checkout
 *
 * For iOS App Store submission, all digital goods MUST use Apple IAP.
 * Stripe is only used for web and Android builds.
 */

import { Capacitor } from "@capacitor/core";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import type { PlanId } from "@/lib/proPlans";
import { isRevenueCatEnabled, rcPurchase, rcRestore } from "@/lib/revenuecat";

export type { PlanId };

export interface PurchaseResult {
  success: boolean;
  error?: string;
  /** Optional URL the caller can redirect to (Stripe portal, App
   *  Store manage-subscriptions page). When set, the caller is
   *  responsible for navigation — purchase() and manageSubscription()
   *  do their own redirect for the standard flow, but having the URL
   *  on the result lets callers handle it via window.open instead. */
  redirectUrl?: string;
}

/**
 * Closed set of entry points the Stripe Checkout flow is permitted
 * to return to. The server holds the canonical copy in
 * `functions/helpers.js ALLOWED_RETURN_PATHS`; any divergence is a
 * deploy bug. The client only chooses *which app page* to land on
 * — the server builds the full return URL itself from a
 * deploy-resolved base origin so a compromised / fat-fingered
 * client can't redirect Checkout through a phishing domain.
 */
export type CheckoutEntryPoint = "settings" | "upgrade" | "home";

/**
 * Options for {@link purchase}.
 *
 * Pre-spec the Stripe success/cancel URLs were hardcoded to
 * `/settings` — fine when checkout always started from there, but
 * misleading once the Upgrade page and feature-gate paywalls became
 * separate entry points. successPath / cancelPath were the first
 * pass (free-form strings). The server now treats the inputs as
 * closed-set tokens and synthesises the URL itself, so the client
 * exposes a single `entryPoint` enum rather than two paths.
 */
export interface PurchaseOptions {
  /** Closed-set token telling the server which app page to return
   *  the user to after Stripe Checkout. Default: "settings".
   *  Used for both the success and cancel redirect (the server
   *  appends `?checkout=success` vs `?checkout=cancelled`). */
  entryPoint?: CheckoutEntryPoint;
  /** Analytics dimension — propagated through paywallAnalytics. */
  source?: string;
  /** Sub1a P1 — request 7-day free trial. Forwarded to the
   *  `createCheckoutSession` Cloud Function which is authoritative
   *  (it checks `hasUsedTrial` server-side). Ignored on Apple IAP:
   *  Apple's introductory-offer config in App Store Connect drives
   *  the trial mechanic there. */
  withTrial?: boolean;
}

// Detect if running inside a native iOS Capacitor shell.
// Uses Capacitor.isNativePlatform() — the old `!!window.Capacitor`
// check was truthy on web too, so mobile-web Safari on an iPhone (which
// matches the UA test) was wrongly treated as native iOS and routed to
// Apple IAP instead of Stripe.
export function isNativeIOS(): boolean {
  return (
    Capacitor.isNativePlatform() &&
    /iPhone|iPad|iPod/i.test(navigator.userAgent)
  );
}

// Apple IAP product IDs — configure these in App Store Connect
// WARNING: These must match the bundle ID in capacitor.config.ts (appId)
// and the product IDs registered in App Store Connect. If you change the
// bundle ID, update these product ID prefixes accordingly.
export const APPLE_PRODUCT_IDS: Record<PlanId, string> = {
  monthly: "com.tropos.app.pro.monthly",
  yearly: "com.tropos.app.pro.yearly",
};

/**
 * Purchase via Stripe (web / Android)
 *
 * Post-#537 follow-up: the request body sends `successPath` /
 * `cancelPath` tokens drawn from {@link CheckoutEntryPoint}, not
 * full URLs. The Cloud Function validates the token against its
 * own closed set and builds the final URL itself from a
 * deploy-resolved base origin. Closes the previous
 * client-controlled URL surface entirely.
 */
async function purchaseWithStripe(
  plan: PlanId,
  uid: string,
  email: string,
  options: PurchaseOptions = {}
): Promise<PurchaseResult> {
  const PRICE_IDS = {
    monthly: import.meta.env.VITE_STRIPE_MONTHLY_PRICE_ID || "price_monthly",
    yearly: import.meta.env.VITE_STRIPE_YEARLY_PRICE_ID || "price_yearly",
  };

  const CREATE_CHECKOUT_URL =
    import.meta.env.VITE_STRIPE_CHECKOUT_URL || "/api/create-checkout-session";

  const entryPoint: CheckoutEntryPoint = options.entryPoint ?? "settings";

  try {
    const response = await fetch(CREATE_CHECKOUT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        priceId: PRICE_IDS[plan],
        uid,
        email,
        // Both fields carry the same token today — the server
        // distinguishes success/cancel via `?checkout=...`. Sending
        // them separately preserves the option to land users on
        // different pages for the two outcomes in a later flow
        // without a wire-format change.
        successPath: entryPoint,
        cancelPath: entryPoint,
        // Sub1a P1 — server is authoritative; the flag just
        // expresses the client's intent. Omitted body field reads
        // as `undefined` server-side which the helper treats as
        // false (no trial).
        withTrial: options.withTrial ?? false,
      }),
    });

    if (!response.ok) throw new Error("Failed to create checkout session");

    const { url } = await response.json();
    if (url) {
      window.location.href = url;
      return { success: true };
    }
    throw new Error("No checkout URL returned");
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Something went wrong",
    };
  }
}

/**
 * Purchase via RevenueCat (IAP slice 3, #1099) — the Path B flow.
 *
 * RC verifies the transaction with Apple before purchasePackage resolves, so
 * unlike purchaseWithAppleIAP there is no client-side receipt handling. The
 * webhook (backend slice 3) is the entitlement source of truth; the
 * best-effort sync callable only closes the purchase→webhook latency gap so
 * Pro unlocks the moment the sheet dismisses.
 */
async function purchaseWithRevenueCat(plan: PlanId): Promise<PurchaseResult> {
  const outcome = await rcPurchase(APPLE_PRODUCT_IDS[plan]);
  if (outcome.userCancelled) {
    return { success: false, error: "Purchase cancelled." };
  }
  if (!outcome.success) {
    return {
      success: false,
      error: outcome.error ?? "Purchase failed. Try again.",
    };
  }
  await syncEntitlementBestEffort();
  return { success: true };
}

/** Nudge the backend to pull the fresh entitlement from RC and write the
 *  profile fields immediately. MUST never fail a successful purchase — the
 *  webhook lands the same write within seconds regardless. */
async function syncEntitlementBestEffort(): Promise<void> {
  try {
    const sync = httpsCallable(functions, "syncRevenueCatEntitlement");
    await sync({});
  } catch {
    /* tolerated: webhook is the source of truth */
  }
}

/**
 * Main purchase function — routes to the correct provider.
 *
 * Options are forwarded to Stripe (success/cancel return URLs).
 * Apple IAP doesn't use return URLs — the StoreKit sheet handles
 * its own dismissal — so the options object is accepted but
 * ignored on iOS native.
 */
export async function purchase(
  plan: PlanId,
  uid: string,
  email: string,
  options: PurchaseOptions = {}
): Promise<PurchaseResult> {
  if (isNativeIOS()) {
    if (isRevenueCatEnabled()) {
      return purchaseWithRevenueCat(plan);
    }
    // No second iOS path. `cordova-plugin-purchase` sat here as a
    // fallback; it was never device-tested, its products were never
    // registered in App Store Connect so it had never completed a
    // purchase, and ADR-0006 retires it. Keeping it also meant two
    // StoreKit implementations in one binary, which `cap sync` rebuilt
    // on every native build: whichever observer finishes a transaction
    // first wins and the other one's bookkeeping is quietly wrong.
    //
    // This is honest instead of hopeful. A build without the RevenueCat
    // key cannot sell anything on iOS, and now says so rather than
    // failing somewhere further in.
    return {
      success: false,
      error: "Purchases aren't available in this build.",
    };
  }
  return purchaseWithStripe(plan, uid, email, options);
}

/**
 * Open the platform-appropriate subscription management surface.
 *
 *   - Native iOS: redirects to Apple's subscription management page,
 *     which is where an App Store subscription is actually cancelled.
 *   - Web and Android: no portal to open. See below.
 *
 * Per the spec this is the Pro-user equivalent of "Restore purchases" —
 * restore is iOS-only and stays iOS-only.
 */
export async function manageSubscription(
  // Unused since the web branch stopped calling a billing-portal callable,
  // and kept so the signature does not churn for a surface the Sub4 launch
  // gate is about to replace outright.
  _uid: string
): Promise<PurchaseResult> {
  if (isNativeIOS()) {
    const url = "https://apps.apple.com/account/subscriptions";
    window.location.href = url;
    return { success: true, redirectUrl: url };
  }

  // Web and Android do not reach a billing portal, and that is a locked
  // decision rather than a gap: Sub4 keeps the Stripe backend dormant and
  // names `createStripeBillingPortal` as the one piece that "stays
  // unbuilt", because no web billing is sold. Calling it returned
  // functions/not-found, which read as a broken button instead of a closed
  // storefront.
  //
  // Nobody is stranded by this: nothing has ever sold a web subscription,
  // so there is no Stripe customer to manage. When the Sub4 launch gate
  // lands, this surface becomes the "Get the iOS app" steer and this
  // branch goes with it.
  return {
    success: false,
    error: "Subscriptions are managed in the Tropos iOS app.",
  };
}

/**
 * Restore previous purchases (iOS only)
 */
export async function restorePurchases(): Promise<PurchaseResult> {
  if (!isNativeIOS()) {
    return { success: false, error: "Restore is only available on iOS." };
  }

  if (!isRevenueCatEnabled()) {
    return { success: false, error: "Restore isn't available in this build." };
  }

  const outcome = await rcRestore();
  if (!outcome.success) {
    return {
      success: false,
      error: outcome.error ?? "Failed to restore purchases.",
    };
  }
  await syncEntitlementBestEffort();
  return { success: true };
}
