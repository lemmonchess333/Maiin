/**
 * Firebase App Check initialisation.
 *
 * Split from `firebase.ts` so the provider selection has a single
 * clear swap point: today we use reCAPTCHA v3 on the web and run
 * UNENFORCED on the native Capacitor shell; once the native plugin
 * is wired the `nativeProviderFactory` injection point below
 * accepts a CustomProvider that calls App Attest (iOS) / Play
 * Integrity (Android).
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
 *     The full staged-rollout plan lives in
 *     `docs/app-check-rollout.md`.
 *
 * PR F (audit P0 #6): pre-PR-F the native branch was a hardcoded
 * stub that always returned false. Now `setNativeAppCheckProvider`
 * is the injection point — when `@capacitor-firebase/app-check` is
 * installed, that plugin's wrapper calls `setNativeAppCheckProvider`
 * during app boot with a factory that returns the CustomProvider.
 * `initAppCheck` then routes to it on native instead of the stub.
 * Keeping the injection async-shaped so plugin-side token fetch can
 * be awaited cleanly.
 */

import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  getToken,
  type AppCheck,
  type AppCheckTokenResult,
  type CustomProvider,
} from "firebase/app-check";
import type { FirebaseApp } from "firebase/app";
import { isNativePlatform } from "./platform";
import { logger } from "./logger";

/**
 * Factory the native plugin wrapper calls to install its CustomProvider.
 *
 * Usage (when the plugin lands):
 *
 *   import { setNativeAppCheckProvider } from "@/lib/appCheck";
 *   import { CustomProvider } from "firebase/app-check";
 *   import { FirebaseAppCheck } from "@capacitor-firebase/app-check";
 *
 *   setNativeAppCheckProvider(() =>
 *     new CustomProvider({
 *       getToken: async () => {
 *         const { token } = await FirebaseAppCheck.getToken();
 *         // The plugin returns an opaque token + expiry; reshape
 *         // for the firebase/app-check CustomProvider contract.
 *         return { token, expireTimeMillis: Date.now() + 60 * 60 * 1000 };
 *       },
 *     }),
 *   );
 *
 * Single call site keeps the plugin install footprint to one
 * register-in-bootstrap line.
 */
type NativeAppCheckProviderFactory = () => CustomProvider;
let nativeProviderFactory: NativeAppCheckProviderFactory | null = null;

export function setNativeAppCheckProvider(
  factory: NativeAppCheckProviderFactory,
): void {
  nativeProviderFactory = factory;
}

/** Module-scoped handle so `getAppCheckToken` can read tokens
 *  without re-initialising. Populated by `initAppCheck`. */
let appCheckHandle: AppCheck | null = null;

/**
 * Initialise App Check for the given Firebase app. Idempotent — safe
 * to call multiple times (repeated calls are no-ops). Returns true
 * when a provider was actually installed, false when we're running
 * without enforcement (dev / missing config / native not-yet-wired).
 */
export function initAppCheck(app: FirebaseApp): boolean {
  if (appCheckHandle) return true;

  // Native path — App Attest (iOS) / Play Integrity (Android).
  // Routed through the injection point so the plugin wrapper can
  // wire its CustomProvider once at app boot. When no factory is
  // registered, the native shell runs without attestation (fail-
  // open) rather than blocking every Firebase call — the
  // alternative would brick TestFlight builds until the plugin is
  // fully installed.
  if (isNativePlatform()) {
    if (!nativeProviderFactory) {
      logger.log(
        "[AppCheck] Running on native shell without attestation — install @capacitor-firebase/app-check and call setNativeAppCheckProvider() to enable.",
      );
      return false;
    }
    try {
      appCheckHandle = initializeAppCheck(app, {
        provider: nativeProviderFactory(),
        isTokenAutoRefreshEnabled: true,
      });
      logger.log("[AppCheck] Native CustomProvider initialised.");
      return true;
    } catch (err) {
      logger.warn("[AppCheck] Native init failed:", err);
      return false;
    }
  }

  // Web path — reCAPTCHA v3. The site key is configured in the
  // Firebase console under App Check → Register web app, and
  // exposed to the client via the VITE_RECAPTCHA_V3_SITE_KEY env.
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
    appCheckHandle = initializeAppCheck(app, {
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

/**
 * Diagnostic helper. Returns the current App Check token (or null
 * if uninitialised / fetch failed). Intended for the operator-
 * diagnostics surface — checks the SDK is producing tokens before
 * enforcement is flipped on in the Firebase console.
 *
 * Never throws — diagnostics shouldn't crash the app even when the
 * provider is misconfigured.
 */
export async function getAppCheckToken(): Promise<AppCheckTokenResult | null> {
  if (!appCheckHandle) return null;
  try {
    return await getToken(appCheckHandle, /* forceRefresh */ false);
  } catch (err) {
    logger.warn("[AppCheck] getToken failed:", err);
    return null;
  }
}

/**
 * True when an App Check provider is currently installed. Useful
 * for diagnostics ("App Check: active / inactive") without exposing
 * the actual token to the UI.
 */
export function isAppCheckActive(): boolean {
  return appCheckHandle !== null;
}
