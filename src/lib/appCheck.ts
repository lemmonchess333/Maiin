/**
 * Firebase App Check initialisation.
 *
 * Split from `firebase.ts` so the provider selection has a single
 * clear swap point: today we use reCAPTCHA v3 on the web and run
 * UNENFORCED on the native Capacitor shell; once the native plugin
 * is wired the `native` branch below should return a
 * CustomProvider that calls App Attest (iOS) / Play Integrity
 * (Android).
 *
 * Why this is separate:
 *   - The web provider works by hitting Google's reCAPTCHA v3
 *     endpoint from the browser. Inside a WKWebView (Capacitor iOS)
 *     reCAPTCHA technically works, but Apple's guidance is to use
 *     App Attest for native surfaces so you get attestation backed
 *     by Secure Enclave instead of a third-party risk score.
 *   - Enforcement is toggled per-service (Firestore, Storage,
 *     Functions) in the Firebase console. Ship the client first in
 *     unenforced mode, verify tokens are flowing, THEN flip
 *     enforcement on to avoid locking existing users out mid-deploy.
 *
 * Follow-up to finish native support:
 *   1. npm install @capacitor-firebase/app-check
 *   2. Add the pod dep + AppDelegate registration (Capacitor sync
 *      will do most of it)
 *   3. In the Firebase console, register the iOS app's App Attest
 *      provider and the Play Integrity provider
 *   4. Replace the `native` stub in `initAppCheck` below with a
 *      CustomProvider that calls the plugin's getToken()
 */

import type { FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { isNativePlatform } from "./platform";
import { logger } from "./logger";

/**
 * Initialise App Check for the given Firebase app. Idempotent — safe
 * to call multiple times (repeated calls are no-ops). Returns true
 * when a provider was actually installed, false when we're running
 * without enforcement (dev / missing config / native not-yet-wired).
 */
export function initAppCheck(app: FirebaseApp): boolean {
  // Web path — reCAPTCHA v3. The site key is configured in the
  // Firebase console under App Check → Register web app, and
  // exposed to the client via the VITE_RECAPTCHA_V3_SITE_KEY env.
  if (!isNativePlatform()) {
    const siteKey = import.meta.env.VITE_RECAPTCHA_V3_SITE_KEY;
    if (!siteKey) {
      if (!import.meta.env.DEV) {
        logger.warn(
          "[AppCheck] VITE_RECAPTCHA_V3_SITE_KEY not set — running without enforcement. Configure before enabling App Check enforcement in the Firebase console.",
        );
      }
      return false;
    }
    // Honour the Firebase SDK's debug-provider global for local
    // development. Set VITE_APP_CHECK_DEBUG_TOKEN to a token copied
    // from the Firebase console to bypass App Check in dev.
    const debugToken = import.meta.env.VITE_APP_CHECK_DEBUG_TOKEN;
    if (debugToken && typeof self !== "undefined") {
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
    }
    try {
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(siteKey),
        isTokenAutoRefreshEnabled: true,
      });
      return true;
    } catch (err) {
      // Repeat calls throw; treat as no-op.
      logger.warn("[AppCheck] init failed (likely HMR re-run):", err);
      return false;
    }
  }

  // Native path — App Attest (iOS) / Play Integrity (Android).
  // Not yet wired. See follow-up checklist in the module docstring.
  // Intentionally fails OPEN (returns false, app continues without
  // attestation) rather than blocking every Firebase call in the
  // native shell — the alternative would brick TestFlight builds
  // until the plugin is fully installed.
  logger.log("[AppCheck] Running on native shell without attestation — install @capacitor-firebase/app-check to enable.");
  return false;
}
