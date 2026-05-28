/**
 * Runtime platform detection helpers.
 *
 * Kept deliberately narrow — these return boolean state for simple
 * UI branching (e.g. "hide features that only work in the native
 * shell" during the web-only pre-launch window). Feature-level
 * capability checks should live with the feature, not here.
 */

import { Capacitor } from "@capacitor/core";

/**
 * True when the app is running inside a native Capacitor iOS/Android
 * shell. False on the web (PWA or vanilla browser). Safe to call
 * during SSR — the `typeof window` guard avoids ReferenceError.
 *
 * Uses `Capacitor.isNativePlatform()` rather than `!!window.Capacitor`:
 * `@capacitor/core` injects the `window.Capacitor` global on the WEB
 * too (it's how the web platform shim works), so the truthiness check
 * reported native === true on the web — wrongly routing web users down
 * native code paths (dead haptics, skipped service-worker registration,
 * App Check never initialising on web). `isNativePlatform()` is the
 * canonical API and correctly returns false on web.
 */
export function isNativePlatform(): boolean {
  if (typeof window === "undefined") return false;
  return Capacitor.isNativePlatform();
}
