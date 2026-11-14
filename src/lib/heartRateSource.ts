/**
 * Heart-rate source abstraction for live beats during a run: from the paired
 * Watch, or from a Bluetooth chest strap or armband (the standard Heart Rate
 * Service, `heartRateSensorBridge.ts`).
 *
 * Mirrors `locationSource.ts`: features read the HR stream through this seam
 * instead of touching a platform API directly, so the *source* of beats can
 * differ by platform without changing the consumers (the zone maths in
 * `hrZones.ts`, the run HUD, the easy cue, the post-run summary).
 *
 * There is NO web HR source — browsers have no first-class heart-rate
 * API (Web Bluetooth GATT exists but is unsupported in iOS WKWebView and off
 * by default elsewhere), so the web source is a deliberate NO-OP: it reports
 * `available === false` and never emits. That keeps the feature web-VISIBLE
 * (Settings can still preview zones from the user's max HR and explain the
 * sensor; consumers render a "connect on the app" affordance) without
 * pretending to stream.
 *
 * On the iPhone the two native sources are one stream (`combinedHeartRateSource`):
 * the sensor's readings always, and the Watch's (`WatchRun.heartRateSample`,
 * behind the connected training gate) except while a sensor reading is fresh
 * (`watchReadingSetAside`). Native availability here means this shell can
 * subscribe; Settings checks the actual Watch and sensor status separately.
 * A missing bridge never invents a reading.
 */
import { isNativePlatform } from "./platform";
import { subscribeWatchHeartRateSamples } from "./watchRunBridge";
import { CONNECTED_TRAINING_RELEASED } from "./connectedTrainingRelease";
import {
  isHeartRateSensorPaired,
  startHeartRateSensorSession,
  stopHeartRateSensorSession,
  subscribeHeartRateSensorReadings,
} from "./heartRateSensorBridge";
import { watchReadingSetAside, type HeartRateSourceKind } from "./hrZones";

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
    onSample: (
      bpm: number,
      at: number,
      id?: string,
      source?: HeartRateSourceKind
    ) => void,
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
      onSample(sample.bpm, sample.timestampMs, sample.sampleId, "apple-watch");
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
 * A Bluetooth sensor's beats for a named run. Subscribing connects to the
 * paired sensor (a no-op with none paired) and has native keep the run's
 * readings for review; stopping lets the sensor go, and the kept readings
 * stay until the run is saved or discarded (`clearHeartRateSession`).
 */
export const sensorHeartRateSource: HeartRateSource = {
  available: true,
  subscribe(onSample, onError, sessionId) {
    if (!sessionId) return NOOP_SUBSCRIPTION;
    let stopped = false;
    let remove: (() => void) | null = null;
    void subscribeHeartRateSensorReadings((sample) => {
      if (!stopped) onSample(sample.bpm, sample.at, sample.id, "bluetooth");
    })
      .then((unsubscribe) => {
        if (stopped) unsubscribe();
        else remove = unsubscribe;
      })
      .catch((error: unknown) => {
        if (!stopped)
          onError?.(
            error instanceof Error ? error : new Error("Sensor unavailable")
          );
      });
    void startHeartRateSensorSession(sessionId);
    return {
      stop() {
        stopped = true;
        remove?.();
        void stopHeartRateSensorSession();
      },
    };
  },
};

/**
 * The sensor and the Watch as one stream: every sensor reading, and a Watch
 * reading only when no sensor reading is fresh, so the HUD, the easy cue and
 * the store see one heart rate at a time.
 */
function combinedHeartRateSource(
  sensor: HeartRateSource,
  watch: HeartRateSource | null
): HeartRateSource {
  return {
    // A source that can stream now: the Watch where it is released, or a
    // paired sensor. Read each time, since pairing changes it.
    get available() {
      return watch !== null || isHeartRateSensorPaired();
    },
    subscribe(onSample, onError, sessionId) {
      let lastSensorAt: number | null = null;
      const subscriptions = [
        sensor.subscribe(
          (bpm, at, id) => {
            lastSensorAt = Math.max(lastSensorAt ?? at, at);
            onSample(bpm, at, id, "bluetooth");
          },
          onError,
          sessionId
        ),
      ];
      if (watch)
        subscriptions.push(
          watch.subscribe(
            (bpm, at, id) => {
              if (watchReadingSetAside(at, lastSensorAt)) return;
              onSample(bpm, at, id, "apple-watch");
            },
            onError,
            sessionId
          )
        );
      return {
        stop() {
          for (const subscription of subscriptions) subscription.stop();
        },
      };
    },
  };
}

const releasedNativeSources = combinedHeartRateSource(
  sensorHeartRateSource,
  nativeHeartRateSource
);
const sensorOnlySource = combinedHeartRateSource(sensorHeartRateSource, null);

/**
 * Resolve the HR source for the current platform.
 *
 * The iOS shell always has the sensor's half; it adds the Watch's samples
 * through the WatchRun bridge when connected training is released. Web keeps
 * the inert fallback. The hook subscribes only for an opted-in active run.
 *
 * `available` means a source can stream on this device now: the Watch where
 * it is released, or a paired sensor (as last heard from native). The hot-day
 * heart-rate ceiling reads it (`heatAdjustment.ts`), so it must not be true
 * for an iPhone with neither.
 */
export function getHeartRateSource(): HeartRateSource {
  if (!isNativePlatform()) return webHeartRateSource;
  return CONNECTED_TRAINING_RELEASED ? releasedNativeSources : sensorOnlySource;
}
