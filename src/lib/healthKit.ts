/**
 * HealthKit bridges: `@capgo/capacitor-health` reads daily steps for Home,
 * while the app's WatchRun plugin writes opted-in, server-confirmed run
 * workouts and opens the app's page in Settings.
 *
 * Web never reads steps or writes workouts: every native call guards on
 * `isNativePlatform()` and returns unavailable on web. The plugins load via
 * dynamic `import()` so its chunk never ships in the web bundle, and there
 * are no top-level side effects (lazy-init like `nativeLocationSource`'s
 * `getPlugin()`).
 *
 * Plugin: `@capgo/capacitor-health` (peer `@capacitor/core >=8`), which
 * replaced `capacitor-health` on 13 November 2026 (the owner, whole-app
 * grill Q75) because it can also read sleep, resting heart rate and heart
 * rate variability; the old one read none of them. It ships a JS entry that
 * `registerPlugin`s the `Health` bridge, so we import it, lazily, inside
 * `getPlugin()`. It has no iOS settings link, so `openHealthSettings` goes
 * through WatchRun's `openAppSettings`, which opens the same page the old
 * plugin did.
 *
 * HealthKit STEP READ permission quirk (the plugin's own docs confirm it): on iOS
 * the OS NEVER tells an app whether the user granted or denied a READ scope —
 * `requestAuthorization` resolves identically either way, and a denied
 * read simply returns zero samples. So we never invent a "denied" signal the
 * OS won't give: a completed request is treated as "granted" (the assumption
 * the plugin documents), and the connected-but-zero case is surfaced upstream
 * as the *ambiguous* state, not an error.
 */
import { isNativePlatform } from "./platform";
import { localDateString } from "./dateHelpers";
import type { DailyValue, SleepSampleLike } from "./bodySignals";
import type { HealthPlugin } from "@capgo/capacitor-health";
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
  /** The app's own page in iOS Settings, where Health access is reached. */
  openAppSettings(): Promise<void>;
}

/* Plugins are held, never resolved with: a Capacitor plugin is a Proxy that
   answers every property, `then` included, so a promise resolved with one
   calls its `then` on the native side and never settles (revenuecat.ts).
   "HealthPlugin.then() is not implemented on ios" on the first TestFlight
   builds was this. */
let workoutPluginPromise: Promise<{
  plugin: NativeWorkoutExportPlugin;
}> | null = null;
/** The workout writer is the app's WatchRun plugin, not the Health plugin. */
export async function getNativeWorkoutExportPlugin(): Promise<{
  plugin: NativeWorkoutExportPlugin;
} | null> {
  if (!CONNECTED_TRAINING_RELEASED) return null;
  return getNativeWorkoutCleanupPlugin();
}

/** Existing app-owned workouts still need deletion after a release rollback.
 * Native `deleteWorkout` remains available when new Watch/export work is off. */
export async function getNativeWorkoutCleanupPlugin(): Promise<{
  plugin: NativeWorkoutExportPlugin;
} | null> {
  if (!isNativePlatform()) return null;
  try {
    workoutPluginPromise ??= import("@capacitor/core").then(
      ({ registerPlugin }) => ({
        plugin: registerPlugin<NativeWorkoutExportPlugin>("WatchRun"),
      })
    );
    return await workoutPluginPromise;
  } catch {
    return null;
  }
}

/** Actual native writer availability; web and older shells return false. */
export async function isWorkoutWriteAvailable(): Promise<boolean> {
  const plugin = (await getNativeWorkoutExportPlugin())?.plugin;
  if (!plugin) return false;
  try {
    return (await plugin.isWorkoutWriteAvailable()).available === true;
  } catch {
    return false;
  }
}

/** HealthKit WRITE access has a readable grant state, unlike READ access. */
export async function requestWorkoutWritePermission(): Promise<boolean> {
  const plugin = (await getNativeWorkoutExportPlugin())?.plugin;
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
  const plugin = (await getNativeWorkoutExportPlugin())?.plugin;
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
let pluginPromise: Promise<{ plugin: HealthPlugin }> | null = null;
async function getPlugin(): Promise<{ plugin: HealthPlugin }> {
  if (!pluginPromise) {
    pluginPromise = import("@capgo/capacitor-health").then((m) => ({
      plugin: m.Health,
    }));
  }
  return pluginPromise;
}

/** False on web and on simulators / devices where Health isn't available. */
export async function isHealthAvailable(): Promise<boolean> {
  if (!isNativePlatform()) return false;
  try {
    const { available } = await (await getPlugin()).plugin.isAvailable();
    return available;
  } catch {
    return false;
  }
}

/**
 * Request reading steps only. Returns "granted" on any completed
 * request (see the read-permission quirk above — iOS won't reveal a denial),
 * "denied" only when the request itself throws or we're not native.
 */
export async function requestStepsReadPermission(): Promise<
  "granted" | "denied"
> {
  if (!isNativePlatform()) return "denied";
  try {
    await (await getPlugin()).plugin.requestAuthorization({ read: ["steps"] });
    return "granted";
  } catch {
    return "denied";
  }
}

/** What readiness reads from Health for a Pro account (whole-app grill
 *  Q39-Q43): sleep, resting heart rate and heart rate variability. Read
 *  on the phone each time and never stored or sent (`bodySignals.ts`). */
export const BODY_SIGNAL_TYPES = [
  "sleep",
  "restingHeartRate",
  "heartRateVariability",
] as const;

/**
 * Ask to read sleep and heart. As with steps, iOS never says whether a read
 * was refused, so a request that completes is "granted"; a refused read
 * simply returns nothing, and readiness then says nothing about sleep or
 * heart.
 */
export async function requestBodySignalsReadPermission(): Promise<
  "granted" | "denied"
> {
  if (!isNativePlatform()) return "denied";
  try {
    await (
      await getPlugin()
    ).plugin.requestAuthorization({ read: [...BODY_SIGNAL_TYPES] });
    return "granted";
  } catch {
    return "denied";
  }
}

/** Every sleep sample between two instants, oldest first. Null on the web
 *  or when the read fails. */
export async function readSleepSamples(
  start: Date,
  end: Date
): Promise<SleepSampleLike[] | null> {
  if (!isNativePlatform()) return null;
  try {
    const { samples } = await (
      await getPlugin()
    ).plugin.readSamples({
      dataType: "sleep",
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      limit: 5000,
      ascending: true,
    });
    return (samples ?? []).map((s) => ({
      startDate: s.startDate,
      endDate: s.endDate,
      sleepState: s.sleepState,
    }));
  } catch {
    return null;
  }
}

/** One value a day (the day's average) for a daily reading, keyed by the
 *  LOCAL day its bucket starts on. Null on the web or when the read fails. */
export async function readDailyAverages(
  dataType: "restingHeartRate" | "heartRateVariability",
  start: Date,
  end: Date
): Promise<DailyValue[] | null> {
  if (!isNativePlatform()) return null;
  try {
    const { samples } = await (
      await getPlugin()
    ).plugin.queryAggregated({
      dataType,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      bucket: "day",
      aggregation: "average",
    });
    return (samples ?? [])
      .filter((s) => Number.isFinite(s.value) && s.value > 0)
      .map((s) => ({
        dateKey: localDateString(new Date(s.startDate)),
        value: s.value,
      }));
  } catch {
    return null;
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
    const { plugin } = await getPlugin();
    const start = new Date();
    start.setHours(0, 0, 0, 0); // local midnight
    const end = new Date();
    const res = await plugin.queryAggregated({
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      dataType: "steps",
      bucket: "day",
      aggregation: "sum",
    });
    const total = (res.samples ?? []).reduce(
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
 * access. Only the app's own settings page can be opened (iOS gives no
 * direct link to Settings → Health → Data Access & Devices → Tropos), so the
 * recovery banner spells out the manual path. The Health plugin has no iOS
 * settings link, so this goes through the app's own WatchRun plugin, which
 * is registered in every build. No-op on web.
 */
export async function openHealthSettings(): Promise<void> {
  try {
    const held = await getNativeWorkoutCleanupPlugin();
    if (!held) return;
    await held.plugin.openAppSettings();
  } catch {
    /* best-effort — nothing actionable if the bridge rejects */
  }
}
