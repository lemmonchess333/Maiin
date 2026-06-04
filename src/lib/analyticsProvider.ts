/**
 * Firebase Analytics provider — the real delivery backend behind
 * `analyticsClient.emit()`.
 *
 * Mirrors the `appCheck.ts` swap-point shape: ONE file owns the provider
 * decision so the per-surface `track()` wrappers (home, paywall, food,
 * social, lifecycle, …) never import a provider SDK directly. The same
 * call sites deliver to Firebase Analytics on BOTH platforms unchanged:
 *
 *   - **Web** — the `firebase/analytics` web SDK (browser measurement
 *     protocol), gated on a configured `VITE_FIREBASE_MEASUREMENT_ID` +
 *     `isSupported()` (false under SSR / some privacy modes).
 *   - **Native (iOS/Android)** — the `@capacitor-firebase/analytics`
 *     plugin, which bridges to the native Firebase SDK configured via
 *     `GoogleService-Info.plist` (iOS) / `google-services.json` (Android).
 *     There is NO measurement-ID env var on native — the native SDK reads
 *     the plist; the env var is web-only.
 *
 * Both providers are loaded via dynamic `import()` so each stays in its own
 * chunk: the native plugin chunk never loads on web, and the web SDK chunk
 * never loads on native. This is the both-ways parity rule (CLAUDE.md) —
 * web keeps working as the preview surface, native delivers on-device.
 *
 * Never throws: analytics MUST NOT take down a calling flow. Init is async
 * and lazy — events emitted before init resolves are dropped rather than
 * queued. A few lost boot events are an acceptable trade for not carrying
 * an unbounded buffer.
 */
import type { FirebaseApp } from "firebase/app";
import { isNativePlatform } from "./platform";
import { logger } from "./logger";

/**
 * Why analytics is (or isn't) delivering. Surfaced on the operator
 * Diagnostics page so a "0% verified requests" investigation has a first
 * answer without opening dev tools.
 */
export type AnalyticsStatus =
  | "uninitialised" // initAnalytics not called yet
  | "pending" // init started, provider resolving asynchronously
  | "active" // delivering (web SDK or native plugin)
  | "unconfigured" // web: no VITE_FIREBASE_MEASUREMENT_ID
  | "unsupported" // web: isSupported() returned false
  | "error"; // init threw (web SDK load, or native plugin / missing plist)

/** Unified delivery sink. Set once a provider (web or native) is live. */
type DeliverFn = (event: string, params: Record<string, unknown>) => void;

let deliver: DeliverFn | null = null;
let initStarted = false;
let status: AnalyticsStatus = "uninitialised";

/**
 * Begin analytics initialisation for the given Firebase app. Idempotent —
 * repeat calls are no-ops. Returns immediately; the provider resolves
 * asynchronously (dynamic import + capability checks).
 */
export function initAnalytics(app: FirebaseApp): void {
  if (initStarted) return;
  initStarted = true;
  status = "pending";

  if (isNativePlatform()) {
    initNative();
  } else {
    initWeb(app);
  }
}

/** Web path — firebase/analytics, gated on measurementId + isSupported(). */
function initWeb(app: FirebaseApp): void {
  const measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID;
  if (!measurementId) {
    status = "unconfigured";
    if (!import.meta.env.DEV) {
      logger.warn(
        "[Analytics] VITE_FIREBASE_MEASUREMENT_ID not set — web events are not delivered. Configure to enable analytics."
      );
    }
    return;
  }

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
      const handle = getAnalytics(app);
      deliver = (event, params) => logEvent(handle, event, params);
      status = "active";
      logger.log("[Analytics] Firebase Analytics (web) initialised.");
    } catch (err) {
      status = "error";
      logger.warn("[Analytics] web init failed:", err);
    }
  })();
}

/** Native path — @capacitor-firebase/analytics, backed by the plist config. */
function initNative(): void {
  void (async () => {
    try {
      const { FirebaseAnalytics } =
        await import("@capacitor-firebase/analytics");
      // Honour the native SDK's collection toggle. Safe no-op if already on.
      await FirebaseAnalytics.setEnabled({ enabled: true });
      deliver = (event, params) => {
        void FirebaseAnalytics.logEvent({ name: event, params });
      };
      status = "active";
      logger.log("[Analytics] Firebase Analytics (native) initialised.");
    } catch (err) {
      status = "error";
      logger.warn(
        "[Analytics] native init failed (is GoogleService-Info.plist present and the plugin synced?):",
        err
      );
    }
  })();
}

/**
 * Deliver a single event to the active provider. No-op (and never throws)
 * when no provider is live — before init resolves, or when unconfigured /
 * unsupported / errored. `params` must already be redaction-sanitised by
 * the caller (`analyticsClient.emit` owns that).
 */
export function logAnalyticsEvent(
  event: string,
  params: Record<string, unknown>
): void {
  if (!deliver) return;
  try {
    deliver(event, params);
  } catch (err) {
    logger.warn("[Analytics] logEvent failed:", { event, err: String(err) });
  }
}

/** True when a provider is currently delivering. For diagnostics. */
export function isAnalyticsActive(): boolean {
  return deliver !== null;
}

/** Current provider status — the "why" behind active/inactive. For diagnostics. */
export function getAnalyticsStatus(): AnalyticsStatus {
  return status;
}
