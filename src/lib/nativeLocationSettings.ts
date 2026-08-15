/**
 * Native location-settings helpers — the "While Using only" degraded-grant
 * UX for Step 2 (docs/run-background-gps.md, Section 7).
 *
 * `@capacitor-community/background-geolocation` exposes no API to read the
 * iOS authorization TIER (Always vs While-Using), so we cannot tell at run
 * start whether background tracking will work. What IS observable is the
 * symptom: with a While-Using grant the OS pauses location delivery while
 * the app is backgrounded, so on return to the foreground no fresh fix
 * arrived during the hidden window. `shouldWarnBackgroundPause` encodes that
 * inference; `openLocationSettings` is the CTA that deep-links to the app's
 * Settings so the user can upgrade to Always.
 *
 * Packaging note (same as nativeLocationSource): the plugin has no JS entry
 * — the bridge is registered via `registerPlugin` from `@capacitor/core`.
 */
import { registerPlugin } from "@capacitor/core";
import type { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation";
import { isNativePlatform } from "./platform";

let plugin: BackgroundGeolocationPlugin | null = null;
function getPlugin(): BackgroundGeolocationPlugin {
  if (!plugin) {
    plugin = registerPlugin<BackgroundGeolocationPlugin>(
      "BackgroundGeolocation"
    );
  }
  return plugin;
}

/**
 * Open the OS Settings page for the app so the user can change the location
 * grant to "Always". No-op on web (there's no native Settings to open) — the
 * caller only surfaces the CTA on native, but this stays defensive.
 */
export async function openLocationSettings(): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    await getPlugin().openSettings();
  } catch {
    /* best-effort — nothing actionable if the bridge rejects */
  }
}

/**
 * Infer, on return to the foreground, whether a native background pause just
 * happened — i.e. the user likely granted only "While Using", so tracking
 * stalled while the app was backgrounded.
 *
 * Pure so it can be unit-tested without a device. The inference:
 *  - We need a real hidden window (`minHiddenSec`, default 12s) — a quick
 *    app-switcher glance isn't evidence of a pause.
 *  - We need a fix already established (`msSinceLastFixOnResume` non-null);
 *    before the first fix we're just acquiring, not paused.
 *  - If the newest fix is at least as old as (a fraction of) the hidden
 *    window, no fresh fix arrived while backgrounded → delivery paused →
 *    warn. With an Always grant, fixes keep flowing while hidden, so the
 *    last fix is recent and this stays false.
 */
export function shouldWarnBackgroundPause(args: {
  hiddenDurationSec: number;
  msSinceLastFixOnResume: number | null;
  minHiddenSec?: number;
}): boolean {
  const { hiddenDurationSec, msSinceLastFixOnResume, minHiddenSec = 12 } = args;
  if (msSinceLastFixOnResume === null) return false;
  if (hiddenDurationSec < minHiddenSec) return false;
  // 0.8 tolerance: the resume fix + this callback land a beat after the
  // window, so require the last fix to predate ~80% of the hidden span.
  return msSinceLastFixOnResume >= hiddenDurationSec * 1000 * 0.8;
}
