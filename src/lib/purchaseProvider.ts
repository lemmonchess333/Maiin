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

import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import type { PlanId } from "@/lib/proPlans";

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
 * Options for {@link purchase}.
 *
 * Pre-spec the Stripe success/cancel URLs were hardcoded to
 * `/settings` — fine when checkout always started from there, but
 * misleading once the Upgrade page and feature-gate paywalls became
 * separate entry points. The user lands back on Settings after a
 * checkout they started from `/upgrade`, with no sign of where they
 * came from. successPath / cancelPath let each entry point send the
 * user back to its own surface.
 */
export interface PurchaseOptions {
  /** Path (relative to BASE_URL) to return to on successful checkout.
   *  Default: "settings". Appended `?checkout=success`. */
  successPath?: string;
  /** Path (relative to BASE_URL) to return to on cancelled checkout.
   *  Default: "settings". Appended `?checkout=cancelled`. */
  cancelPath?: string;
  /** Analytics dimension — propagated through paywallAnalytics. */
  source?: string;
}

// Detect if running inside a native iOS Capacitor shell
export function isNativeIOS(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!(window as unknown as Record<string, unknown>).Capacitor &&
    /iPhone|iPad|iPod/i.test(navigator.userAgent)
  );
}

// Apple IAP product IDs — configure these in App Store Connect
// WARNING: These must match the bundle ID in capacitor.config.ts (appId)
// and the product IDs registered in App Store Connect. If you change the
// bundle ID, update these product ID prefixes accordingly.
const APPLE_PRODUCT_IDS: Record<PlanId, string> = {
  monthly: 'com.tropos.app.pro.monthly',
  yearly: 'com.tropos.app.pro.yearly',
};

// IAP store interface (cordova-plugin-purchase or similar)
interface IAPStore {
  register: (product: { id: string; type: string }) => void;
  order: (id: string) => { then: (fn: () => void) => { error: (fn: (e: Error) => void) => void } };
  refresh: () => void;
  PAID_SUBSCRIPTION: string;
  NON_CONSUMABLE: string;
}

// Shape of the transaction object exposed by cordova-plugin-purchase.
// Property names can vary slightly across plugin versions — confirm against
// the installed version's README and adjust if needed.
interface IAPTransaction {
  signedTransactionInfo?: string;
  originalTransactionId?: string;
  transactionId?: string;
  nativePurchase?: {
    signedTransactionInfo?: string;
    originalTransactionId?: string;
  };
  appStoreReceipt?: string;
}

function getIAPStore(): (IAPStore & { latestTransaction?: IAPTransaction }) | undefined {
  const w = window as unknown as Record<string, Record<string, unknown>>;
  return (w.CdvPurchase?.store as (IAPStore & { latestTransaction?: IAPTransaction }) | undefined)
    ?? ((window as unknown as Record<string, unknown>).store as (IAPStore & { latestTransaction?: IAPTransaction }) | undefined);
}

function readSignedTransactionInfo(tx: IAPTransaction | undefined): string | undefined {
  if (!tx) return undefined;
  return tx.signedTransactionInfo ?? tx.nativePurchase?.signedTransactionInfo;
}

function readOriginalTransactionId(tx: IAPTransaction | undefined): string | undefined {
  if (!tx) return undefined;
  return tx.originalTransactionId ?? tx.nativePurchase?.originalTransactionId;
}

/**
 * Purchase via Apple In-App Purchase (StoreKit)
 * Requires cordova-plugin-purchase or @capacitor-community/in-app-purchases
 */
async function purchaseWithAppleIAP(plan: PlanId): Promise<PurchaseResult> {
  try {
    const store = getIAPStore();
    if (!store) {
      return { success: false, error: 'In-app purchases are not available on this device.' };
    }

    const productId = APPLE_PRODUCT_IDS[plan];
    const productType = store.PAID_SUBSCRIPTION;

    store.register({ id: productId, type: productType });
    store.refresh();

    return new Promise((resolve) => {
      store.order(productId)
        .then(async () => {
          try {
            const signedTransactionInfo = readSignedTransactionInfo(store.latestTransaction);
            if (!signedTransactionInfo) {
              resolve({ success: false, error: 'No signed transaction to verify.' });
              return;
            }
            const verify = httpsCallable(functions, 'verifyApplePurchase');
            await verify({ signedTransactionInfo });
            resolve({ success: true });
          } catch (err) {
            resolve({
              success: false,
              error: err instanceof Error ? err.message : 'Verification failed.',
            });
          }
        })
        .error((e: Error) => resolve({ success: false, error: e.message }));
    });
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'IAP not available. Please try again.',
    };
  }
}

/**
 * Build a fully-qualified return URL for the Stripe success/cancel
 * round-trip. Honours the Vite `BASE_URL` so checkout from a GitHub
 * Pages deployment (where the app sits at `/Maiin/`) returns to the
 * right path. Leading slashes on the supplied path are normalised
 * away to avoid `/Maiin//upgrade?...` style double-slashes.
 */
function buildReturnUrl(path: string, query: string): string {
  const baseOrigin = window.location.origin;
  // BASE_URL always includes a trailing slash per Vite. The path
  // arrived from a caller and may or may not have a leading slash.
  const cleanPath = path.replace(/^\//, "");
  return `${baseOrigin}${import.meta.env.BASE_URL}${cleanPath}?${query}`;
}

/**
 * Purchase via Stripe (web / Android)
 */
async function purchaseWithStripe(
  plan: PlanId,
  uid: string,
  email: string,
  options: PurchaseOptions = {},
): Promise<PurchaseResult> {
  const PRICE_IDS = {
    monthly: import.meta.env.VITE_STRIPE_MONTHLY_PRICE_ID || 'price_monthly',
    yearly: import.meta.env.VITE_STRIPE_YEARLY_PRICE_ID || 'price_yearly',
  };

  const CREATE_CHECKOUT_URL =
    import.meta.env.VITE_STRIPE_CHECKOUT_URL || '/api/create-checkout-session';

  const successPath = options.successPath ?? "settings";
  const cancelPath = options.cancelPath ?? "settings";

  try {
    const response = await fetch(CREATE_CHECKOUT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        priceId: PRICE_IDS[plan],
        uid,
        email,
        successUrl: buildReturnUrl(successPath, "checkout=success"),
        cancelUrl: buildReturnUrl(cancelPath, "checkout=cancelled"),
      }),
    });

    if (!response.ok) throw new Error('Failed to create checkout session');

    const { url } = await response.json();
    if (url) {
      window.location.href = url;
      return { success: true };
    }
    throw new Error('No checkout URL returned');
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Something went wrong',
    };
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
  options: PurchaseOptions = {},
): Promise<PurchaseResult> {
  if (isNativeIOS()) {
    return purchaseWithAppleIAP(plan);
  }
  return purchaseWithStripe(plan, uid, email, options);
}

/**
 * Open the platform-appropriate subscription management surface.
 *
 *   - Web / Android (Stripe): requests a billing-portal session
 *     from the `createStripeBillingPortal` callable Cloud Function
 *     and redirects to it. If the function isn't deployed yet, the
 *     call fails gracefully — the caller can surface the error.
 *   - Native iOS: returns a redirectUrl pointing to the Apple
 *     subscription management page. UIKit's deep-link
 *     itms-apps:// scheme opens the App Store subscriptions sheet
 *     directly; on the web fallback we use the http(s) URL.
 *
 * Per the spec, this is the Pro-user equivalent of "Restore
 * purchases" — restore is iOS-only and stays iOS-only. Manage works
 * on every platform but routes differently.
 */
export async function manageSubscription(uid: string): Promise<PurchaseResult> {
  if (isNativeIOS()) {
    const url = "https://apps.apple.com/account/subscriptions";
    window.location.href = url;
    return { success: true, redirectUrl: url };
  }

  try {
    const createPortal = httpsCallable<
      { uid: string; returnUrl: string },
      { url: string }
    >(functions, "createStripeBillingPortal");
    const returnUrl = `${window.location.origin}${import.meta.env.BASE_URL}settings`;
    const result = await createPortal({ uid, returnUrl });
    const url = result.data?.url;
    if (!url) {
      return {
        success: false,
        error: "Couldn't open billing portal. Please try again.",
      };
    }
    window.location.href = url;
    return { success: true, redirectUrl: url };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Couldn't open billing portal. Please try again.",
    };
  }
}

/**
 * Restore previous purchases (iOS only)
 */
export async function restorePurchases(): Promise<PurchaseResult> {
  if (!isNativeIOS()) {
    return { success: false, error: 'Restore is only available on iOS.' };
  }

  try {
    const store = getIAPStore();
    if (!store) return { success: false, error: 'IAP not available on this device.' };
    store.refresh();
    const originalTransactionId = readOriginalTransactionId(store.latestTransaction);
    if (!originalTransactionId) {
      return { success: false, error: 'No prior purchases found.' };
    }
    const restore = httpsCallable(functions, 'restoreApplePurchases');
    await restore({ originalTransactionId });
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to restore purchases.',
    };
  }
}
