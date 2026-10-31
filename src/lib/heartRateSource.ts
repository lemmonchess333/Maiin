/**
 * Heart-rate source abstraction for live beats from the paired Watch.
 *
 * Mirrors `locationSource.ts`: features read the HR stream through this seam
 * instead of touching a platform API directly, so the *source* of beats can
 * differ by platform without changing the consumers (the zone maths in
 * `hrZones.ts`, the run HUD, the post-run distribution).
 *
 * There is NO web HR source — browsers have no first-class heart-rate
 * API (Web Bluetooth GATT exists but is unsupported in iOS WKWebView and off
 * by default elsewhere), so the web source is a deliberate NO-OP: it reports
 * `available === false` and never emits. That keeps the feature web-VISIBLE
 * (Settings can still preview zones from the user's max HR; consumers render a
 * "connect on the app" affordance) without pretending to stream.
 *
 * The native source consumes `WatchRun.heartRateSample` events. Native
 * availability here means this shell can subscribe; Settings checks the
 * actual paired/installed Watch status separately. A missing bridge never
 * invents a reading.
 */
import { isNativePlatform } from "./platform";
import { subscribeWatchHeartRateSamples } from "./watchRunBridge";
import { CONNECTED_TRAINING_RELEASED } from "./connectedTrainingRelease";

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
    onSample: (bpm: number, at: number, id?: string) => void,
    onError?: (err: Error) => void,
    sessionId?: string
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

export const nativeHeartRateSource: HeartRateSource = {
  available: true,
  subscribe(onSample, onError, sessionId) {
    if (!sessionId) return NOOP_SUBSCRIPTION;
    let stopped = false;
    let remove: (() => void) | null = null;
    void subscribeWatchHeartRateSamples((sample) => {
      if (
        stopped ||
        sample.sessionId !== sessionId ||
        !Number.isFinite(sample.timestampMs) ||
        !Number.isFinite(sample.bpm) ||
        sample.bpm < 30 ||
        sample.bpm > 250
      )
        return;
      onSample(sample.bpm, sample.timestampMs, sample.sampleId);
    })
      .then((unsubscribe) => {
        if (stopped) unsubscribe();
        else remove = unsubscribe;
      })
      .catch((error: unknown) => {
        if (!stopped)
          onError?.(
            error instanceof Error ? error : new Error("Watch HR unavailable")
          );
      });
    return {
      stop() {
        stopped = true;
        remove?.();
      },
    };
  },
};

/**
 * Resolve the HR source for the current platform.
 *
 * The iOS shell receives Watch samples through the WatchRun bridge; web keeps
 * the inert fallback. The hook subscribes only for an opted-in active run.
 */
export function getHeartRateSource(): HeartRateSource {
  if (CONNECTED_TRAINING_RELEASED && isNativePlatform())
    return nativeHeartRateSource;
  return webHeartRateSource;
}
