/**
 * HealthKit bridge — daily step count for the Home Steps tile (the iOS half
 * of POST_LAUNCH.md "Steps tile → HealthKit / Health Connect wiring").
 *
 * Web is NEVER routed here — steps are impossible in a browser, so every
 * function guards on `isNativePlatform()` and returns the unavailable / null
 * value on web. Mirrors `nativeAuth.ts` in shape: the plugin is loaded via
 * dynamic `import()` so its chunk never ships in the web bundle, and there
 * are no top-level side effects (lazy-init like `nativeLocationSource`'s
 * `getPlugin()`).
 *
 * Plugin: `capacitor-health` (peer `@capacitor/core >=8`, so Capacitor-8
 * compatible). Unlike `@capacitor-community/background-geolocation` it DOES
 * ship a JS entry that `registerPlugin`s the `Health` bridge, so we import it
 * — but lazily, inside `getPlugin()`.
 *
 * HealthKit read-permission quirk (the plugin's own docs confirm it): on iOS
 * the OS NEVER tells an app whether the user granted or denied a READ scope —
 * `requestHealthPermissions` resolves identically either way, and a denied
 * read simply returns zero samples. So we never invent a "denied" signal the
 * OS won't give: a completed request is treated as "granted" (the assumption
 * the plugin documents), and the connected-but-zero case is surfaced upstream
 * as the *ambiguous* state, not an error.
 */
import { isNativePlatform } from "./platform";
import type { HealthPlugin } from "capacitor-health";

/** Lazily imported so this module has no side effects and the plugin chunk
 *  stays out of the web bundle (dynamic import → own chunk, native only). */
let pluginPromise: Promise<HealthPlugin> | null = null;
async function getPlugin(): Promise<HealthPlugin> {
  if (!pluginPromise) {
    pluginPromise = import("capacitor-health").then((m) => m.Health);
  }
  return pluginPromise;
}

/** False on web and on simulators / devices where Health isn't available. */
export async function isHealthAvailable(): Promise<boolean> {
  if (!isNativePlatform()) return false;
  try {
    const { available } = await (await getPlugin()).isHealthAvailable();
    return available;
  } catch {
    return false;
  }
}

/**
 * Request the `READ_STEPS` scope only. Returns "granted" on any completed
 * request (see the read-permission quirk above — iOS won't reveal a denial),
 * "denied" only when the request itself throws or we're not native.
 */
export async function requestStepsReadPermission(): Promise<
  "granted" | "denied"
> {
  if (!isNativePlatform()) return "denied";
  try {
    await (
      await getPlugin()
    ).requestHealthPermissions({
      permissions: ["READ_STEPS"],
    });
    return "granted";
  } catch {
    return "denied";
  }
}

/**
 * Today's step total via a day-aligned aggregated query anchored at LOCAL
 * midnight (never mix local-date and UTC — we build the local-midnight
 * instant and let `toISOString()` convert it). `null` when unavailable /
 * on web / on error. A genuine zero and a denied-read zero are
 * indistinguishable by design (the OS quirk) — both return 0 here and are
 * disambiguated as "ambiguous" one layer up.
 */
export async function getTodayStepTotal(): Promise<number | null> {
  if (!isNativePlatform()) return null;
  try {
    const plugin = await getPlugin();
    const start = new Date();
    start.setHours(0, 0, 0, 0); // local midnight
    const end = new Date();
    const res = await plugin.queryAggregated({
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      dataType: "steps",
      bucket: "day",
    });
    const total = (res.aggregatedData ?? []).reduce(
      (sum, sample) => sum + (sample.value ?? 0),
      0
    );
    return Math.round(total);
  } catch {
    return null;
  }
}

/**
 * Deep-link to the OS settings for the app so the user can grant Health data
 * access. The plugin can only open the app's own settings page (iOS gives no
 * direct link to Settings → Health → Data Access & Devices → Tropos), so the
 * recovery banner spells out the manual path. No-op on web.
 */
export async function openHealthSettings(): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    await (await getPlugin()).openAppleHealthSettings();
  } catch {
    /* best-effort — nothing actionable if the bridge rejects */
  }
}
