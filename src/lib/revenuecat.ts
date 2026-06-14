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
