/**
 * Firebase Analytics provider — the real delivery backend behind
 * `analyticsClient.emit()`.
 *
 * Mirrors the `appCheck.ts` swap-point shape: ONE file owns the provider
 * decision so the per-surface `track()` wrappers (home, paywall, food,
 * social, …) never import a provider SDK directly. Until this landed,
 * `emit()` routed only to a dev-gated logger, so production builds carried
 * zero analytics weight — every instrumented event went nowhere. Now the
 * same call sites deliver to Firebase Analytics in production with no
 * change to any of them.
 *
 * Web only for now. Native (Capacitor) is a deliberate no-op — same staged
 * shape as appCheck's native branch — until the
 * `@capacitor-firebase/analytics` plugin is wired; the firebase/analytics
 * web SDK uses the browser measurement protocol and isn't valid inside the
 * WKWebView / Android shell.
 *
 * Gating (ALL must hold or we stay a no-op, matching prod-today behaviour):
 *   - running on web (not native)
 *   - a measurementId is configured (VITE_FIREBASE_MEASUREMENT_ID)
 *   - the browser environment supports it (analytics `isSupported()` —
 *     false under SSR and some privacy modes)
 *
 * firebase/analytics is loaded via dynamic import so it stays out of the
 * critical-path bundle and only downloads when a measurementId is present.
 *
 * Never throws: analytics MUST NOT take down a calling flow. Init is async
 * (isSupported() is a promise) and lazy — events emitted before init
 * resolves are dropped rather than queued. A few lost boot events are an
 * acceptable trade for not carrying an unbounded buffer.
 */
import type { FirebaseApp } from "firebase/app";
import type { Analytics } from "firebase/analytics";
import { isNativePlatform } from "./platform";
import { logger } from "./logger";

/**
 * Why analytics is (or isn't) delivering. Surfaced on the operator
 * Diagnostics page so a "0% verified requests" investigation has a
 * first answer without opening dev tools.
 */
export type AnalyticsStatus =
  | "uninitialised" // initAnalytics not called yet
  | "pending" // init started, awaiting isSupported() / getAnalytics()
  | "active" // handle installed, delivering
  | "native" // native shell — web SDK not used
  | "unconfigured" // no VITE_FIREBASE_MEASUREMENT_ID
  | "unsupported" // isSupported() returned false
  | "error"; // init threw

let analyticsHandle: Analytics | null = null;
let logEventFn:
  | ((
      analytics: Analytics,
      name: string,
      params?: Record<string, unknown>
    ) => void)
  | null = null;
let initStarted = false;
let status: AnalyticsStatus = "uninitialised";

/**
 * Begin analytics initialisation for the given Firebase app. Idempotent —
 * repeat calls are no-ops. Returns immediately; the actual provider handle
 * resolves asynchronously (see `isSupported()` above).
 */
export function initAnalytics(app: FirebaseApp): void {
  if (initStarted) return;
  initStarted = true;

  if (isNativePlatform()) {
    status = "native";
    logger.log(
      "[Analytics] Native shell — firebase/analytics web SDK not used; install @capacitor-firebase/analytics to enable native delivery."
    );
    return;
  }

  const measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID;
  if (!measurementId) {
    status = "unconfigured";
    if (!import.meta.env.DEV) {
      logger.warn(
        "[Analytics] VITE_FIREBASE_MEASUREMENT_ID not set — events are not delivered. Configure to enable analytics."
      );
    }
    return;
  }

  status = "pending";
  void (async () => {
    try {
      const { getAnalytics, isSupported, logEvent } =
        await import("firebase/analytics");
      if (!(await isSupported())) {
        status = "unsupported";
        logger.log(
          "[Analytics] isSupported() false — no delivery in this environment."
        );
        return;
      }
      analyticsHandle = getAnalytics(app);
      logEventFn = logEvent;
      status = "active";
      logger.log("[Analytics] Firebase Analytics initialised.");
    } catch (err) {
      status = "error";
      logger.warn("[Analytics] init failed:", err);
    }
  })();
}

/**
 * Deliver a single event to the provider. No-op (and never throws) when
 * the provider isn't active — before init resolves, on native, or when
 * unconfigured. `params` must already be redaction-sanitised by the caller
 * (`analyticsClient.emit` owns that).
 */
export function logAnalyticsEvent(
  event: string,
  params: Record<string, unknown>
): void {
  if (!analyticsHandle || !logEventFn) return;
  try {
    logEventFn(analyticsHandle, event, params);
  } catch (err) {
    logger.warn("[Analytics] logEvent failed:", { event, err: String(err) });
  }
}

/** True when a provider handle is currently installed. For diagnostics. */
export function isAnalyticsActive(): boolean {
  return analyticsHandle !== null;
}

/** Current provider status — the "why" behind active/inactive. For diagnostics. */
export function getAnalyticsStatus(): AnalyticsStatus {
  return status;
}
