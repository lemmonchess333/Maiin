/**
 * Cross-platform haptic feedback.
 *
 * Before W1f this used `navigator.vibrate` only, which is a
 * DEAD API on iOS Safari — iOS has never implemented the Vibrate
 * API in any version, so every haptic call in the app did nothing
 * on iPhone. Fixed by preferring Capacitor's native Haptics plugin
 * when the app is running inside a native shell (iOS / Android
 * Capacitor build) and falling back to `navigator.vibrate` on the
 * web for the subset of Android browsers that honour it.
 *
 * The API stays the same so all 30+ existing call sites keep
 * working unchanged — `haptic("light")`, `haptic("success")`, etc.
 */

import { isNativePlatform } from "./platform";

type ImpactStyleValue = "LIGHT" | "MEDIUM" | "HEAVY";
type CapacitorHaptics = {
  impact: (opts: { style: ImpactStyleValue }) => Promise<void>;
  notification: (opts: {
    type: "SUCCESS" | "WARNING" | "ERROR";
  }) => Promise<void>;
  vibrate: (opts?: { duration?: number }) => Promise<void>;
};

/**
 * Lazy-loaded handle to the Capacitor Haptics plugin. Keeping the
 * import dynamic means web builds never pull the native plugin into
 * the bundle, and the plugin only resolves on the first haptic call
 * inside a native shell.
 */
// Wrap the plugin in a plain holder rather than resolving the Promise
// with the bare plugin. Capacitor's plugin object is a Proxy that
// intercepts *every* property access — including `.then` — so resolving
// a Promise with it makes the JS Promise-resolution procedure treat it
// as a thenable and invoke `Haptics.then(resolve, reject)`. On web that
// throws "Haptics.then() is not implemented on web" as an *uncaught*
// rejection (it fires during resolution, outside the call-site try/catch).
// The holder hides the proxy from thenable-probing.
type HapticsHolder = { plugin: CapacitorHaptics };
let nativeHapticsPromise: Promise<HapticsHolder | null> | null = null;

function loadNativeHaptics(): Promise<HapticsHolder | null> {
  if (nativeHapticsPromise) return nativeHapticsPromise;
  nativeHapticsPromise = import("@capacitor/haptics")
    .then((mod) => {
      const m = mod as unknown as { Haptics: CapacitorHaptics };
      return m?.Haptics ? { plugin: m.Haptics } : null;
    })
    .catch(() => null);
  return nativeHapticsPromise;
}

type HapticPattern =
  | number
  | number[]
  | "light"
  | "medium"
  | "heavy"
  | "success"
  | "error";

function webVibrate(pattern: HapticPattern) {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  try {
    if (pattern === "light") navigator.vibrate(10);
    else if (pattern === "medium") navigator.vibrate(25);
    else if (pattern === "heavy") navigator.vibrate(50);
    else if (pattern === "success") navigator.vibrate([10, 50, 10]);
    else if (pattern === "error") navigator.vibrate([50, 30, 50]);
    else navigator.vibrate(pattern as number | number[]);
  } catch {
    // Haptic not supported
  }
}

/**
 * Trigger device haptic feedback.
 * @param pattern - Duration in ms, array of [vibrate, pause, ...], or named pattern
 */
export function haptic(pattern: HapticPattern = 10) {
  if (!isNativePlatform()) {
    webVibrate(pattern);
    return;
  }

  // Native path. Fire-and-forget: haptic feedback is a side-effect,
  // not a UX-critical promise — if the plugin fails to resolve we
  // just drop the haptic rather than surfacing an error.
  loadNativeHaptics().then((holder) => {
    if (!holder) return;
    const h = holder.plugin;
    try {
      if (pattern === "light") h.impact({ style: "LIGHT" });
      else if (pattern === "medium") h.impact({ style: "MEDIUM" });
      else if (pattern === "heavy") h.impact({ style: "HEAVY" });
      else if (pattern === "success") h.notification({ type: "SUCCESS" });
      else if (pattern === "error") h.notification({ type: "ERROR" });
      else if (typeof pattern === "number") h.vibrate({ duration: pattern });
      else if (Array.isArray(pattern)) {
        // Capacitor Haptics doesn't support a pattern array; approximate
        // with a single vibrate of the total on-duration so we still
        // fire *something* on iOS rather than silently dropping it.
        const total = pattern
          .filter((_, i) => i % 2 === 0)
          .reduce((s, n) => s + n, 0);
        if (total > 0) h.vibrate({ duration: total });
      }
    } catch {
      // Plugin call failed (platform issue or permission). Ignore.
    }
  });
}
