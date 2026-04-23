/**
 * Runtime platform detection helpers.
 *
 * Kept deliberately narrow — these return boolean state for simple
 * UI branching (e.g. "hide features that only work in the native
 * shell" during the web-only pre-launch window). Feature-level
 * capability checks should live with the feature, not here.
 */

/**
 * True when the app is running inside a native Capacitor iOS/Android
 * shell. False on the web (PWA or vanilla browser). Safe to call
 * during SSR — the `typeof window` guard avoids ReferenceError.
 *
 * Uses the same detection pattern as register-sw.ts and
 * purchaseProvider.ts so all three check the same signal.
 */
export function isNativePlatform(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as unknown as Record<string, unknown>).Capacitor;
}
