/**
 * RevenueCat SDK lifecycle — IAP slice 2 (#1098 / EPIC #1096).
 *
 * iOS-only (Capacitor native). Web is a deliberate no-op: web monetisation is
 * the App-Store funnel (slice 7), not RevenueCat. The plugin is **dynamically
 * imported** so the web bundle never pulls in the native module — mirrors the
 * analyticsProvider web/native split (CLAUDE.md "build for the iOS app").
 *
 * Identity (ADR-0006 decision #3): the RevenueCat **App User ID === the
 * Firebase uid**, so a user's entitlement follows their account across devices
 * and a subscription is bound to the account that bought it. `configure` + log
 * in on sign-in; log out on sign-out (wired via useRevenueCatIdentity).
 *
 * SCAFFOLD STATE: every call is a guarded no-op until BOTH
 *   1. `VITE_REVENUECAT_IOS_KEY` is set (the RC public `appl_…` key), and
 *   2. `npx cap sync ios` has added the native plugin to the Xcode project,
 * per docs/iap/revenuecat-setup.md. So this lands safely behind the existing
 * purchase path and activates only once the operator foundation (#1097) exists.
 */
import { Capacitor } from "@capacitor/core";
import { logger } from "./logger";

const RC_PUBLIC_KEY = import.meta.env.VITE_REVENUECAT_IOS_KEY as
  | string
  | undefined;

/** RevenueCat only runs on the native iOS shell, and only once the public key
 *  is provisioned. Everything below short-circuits to a no-op otherwise. */
export function isRevenueCatEnabled(): boolean {
  return Capacitor.isNativePlatform() && !!RC_PUBLIC_KEY;
}

let configured = false;

// Dynamic import keeps the native plugin out of the web bundle entirely.
async function loadPurchases() {
  const mod = await import("@revenuecat/purchases-capacitor");
  return mod.Purchases;
}

/**
 * Configure the SDK once with the signed-in user's uid as the App User ID.
 * Idempotent — repeated calls (onAuthStateChanged fires several times per
 * sign-in, CLAUDE.md) after the first are no-ops.
 */
export async function configureRevenueCat(appUserID: string): Promise<void> {
  if (!isRevenueCatEnabled() || configured) return;
  try {
    const Purchases = await loadPurchases();
    await Purchases.configure({ apiKey: RC_PUBLIC_KEY!, appUserID });
    configured = true;
    logger.log("[RevenueCat] configured");
  } catch (err) {
    logger.error("[RevenueCat] configure failed", err);
  }
}

/** Bind the RC identity to a Firebase uid on sign-in. Configures on first use,
 *  otherwise switches the App User ID (account switch on a shared device). */
export async function rcLogIn(appUserID: string): Promise<void> {
  if (!isRevenueCatEnabled()) return;
  try {
    if (!configured) {
      await configureRevenueCat(appUserID);
      return;
    }
    const Purchases = await loadPurchases();
    await Purchases.logIn({ appUserID });
  } catch (err) {
    logger.error("[RevenueCat] logIn failed", err);
  }
}

/** Clear the RC identity on sign-out (RC assigns a fresh anonymous id). */
export async function rcLogOut(): Promise<void> {
  if (!isRevenueCatEnabled() || !configured) return;
  try {
    const Purchases = await loadPurchases();
    await Purchases.logOut();
  } catch (err) {
    logger.error("[RevenueCat] logOut failed", err);
  }
}

/* ------------------------------------------------------------------ */
/* Slice 3 (#1099) — purchase, restore, localized prices              */
/* ------------------------------------------------------------------ */

/** Entitlement id — must match the RC dashboard entitlement created in
 *  docs/iap/revenuecat-setup.md Part B3 (lowercase `pro`). */
const PRO_ENTITLEMENT_ID = "pro";

export interface RcPurchaseOutcome {
  success: boolean;
  /** True when the `pro` entitlement is active on the returned CustomerInfo —
   *  the caller treats this, not `success` alone, as "Pro unlocked". */
  isProActive: boolean;
  /** True when the user dismissed Apple's purchase sheet — not an error. */
  userCancelled?: boolean;
  error?: string;
}

/** Best-effort cancellation detection. The RC SDK rejects a cancelled
 *  purchase with an error carrying `userCancelled` (and a readable code on
 *  some versions) — belt-and-braces on the message so a cancel never
 *  surfaces as a scary failure toast. */
function isUserCancelled(err: unknown): boolean {
  if (typeof err === "object" && err !== null) {
    const e = err as { userCancelled?: unknown; message?: unknown };
    if (e.userCancelled === true) return true;
    if (typeof e.message === "string" && /cancel/i.test(e.message)) return true;
  }
  return false;
}

function hasProEntitlement(customerInfo: {
  entitlements: { active: Record<string, unknown> };
}): boolean {
  return customerInfo.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined;
}

/**
 * Purchase the Pro subscription for a given App Store product id (the caller
 * owns the plan → product-id mapping; passing the id keeps this module free
 * of a purchaseProvider import and the cycle that would create).
 *
 * Flow per RC docs: fetch the current Offering, find the package whose store
 * product matches, `purchasePackage`, then read the entitlement off the
 * returned CustomerInfo — RC has already verified the transaction with Apple
 * by the time this resolves, so no client-side receipt handling exists here.
 */
export async function rcPurchase(
  productId: string
): Promise<RcPurchaseOutcome> {
  if (!isRevenueCatEnabled()) {
    return {
      success: false,
      isProActive: false,
      error: "Purchases are not available in this build.",
    };
  }
  try {
    const Purchases = await loadPurchases();
    const offerings = await Purchases.getOfferings();
    const pkg = offerings.current?.availablePackages.find(
      (p) => p.product.identifier === productId
    );
    if (!pkg) {
      // Almost always an operator mismatch: ASC product id vs RC product vs
      // the hardcoded APPLE_PRODUCT_IDS (setup doc warns they must be
      // verbatim). Surface it plainly rather than a generic failure.
      logger.error("[RevenueCat] product not in current offering", productId);
      return {
        success: false,
        isProActive: false,
        error: "This plan isn't available right now. Please try again later.",
      };
    }
    const result = await Purchases.purchasePackage({ aPackage: pkg });
    const isProActive = hasProEntitlement(result.customerInfo);
    if (!isProActive) {
      logger.error("[RevenueCat] purchase completed without pro entitlement");
    }
    return { success: isProActive, isProActive };
  } catch (err) {
    if (isUserCancelled(err)) {
      return { success: false, isProActive: false, userCancelled: true };
    }
    logger.error("[RevenueCat] purchase failed", err);
    return {
      success: false,
      isProActive: false,
      error: err instanceof Error ? err.message : "Purchase failed. Try again.",
    };
  }
}

/** Restore prior purchases via RC (replaces the hand-rolled
 *  original-transaction-id flow on the RC path). */
export async function rcRestore(): Promise<RcPurchaseOutcome> {
  if (!isRevenueCatEnabled()) {
    return {
      success: false,
      isProActive: false,
      error: "Restore is not available in this build.",
    };
  }
  try {
    const Purchases = await loadPurchases();
    const { customerInfo } = await Purchases.restorePurchases();
    const isProActive = hasProEntitlement(customerInfo);
    return isProActive
      ? { success: true, isProActive: true }
      : {
          success: false,
          isProActive: false,
          error: "No prior purchases found.",
        };
  } catch (err) {
    logger.error("[RevenueCat] restore failed", err);
    return {
      success: false,
      isProActive: false,
      error:
        err instanceof Error ? err.message : "Failed to restore purchases.",
    };
  }
}

/**
 * Apple-localized display prices keyed by product id (e.g.
 * `{"com.tropos.app.pro.monthly": "£3.99"}`) from the current Offering, or
 * null when RC is disabled / offerings unavailable. Callers keep the
 * hardcoded proPlans strings as the fallback so the paywall never renders
 * priceless.
 */
export async function rcGetLocalizedPrices(): Promise<Record<
  string,
  string
> | null> {
  if (!isRevenueCatEnabled()) return null;
  try {
    const Purchases = await loadPurchases();
    const offerings = await Purchases.getOfferings();
    const packages = offerings.current?.availablePackages;
    if (!packages || packages.length === 0) return null;
    const prices: Record<string, string> = {};
    for (const p of packages) {
      prices[p.product.identifier] = p.product.priceString;
    }
    return prices;
  } catch (err) {
    logger.error("[RevenueCat] offerings fetch failed", err);
    return null;
  }
}
