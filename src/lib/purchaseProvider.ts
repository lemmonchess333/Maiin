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

export type PlanId = 'monthly' | 'yearly';

export interface PurchaseResult {
  success: boolean;
  error?: string;
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
 * Purchase via Stripe (web / Android)
 */
async function purchaseWithStripe(
  plan: PlanId,
  uid: string,
  email: string,
): Promise<PurchaseResult> {
  const PRICE_IDS = {
    monthly: import.meta.env.VITE_STRIPE_MONTHLY_PRICE_ID || 'price_monthly',
    yearly: import.meta.env.VITE_STRIPE_YEARLY_PRICE_ID || 'price_yearly',
  };

  const CREATE_CHECKOUT_URL =
    import.meta.env.VITE_STRIPE_CHECKOUT_URL || '/api/create-checkout-session';

  try {
    const response = await fetch(CREATE_CHECKOUT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        priceId: PRICE_IDS[plan],
        uid,
        email,
        successUrl: `${window.location.origin}${import.meta.env.BASE_URL}settings?checkout=success`,
        cancelUrl: `${window.location.origin}${import.meta.env.BASE_URL}settings?checkout=cancelled`,
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
 * Main purchase function — routes to the correct provider
 */
export async function purchase(
  plan: PlanId,
  uid: string,
  email: string,
): Promise<PurchaseResult> {
  if (isNativeIOS()) {
    return purchaseWithAppleIAP(plan);
  }
  return purchaseWithStripe(plan, uid, email);
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
