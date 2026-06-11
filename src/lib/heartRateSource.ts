/**
 * Heart-rate source abstraction — the native-injection seam for live HR.
 *
 * Mirrors `locationSource.ts`: features read the HR stream through this seam
 * instead of touching a platform API directly, so the *source* of beats can
 * differ by platform without changing the consumers (the zone maths in
 * `hrZones.ts`, the run HUD, the post-run distribution).
 *
 * Today there is NO web HR source — browsers have no first-class heart-rate
 * API (Web Bluetooth GATT exists but is unsupported in iOS WKWebView and off
 * by default elsewhere), so the web source is a deliberate NO-OP: it reports
 * `available === false` and never emits. That keeps the feature web-VISIBLE
 * (Settings can still preview zones from the user's max HR; consumers render a
 * "connect on the app" affordance) without pretending to stream.
 *
 * Step 2 (needs Mac/Xcode build): a `nativeHeartRateSource` backed by
 * HealthKit live workout samples (`HKWorkoutSession` + `HKAnchoredObjectQuery`
 * on `heartRate`) via a Capacitor plugin. The branch point is
 * `getHeartRateSource()` — flipping it on native is a one-line change once the
 * plugin lands. See docs/heart-rate-healthkit.md.
 */
import { isNativePlatform } from "./platform";

/** Handle to an active subscription; `stop()` ends the stream. */
export interface HeartRateSubscription {
  stop(): void;
}

export interface HeartRateSource {
  /**
   * Whether this platform can stream live HR right now. `false` on web (no
   * API) — consumers should fall back to the static zone preview, not error.
   */
  readonly available: boolean;
  /**
   * Subscribe to live beats-per-minute. On an unavailable source this is a
   * no-op that never calls `onSample`; the returned handle's `stop()` is safe
   * to call regardless.
   */
  subscribe(
    onSample: (bpm: number, at: number) => void,
    onError?: (err: Error) => void
  ): HeartRateSubscription;
}

const NOOP_SUBSCRIPTION: HeartRateSubscription = { stop() {} };

/**
 * Web HR source — intentionally inert. No browser HR API works inside the
 * iOS WKWebView, and the real users are on native, so rather than wire a
 * flaky Web Bluetooth path we report unavailable and let consumers show the
 * static zone preview. This is the web-visible fallback, not a stub that
 * silently swallows a real capability.
 */
export const webHeartRateSource: HeartRateSource = {
  available: false,
  subscribe() {
    return NOOP_SUBSCRIPTION;
  },
};

/**
 * Resolve the HR source for the current platform.
 *
 * Now: always the inert web source — native has no plugin wired yet, so it
 * also reports unavailable (honest: live HR genuinely isn't streaming until
 * the HealthKit plugin lands). The native branch is kept explicit so wiring
 * `nativeHeartRateSource` is a one-line change.
 */
export function getHeartRateSource(): HeartRateSource {
  if (isNativePlatform()) {
    // TODO(Step 2, docs/heart-rate-healthkit.md): return nativeHeartRateSource
    // (HealthKit live workout HR via a Capacitor plugin). Until then native
    // also has no live stream, so the inert source is the honest answer.
    return webHeartRateSource;
  }
  return webHeartRateSource;
}
