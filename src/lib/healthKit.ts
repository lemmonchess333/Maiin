/**
 * HealthKit bridges: capacitor-health reads daily steps for Home, while the
 * app's WatchRun plugin writes opted-in, server-confirmed run workouts.
 *
 * Web never reads steps or writes workouts: every native call guards on
 * `isNativePlatform()` and returns unavailable on web. The plugins load via
 * dynamic `import()` so its chunk never ships in the web bundle, and there
 * are no top-level side effects (lazy-init like `nativeLocationSource`'s
 * `getPlugin()`).
 *
 * Plugin: `capacitor-health` (peer `@capacitor/core >=8`, so Capacitor-8
 * compatible). Unlike `@capacitor-community/background-geolocation` it DOES
 * ship a JS entry that `registerPlugin`s the `Health` bridge, so we import it
 * — but lazily, inside `getPlugin()`.
 *
 * HealthKit STEP READ permission quirk (the plugin's own docs confirm it): on iOS
 * the OS NEVER tells an app whether the user granted or denied a READ scope —
 * `requestHealthPermissions` resolves identically either way, and a denied
 * read simply returns zero samples. So we never invent a "denied" signal the
 * OS won't give: a completed request is treated as "granted" (the assumption
 * the plugin documents), and the connected-but-zero case is surfaced upstream
 * as the *ambiguous* state, not an error.
 */
import { isNativePlatform } from "./platform";
import type { HealthPlugin } from "capacitor-health";
import type { Plugin } from "@capacitor/core";
import { CONNECTED_TRAINING_RELEASED } from "./connectedTrainingRelease";

export interface NativeWorkoutExportPlugin extends Plugin {
  isWorkoutWriteAvailable(): Promise<{ available: boolean }>;
  requestWorkoutWritePermission(): Promise<{ granted: boolean }>;
  getWorkoutWriteAuthorization(): Promise<{
    status: "authorized" | "denied" | "notDetermined";
  }>;
  getWorkoutExportStatus(options: { runId: string }): Promise<{
    status: "absent" | "present" | "unverified";
    workoutId?: string;
    revision?: string;
  }>;
  exportWorkout(options: {
    runId: string;
    revision: string;
    startMs: number;
    endMs: number;
    /** Active phone timer seconds, excluding pauses and GPS wait. */
    durationSeconds: number;
    distanceMeters: number;
    energyKcal?: number;
  }): Promise<{
    status: "created" | "present";
    workoutId: string;
    revision: string;
  }>;
  deleteWorkout(options: {
    runId: string;
  }): Promise<{ status: "deleted" | "absent" }>;
}

let workoutPluginPromise: Promise<NativeWorkoutExportPlugin> | null = null;
/** The workout writer is the app's WatchRun plugin, not capacitor-health. */
export async function getNativeWorkoutExportPlugin(): Promise<NativeWorkoutExportPlugin | null> {
  if (!CONNECTED_TRAINING_RELEASED) return null;
  return getNativeWorkoutCleanupPlugin();
}

/** Existing app-owned workouts still need deletion after a release rollback.
 * Native `deleteWorkout` remains available when new Watch/export work is off. */
export async function getNativeWorkoutCleanupPlugin(): Promise<NativeWorkoutExportPlugin | null> {
  if (!isNativePlatform()) return null;
  try {
    workoutPluginPromise ??= import("@capacitor/core").then(
      ({ registerPlugin }) =>
        registerPlugin<NativeWorkoutExportPlugin>("WatchRun")
    );
    return await workoutPluginPromise;
  } catch {
    return null;
  }
}

/** Actual native writer availability; web and older shells return false. */
export async function isWorkoutWriteAvailable(): Promise<boolean> {
  const plugin = await getNativeWorkoutExportPlugin();
  if (!plugin) return false;
  try {
    return (await plugin.isWorkoutWriteAvailable()).available === true;
  } catch {
    return false;
  }
}

/** HealthKit WRITE access has a readable grant state, unlike READ access. */
export async function requestWorkoutWritePermission(): Promise<boolean> {
  const plugin = await getNativeWorkoutExportPlugin();
  if (!plugin) return false;
  try {
    return (await plugin.requestWorkoutWritePermission()).granted === true;
  } catch {
    return false;
  }
}

/** Readable workout WRITE status for Settings and a revoked-access recovery. */
export async function getWorkoutWriteAuthorization(): Promise<
  "authorized" | "denied" | "notDetermined" | "unavailable"
> {
  const plugin = await getNativeWorkoutExportPlugin();
  if (!plugin) return "unavailable";
  try {
    const { status } = await plugin.getWorkoutWriteAuthorization();
    return status === "authorized" ||
      status === "denied" ||
      status === "notDetermined"
      ? status
      : "unavailable";
  } catch {
    return "unavailable";
  }
}

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
