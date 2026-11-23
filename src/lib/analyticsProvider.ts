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
 * The web SDK sends no page views of its own (`send_page_view: false`), and
 * its config and every event carry a redacted page address and referrer
 * instead of the browser's: otherwise a page view and each event carry the
 * full URL, with another person's uid on `/user/:uid` and a typed search in
 * `?q=`, past the param redaction `analyticsClient.emit` applies. The app sends no
 * page views itself; its funnel is the named events. Native reports no
 * URL: the native SDK sees one view controller, never the web view's
 * address.
 *
 * Nothing reaches Google before the person has met the line that says so
 * (owner, 23 November 2026): the health-details agreement, in setup or on
 * its own screen, carries one line saying Tropos counts how the app is used
 * and how to turn it off (`USAGE_ANALYTICS_NOTICE`). Until then, on a
 * fresh install and after a sign-out, every event is dropped here, the web
 * SDK's chunk is never loaded, and the native SDK collects nothing: its
 * collection is off in Info.plist from the first moment of the first
 * launch (`FIREBASE_ANALYTICS_COLLECTION_ENABLED`) and is told off again
 * at launch. The notice is met when the agreement is shown this visit
 * (`noteAnalyticsNoticeShown`), or by an account that carries the
 * agreement (`setAccountMetAnalyticsNotice`). The start of the funnel
 * before it is counted on Tropos's own server with no identifier
 * (`setupCounts.ts`), never sent to Google.
 *
 * From then on the person can turn it off: Share usage analytics, in
 * Settings → Social & privacy (Priv1 call 2; the rules for the answer are
 * in `usageAnalytics.ts`).
 * Off, every event is dropped here from that moment, the native SDK's own
 * collection is switched off (it keeps that across launches), and on the
 * web the SDK is never loaded on a device whose last answer was off, or is
 * told to stop collecting if it already was. On again, both start again.
 * This is the one place that switch acts: every event comes through
 * `logAnalyticsEvent`, and nothing else loads an analytics SDK
 * (`analyticsHealthFigures.test.ts`). Crash reports are not analytics and
 * do not follow it.
 *
 * Never throws: analytics MUST NOT take down a calling flow. Init is async
 * and lazy — events emitted before init resolves are dropped rather than
 * queued. A few lost boot events are an acceptable trade for not carrying
 * an unbounded buffer.
 */
import type { FirebaseApp } from "firebase/app";
import { isNativePlatform } from "./platform";
import { logger } from "./logger";
import { redactPageReferrer, redactPageUrl } from "./analyticsRedaction";
import {
  rememberUsageAnalyticsOnThisDevice,
  usageAnalyticsOnThisDevice,
} from "./usageAnalytics";

/**
 * Why analytics is (or isn't) delivering. Surfaced on the operator
 * Diagnostics page so a "0% verified requests" investigation has a first
 * answer without opening dev tools.
 */
export type AnalyticsStatus =
  | "uninitialised" // initAnalytics not called yet
  | "pending" // init started, provider resolving asynchronously
  | "active" // delivering (web SDK or native plugin)
  | "before-notice" // the person has not met the analytics line yet
  | "off" // the person turned Share usage analytics off
  | "unconfigured" // web: no VITE_FIREBASE_MEASUREMENT_ID
  | "unsupported" // web: isSupported() returned false
  | "error"; // init threw (web SDK load, or native plugin / missing plist)

/** Unified delivery sink. Set while a provider (web or native) is live and
 *  the person shares usage analytics; null otherwise. */
type DeliverFn = (event: string, params: Record<string, unknown>) => void;

type NativeAnalytics =
  (typeof import("@capacitor-firebase/analytics"))["FirebaseAnalytics"];

let deliver: DeliverFn | null = null;
let initStarted = false;
let status: AnalyticsStatus = "uninitialised";
let firebaseApp: FirebaseApp | null = null;

/** Whether the person shares usage analytics, as this device knows it:
 *  the device's kept answer until `setUsageAnalytics` says otherwise. */
let sharing: boolean | null = null;
function shares(): boolean {
  if (sharing === null) sharing = usageAnalyticsOnThisDevice();
  return sharing;
}

/** Whether the person has met the analytics line: on their account, which
 *  carries the agreement the line sits on, or on the agreement shown in
 *  this visit. Neither is kept on the device. */
let accountMetNotice = false;
let noticeShownThisVisit = false;
function metNotice(): boolean {
  return accountMetNotice || noticeShownThisVisit;
}

/** Whether Google Analytics may run: the line met, and not turned off. */
function delivers(): boolean {
  return metNotice() && shares();
}

/** The web SDK once loaded: its delivery and its collection switch. */
let web: { deliver: DeliverFn; collect: (on: boolean) => void } | null = null;

/** The native plugin once loaded. Held in an object, never resolved from a
 *  promise: a Capacitor plugin answers `then` with a native call, and a
 *  promise resolved with one never settles (CLAUDE.md's gotcha). */
let native: { plugin: NativeAnalytics } | null = null;

/* Every change to the provider runs here, one after another: init first,
   then each answer in the order it was given, so an off and an on tapped
   quickly reach the native SDK in that order. */
let work: Promise<void> = Promise.resolve();
function queue(step: () => Promise<void>): void {
  work = work
    .then(step)
    .catch((err) => logger.warn("[Analytics] provider step failed:", err));
}

let markStarted: () => void = () => {};
const started = new Promise<void>((resolve) => {
  markStarted = resolve;
});

/**
 * Resolves once analytics knows whether it delivers: true when a provider is
 * live and the person shares usage analytics, false when off, unconfigured,
 * unsupported or failed. Waits for init, and for any answer still being
 * applied. For an event sent once per account (`launchEvents.ts`), which
 * must not be claimed by a device whose events go nowhere, or sent before
 * the provider can take it.
 */
export async function analyticsSettled(): Promise<boolean> {
  await started;
  let current: Promise<void>;
  do {
    current = work;
    await current;
  } while (current !== work);
  return deliver !== null;
}

/**
 * Begin analytics initialisation for the given Firebase app. Idempotent —
 * repeat calls are no-ops. Returns immediately; the provider resolves
 * asynchronously (dynamic import + capability checks).
 */
export function initAnalytics(app: FirebaseApp): void {
  if (initStarted) return;
  initStarted = true;
  firebaseApp = app;
  status = "pending";
  markStarted();
  queue(isNativePlatform() ? startNative : () => applyWeb(delivers()));
}

/** Apply a change to what `delivers()` says, if it changed. Off drops every
 *  event at once, before the provider has heard. */
function reapply(before: boolean): void {
  const now = delivers();
  if (!now) deliver = null;
  if (before === now) return;
  if (!initStarted) return; // init reads the answer when it starts
  queue(isNativePlatform() ? () => applyNative(now) : () => applyWeb(now));
}

/**
 * The health-details agreement, with its analytics line, is on screen
 * (setup's step, or the agreement's own screen): Google Analytics may run
 * from here on in this visit, unless the device turned it off. Never throws.
 */
export function noteAnalyticsNoticeShown(): void {
  if (noticeShownThisVisit) return;
  const before = delivers();
  noticeShownThisVisit = true;
  reapply(before);
}

/**
 * Whether the signed-in account carries the agreement, and so met the line
 * on it: from the account as it loads, false with no account. Signing out
 * also forgets the agreement shown this visit, so the next person on the
 * phone starts before the line. Never throws.
 */
export function setAccountMetAnalyticsNotice(met: boolean): void {
  const before = delivers();
  accountMetNotice = met;
  reapply(before);
}

/** Signed out: the next person on this phone has not met the line. */
export function forgetAnalyticsNoticeShown(): void {
  const before = delivers();
  noticeShownThisVisit = false;
  accountMetNotice = false;
  reapply(before);
}

/**
 * The person's answer to Share usage analytics, from the Settings switch or
 * from the account as it loads. Kept on this device for its next launch.
 * Off drops every event from this call on, before the provider has heard;
 * the provider is then switched in turn. Never throws.
 */
export function setUsageAnalytics(on: boolean): void {
  const before = delivers();
  rememberUsageAnalyticsOnThisDevice(on);
  sharing = on;
  reapply(before);
}

/** The status for not delivering, by why. */
function quietStatus(): AnalyticsStatus {
  return metNotice() ? "off" : "before-notice";
}

/** Web: off loads nothing, or stops a loaded SDK collecting; on loads it
 *  the first time and starts it collecting again after that. */
async function applyWeb(on: boolean): Promise<void> {
  if (!on) {
    deliver = null;
    web?.collect(false);
    if (
      status === "pending" ||
      status === "active" ||
      status === "off" ||
      status === "before-notice"
    )
      status = quietStatus();
    return;
  }
  // A newer off is queued behind this on: gtag stays as it is until then,
  // never collecting again in between.
  if (!delivers()) return;
  if (web) {
    web.collect(true);
    deliver = web.deliver;
    status = "active";
    return;
  }
  // Loaded once: unconfigured, unsupported and a failed load are final.
  if (status === "pending" || status === "off" || status === "before-notice")
    await loadWeb();
}

/** Web path — firebase/analytics, gated on measurementId + isSupported(). */
async function loadWeb(): Promise<void> {
  const app = firebaseApp;
  if (!app) return;
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

  try {
    const {
      initializeAnalytics,
      isSupported,
      logEvent,
      setAnalyticsCollectionEnabled,
    } = await import("firebase/analytics");
    if (!(await isSupported())) {
      status = "unsupported";
      logger.log(
        "[Analytics] isSupported() false — no delivery in this environment."
      );
      return;
    }
    // Turned off, or signed out, while the SDK loaded: start nothing.
    if (!delivers()) {
      status = quietStatus();
      return;
    }
    // The page fields in the config are what gtag's own events (user
    // engagement and the like) carry; each event below sets its own.
    const handle = initializeAnalytics(app, {
      config: { send_page_view: false, ...redactedPage() },
    });
    web = {
      deliver: (event, params) =>
        logEvent(handle, event, { ...params, ...redactedPage() }),
      // gtag's own switch: off, it sends nothing, its own events included.
      collect: (collecting) =>
        setAnalyticsCollectionEnabled(handle, collecting),
    };
    deliver = web.deliver;
    status = "active";
    logger.log("[Analytics] Firebase Analytics (web) initialised.");
  } catch (err) {
    status = "error";
    logger.warn("[Analytics] web init failed:", err);
  }
}

/** The page fields a web event carries, in place of the ones gtag would
 *  read from the address bar and the tab's title. The title is the app's
 *  name, never `document.title`: during a lift's rest that counts the rest
 *  down (`restOutside.ts`), a training figure. */
function redactedPage(): {
  page_location: string;
  page_referrer: string;
  page_title: string;
} {
  const base = import.meta.env.BASE_URL;
  return {
    page_title: "Tropos",
    page_location: redactPageUrl(window.location.href, base),
    page_referrer: redactPageReferrer(
      document.referrer,
      window.location.origin,
      base
    ),
  };
}

/** Native path — @capacitor-firebase/analytics, backed by the plist config. */
async function startNative(): Promise<void> {
  try {
    const { FirebaseAnalytics } = await import("@capacitor-firebase/analytics");
    native = { plugin: FirebaseAnalytics };
  } catch (err) {
    status = "error";
    logger.warn(
      "[Analytics] native plugin failed to load (is it synced?):",
      err
    );
    return;
  }
  await applyNative(delivers());
}

/** Native: the SDK's collection switch, which it keeps across launches, so
 *  a device that turned it off is off from the next launch's first moment,
 *  before this code runs. Info.plist starts it off on a fresh install, so
 *  nothing goes before the line is met. Called at launch too, off until the
 *  line is met in this launch, so a device's kept answer and the SDK's never
 *  disagree for long. */
async function applyNative(on: boolean): Promise<void> {
  if (!native) return; // the plugin never loaded: `status` says why
  const { plugin } = native;
  try {
    await plugin.setEnabled({ enabled: on });
  } catch (err) {
    deliver = null;
    status = "error";
    logger.warn(
      "[Analytics] native init failed (is GoogleService-Info.plist present and the plugin synced?):",
      err
    );
    return;
  }
  // A newer answer is queued behind this one and will set both.
  if (delivers() !== on) return;
  deliver = on
    ? (event, params) => {
        void plugin.logEvent({ name: event, params });
      }
    : null;
  status = on ? "active" : quietStatus();
  if (on) logger.log("[Analytics] Firebase Analytics (native) initialised.");
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
