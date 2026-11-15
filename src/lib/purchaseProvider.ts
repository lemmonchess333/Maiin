/**
 * Purchase Provider Abstraction (App Store Guideline 3.1.1)
 *
 * Detects platform and routes purchases to the correct provider:
 * - iOS native: Apple In-App Purchase, through RevenueCat
 * - Web: RevenueCat Billing's hosted checkout on Tropos's own Stripe
 *   account (owner, 13 Nov 2026), which grants the same Pro entitlement
 *
 * For iOS App Store submission, all digital goods MUST use Apple IAP.
 */

import { Capacitor } from "@capacitor/core";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import { describeRejection } from "@/lib/callableErrors";
import type { PlanId, StorePrice } from "@/lib/proPlans";
import {
  isRevenueCatEnabled,
  rcGetLocalizedPrices,
  rcPurchase,
  rcRestore,
  type PurchasePending,
} from "@/lib/revenuecat";
import { traceBoot } from "@/lib/bootTrace";
import type { PurchaseOutcome } from "@/lib/checkoutFlow";

export type { PlanId, PurchasePending };

/** What a restore or "Manage subscription" came to. A purchase comes to a
 *  `PurchaseOutcome` instead (`checkoutFlow.ts`), one of five. */
export interface PurchaseResult {
  success: boolean;
  /** A sentence for the person: callers show it as it is. */
  error?: string;
  /** The underlying error's own text (an SDK's, a fetch's), for logs and
   *  telemetry. Never shown. */
  detail?: string;
  /** Optional URL the caller can redirect to (the customer portal, the
   *  App Store's subscriptions page). When set, the caller is responsible
   *  for navigation — manageSubscription() does its own redirect for the
   *  standard flow, but having the URL on the result lets callers handle
   *  it via window.open instead. */
  redirectUrl?: string;
}

/**
 * Where a paywall was opened from, for analytics. The web checkout's
 * return page is set on RevenueCat's Web Purchase Link itself (Upgrade,
 * `?checkout=success`), so this no longer chooses one.
 */
export type CheckoutEntryPoint = "settings" | "upgrade" | "home";

/** Options for {@link purchase}. */
export interface PurchaseOptions {
  /** Where the paywall was opened from. */
  entryPoint?: CheckoutEntryPoint;
  /** Analytics dimension — propagated through paywallAnalytics. */
  source?: string;
  /** Whether the paywall offered a trial. The trial itself is the store's
   *  (App Store Connect's introductory offer, or the web product's own),
   *  so a purchase does not send it. */
  withTrial?: boolean;
}

// True inside the native iOS Capacitor shell, on an iPhone or an iPad.
//
// Asks Capacitor which shell the bundle runs in, never the user agent. An
// iPad's WKWebView reports a desktop Mac user agent (Capacitor's default
// content mode, "recommended", is desktop-class on iPad), so the old
// `/iPhone|iPad|iPod/` test sent every iPad purchase down the Stripe path,
// hid Restore and printed the web's renewal wording — on the device App
// Review also tests the iPhone build on. `getPlatform()` is "ios" exactly
// when the native iOS bridge is present, so mobile Safari on an iPhone is
// still the web (the case the older `!!window.Capacitor` check got wrong).
export function isNativeIOS(): boolean {
  return Capacitor.getPlatform() === "ios";
}

/**
 * Whether this build can take a purchase. On the iPhone that needs
 * RevenueCat, whose key `deploy-ios.yml` passes from the
 * `VITE_REVENUECAT_IOS_KEY` secret; a build made without it can only
 * refuse in `purchase()`. A paywall that
 * shows prices and a button which cannot work is what App Review rejects
 * (Guideline 2.1), so the paywalls show neither in that build.
 */
export function canSellInThisBuild(): boolean {
  return isNativeIOS() ? isRevenueCatEnabled() : !!webPurchaseToken();
}

/** The production token of the website's RevenueCat Web Purchase Link, or
 *  empty in a build without one, which then shows no price and no buy
 *  button. Read when asked, so a test can set it. */
function webPurchaseToken(): string {
  return import.meta.env.VITE_REVENUECAT_WEB_PURCHASE_TOKEN ?? "";
}

/** The packages of the offering the Web Purchase Link sells, by RevenueCat's
 *  standard identifiers (docs/iap/revenuecat-setup.md, the web part). */
export const WEB_PACKAGE_IDS: Record<PlanId, string> = {
  monthly: "$rc_monthly",
  yearly: "$rc_annual",
};

/**
 * The hosted checkout for `plan`, as the signed-in person: RevenueCat's
 * Web Purchase Link with their uid as the App User ID (ADR-0006: App User
 * ID === uid), so the purchase grants Pro to this account on every
 * platform. The email is filled in for them. Where it returns after paying
 * is set on the link itself (Upgrade, `?checkout=success`).
 */
export function webPurchaseUrl(
  plan: PlanId,
  uid: string,
  email: string,
  token: string = webPurchaseToken()
): string {
  const params = new URLSearchParams({ package_id: WEB_PACKAGE_IDS[plan] });
  if (email) params.set("email", email);
  return `https://pay.rev.cat/${encodeURIComponent(token)}/${encodeURIComponent(uid)}?${params}`;
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
 * Purchase on the web: RevenueCat Billing's hosted checkout (owner, 13 Nov
 * 2026). It replaced a Stripe Checkout path that never worked (it sent no
 * sign-in token to a function that requires one). The trial, if the plan
 * has one, is the product's own; RevenueCat grants Pro through the same
 * webhook as an App Store purchase, and Upgrade syncs it on the way back.
 */
function purchaseOnWeb(
  plan: PlanId,
  uid: string,
  email: string
): PurchaseOutcome {
  const token = webPurchaseToken();
  if (!token || !uid) {
    return {
      kind: "failed",
      message: "Purchases aren’t available in this build.",
    };
  }
  const url = webPurchaseUrl(plan, uid, email, token);
  window.location.href = url;
  return { kind: "redirected", url };
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
async function purchaseWithRevenueCat(
  plan: PlanId,
  uid: string
): Promise<PurchaseOutcome> {
  const productId = APPLE_PRODUCT_IDS[plan];
  const outcome = await rcPurchase(productId, uid);
  switch (outcome.kind) {
    case "cancelled":
    case "failed":
      return outcome;
    case "pending":
      // A purchase the store took is what the sync is for: it asks
      // RevenueCat again from the server. An approval has nothing to sync
      // until it is given, and the webhook brings that.
      if (outcome.pending === "entitlement") {
        await syncEntitlementBestEffort(
          outcome.price ? reportedPrice(productId, outcome.price) : undefined
        );
      }
      return { kind: "pending", pending: outcome.pending };
    case "bought":
      await syncEntitlementBestEffort(
        outcome.price ? reportedPrice(productId, outcome.price) : undefined
      );
      return { kind: "bought" };
  }
}

/** The price the server keeps for the trial reminder's email
 *  (functions/lib/trialReminder.js readReportedPrice). */
interface ReportedPrice {
  productId: string;
  amount: number;
  currencyCode: string;
  display: string;
}

function reportedPrice(productId: string, price: StorePrice): ReportedPrice {
  return {
    productId,
    amount: price.price,
    currencyCode: price.currencyCode,
    display: price.priceString,
  };
}

/** Nudge the backend to pull the fresh entitlement from RC and write the
 *  profile fields immediately. MUST never fail a successful purchase — the
 *  webhook lands the same write within seconds regardless. `price` is what
 *  Apple's sheet showed, for a trial's reminder email. */
async function syncEntitlementBestEffort(price?: ReportedPrice): Promise<void> {
  const started = Date.now();
  traceBoot("Server: syncing Pro");
  try {
    const sync = httpsCallable(functions, "syncRevenueCatEntitlement");
    await sync(price ? { price } : {});
    traceBoot(`Server: Pro synced in ${Date.now() - started} ms`);
  } catch (error) {
    /* tolerated: webhook is the source of truth */
    traceBoot(
      `Server: sync failed after ${Date.now() - started} ms (${error instanceof Error ? error.message : String(error)})`
    );
  }
}

/**
 * Report the store's price for a trial whose record has none: the sync
 * after the purchase never landed (the webhook recorded the trial without
 * it). Best effort, like the sync; returns whether a price was sent.
 */
export async function reportTrialPrice(productId: string): Promise<boolean> {
  if (!isNativeIOS() || !isRevenueCatEnabled()) return false;
  const prices = await rcGetLocalizedPrices();
  const price = prices?.[productId];
  if (!price) return false;
  await syncEntitlementBestEffort(reportedPrice(productId, price));
  return true;
}

/**
 * Main purchase function — routes to the correct provider: RevenueCat's
 * App Store purchase on iOS, its hosted web checkout elsewhere. Options are
 * the paywall's own and are not sent to either.
 */
export async function purchase(
  plan: PlanId,
  uid: string,
  email: string,
  _options: PurchaseOptions = {}
): Promise<PurchaseOutcome> {
  if (isNativeIOS()) {
    if (isRevenueCatEnabled()) {
      return purchaseWithRevenueCat(plan, uid);
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
      kind: "failed",
      message: "Purchases aren’t available in this build.",
    };
  }
  return purchaseOnWeb(plan, uid, email);
}

/** Back from the web checkout: ask the server to read the new entitlement
 *  now rather than wait for the webhook. Best effort, like after an App
 *  Store purchase. */
export async function syncAfterWebPurchase(): Promise<void> {
  if (isNativeIOS()) return;
  await syncEntitlementBestEffort();
}

/**
 * Open the platform-appropriate subscription management surface.
 *
 *   - Web: RevenueCat's management link for the signed-in subscriber
 *     (`getSubscriptionManagementUrl`): for a web purchase, the customer
 *     portal, where they cancel or change their card.
 *   - Native iOS: returns a redirectUrl pointing to the Apple
 *     subscription management page. UIKit's deep-link
 *     itms-apps:// scheme opens the App Store subscriptions sheet
 *     directly; on the web fallback we use the http(s) URL.
 *
 * Per the spec, this is the Pro-user equivalent of "Restore
 * purchases" — restore is iOS-only and stays iOS-only. Manage works
 * on every platform but routes differently.
 */
export async function manageSubscription(
  _uid: string
): Promise<PurchaseResult> {
  if (isNativeIOS()) {
    const url = "https://apps.apple.com/account/subscriptions";
    window.location.href = url;
    return { success: true, redirectUrl: url };
  }

  try {
    // RevenueCat's own link for this subscriber: on the web, the customer
    // portal, where they cancel or change their card. The server reads it
    // for the signed-in person (functions/revenueCat.js).
    const manageLink = httpsCallable<Record<string, never>, { url: string }>(
      functions,
      "getSubscriptionManagementUrl"
    );
    const result = await manageLink({});
    const url = result.data?.url;
    if (!url) {
      return {
        success: false,
        error: "Couldn’t open billing portal. Try again.",
      };
    }
    window.location.href = url;
    return { success: true, redirectUrl: url };
  } catch (err) {
    logger.error("[purchase] billing portal failed", err);
    return {
      success: false,
      // A failed-precondition carries a sentence the server wrote for the
      // person; any other code's message is the server's own.
      error:
        describeRejection(err) ?? "Couldn’t open billing portal. Try again.",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Restore previous purchases (iOS only)
 */
export async function restorePurchases(): Promise<PurchaseResult> {
  if (!isNativeIOS()) {
    return { success: false, error: "Restore is only available on iOS." };
  }

  if (!isRevenueCatEnabled()) {
    return { success: false, error: "Restore isn’t available in this build." };
  }

  const outcome = await rcRestore();
  if (!outcome.success) {
    return {
      success: false,
      error: outcome.error ?? "Couldn’t restore your purchases.",
      detail: outcome.detail,
    };
  }
  await syncEntitlementBestEffort();
  return { success: true };
}
