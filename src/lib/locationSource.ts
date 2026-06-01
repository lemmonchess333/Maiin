/**
 * Location source abstraction for run tracking.
 *
 * `useGPS` reads raw position fixes through this seam instead of calling
 * `navigator.geolocation` directly, so the *source* of fixes can differ by
 * platform without touching the point pipeline (isValidReading → Kalman →
 * distance/pace). See docs/run-background-gps.md.
 *
 * Today there's ONE source — the browser Web Geolocation API — used on both
 * web and native. That's intentional: this file is the web-safe Step 1 (the
 * seam, zero behaviour change). Step 2 adds a native background-geolocation
 * source and flips `getLocationSource()` to return it on native — at which
 * point tracking survives a locked screen / backgrounded app. The web source
 * is a 1:1 pass-through of the same calls `useGPS` made before, so the
 * callbacks it hands back are the real `GeolocationPosition` /
 * `GeolocationPositionError` (no shape translation, nothing to re-test).
 */
import { isNativePlatform } from "./platform";

/** Handle to an active watch; `clear()` stops it (web: clearWatch). */
export interface LocationWatch {
  clear(): void;
}

export interface LocationSource {
  /** One-shot fix (used to pre-warm the GPS chipset before watching). */
  getCurrent(
    options: PositionOptions,
    onFix: PositionCallback,
    onError: PositionErrorCallback
  ): void;
  /** Continuous fixes until the returned handle is cleared. */
  watch(
    options: PositionOptions,
    onFix: PositionCallback,
    onError: PositionErrorCallback
  ): LocationWatch;
}

/**
 * Web Geolocation source — a thin pass-through over `navigator.geolocation`.
 * Identical to the calls `useGPS` made inline before the seam existed.
 */
export const webLocationSource: LocationSource = {
  getCurrent(options, onFix, onError) {
    navigator.geolocation.getCurrentPosition(onFix, onError, options);
  },
  watch(options, onFix, onError) {
    const id = navigator.geolocation.watchPosition(onFix, onError, options);
    return {
      clear() {
        navigator.geolocation.clearWatch(id);
      },
    };
  },
};

/**
 * Resolve the location source for the current platform.
 *
 * Step 1 (now): always the web source — native uses the same Web Geolocation
 * API inside the WKWebView, which is exactly today's behaviour.
 *
 * Step 2 (needs Mac/Xcode build): return a `nativeLocationSource` backed by
 * `@capacitor-community/background-geolocation` when `isNativePlatform()`, so
 * fixes keep flowing with the screen off / app backgrounded. The branch point
 * is here so wiring it is a one-line change.
 */
export function getLocationSource(): LocationSource {
  if (isNativePlatform()) {
    // TODO(Step 2, docs/run-background-gps.md): return nativeLocationSource.
    return webLocationSource;
  }
  return webLocationSource;
}
