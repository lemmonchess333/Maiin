/**
 * Location source abstraction for run tracking.
 *
 * `useGPS` reads raw position fixes through this seam instead of calling
 * `navigator.geolocation` directly, so the *source* of fixes can differ by
 * platform without touching the point pipeline (isValidReading → Kalman →
 * distance/pace). See docs/run-background-gps.md.
 *
 * Two sources: the browser's Web Geolocation API on the web, and
 * `nativeLocationSource` (`@capacitor-community/background-geolocation`) in
 * the iOS app, so tracking survives a locked screen or a backgrounded app.
 * The web source is a 1:1 pass-through of the calls `useGPS` made before the
 * seam, so the callbacks it hands back are the real `GeolocationPosition` /
 * `GeolocationPositionError`.
 *
 * Run tracking only. The one-shot reads elsewhere (the weather, the route
 * planner, placing a privacy zone) call `navigator.geolocation` themselves,
 * on purpose: the native source's `getCurrent` takes no timeout, never asks
 * for permission and may hand back a cached fix, which suits a run already
 * under way and not a first-time ask or a zone that needs a fresh position.
 */
import { isNativePlatform } from "./platform";
import { nativeLocationSource } from "./nativeLocationSource";

/* Contracts live in locationTypes.ts (audit batch 3 cycle break) —
   imported for local use, re-exported for existing importers. */
import type { LocationSource } from "./locationTypes";
export type { LocationSource, LocationWatch } from "./locationTypes";

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
 * Resolve the location source for the current platform: the native
 * background-geolocation source in the app, the web source in a browser.
 */
export function getLocationSource(): LocationSource {
  if (isNativePlatform()) {
    // docs/run-background-gps.md: fixes keep flowing with the screen locked
    // or the app backgrounded. Run.tsx's visibility policy is platform-gated
    // to match (it must NOT stop this source on hidden).
    return nativeLocationSource;
  }
  return webLocationSource;
}
