/**
 * Live Activity for active runs — lock-screen / Dynamic Island pace,
 * distance and time while a run records (Tier 2 item 4).
 *
 * Seam-first, per the appCheck.ts / analyticsProvider.ts pattern: this
 * module is the ONLY place that touches `capacitor-live-activities` for a
 * run, it dynamically imports the plugin so the registration chunk never
 * ships in the web bundle, and every call is guarded + error-swallowed — a
 * Live Activity failure must never affect the run itself. On web every
 * function is an inert no-op; the web-visible path for this feature is the
 * in-app run HUD that already ships.
 *
 * The widget extension (`ios/App/LiveActivities/`, docs/run-live-activity.md)
 * draws the card natively from the data sent here, the keys
 * `liveActivityContract.ts` lists, and reads no layout. Labels arrive
 * PRE-FORMATTED from Run.tsx (distanceLabel / paceLabel / the timer's own
 * formatter) so this module stays unit-agnostic and the lock screen can
 * never disagree with the in-app HUD about what "1.2 mi" reads as.
 *
 * No native self-ticking timer element, deliberately: ActivityKit's timer
 * keeps counting through a PAUSE, so elapsed comes through the app's own
 * label on each update — always consistent with the HUD, at worst a few
 * seconds stale while backgrounded.
 */
import { isNativePlatform } from "@/lib/platform";
import { logger } from "@/lib/logger";
import { PLUGIN_LAYOUT } from "@/lib/liveActivityContract";

export interface RunActivityData {
  /** Pre-formatted, unit-aware distance, e.g. "3.4 km" (em-dash at 0). */
  distance: string;
  /** Pre-formatted rolling pace, e.g. "5:12 /km" (em-dash when unknown). */
  pace: string;
  /** Pre-formatted elapsed time from the run timer, e.g. "23:41". */
  elapsed: string;
  /** State line: "Recording" | "Paused". */
  label: string;
  /** Paused: the card greys its time, as the HUD does. */
  paused: boolean;
}

/** Min interval between updateActivity calls. ActivityKit throttles and
 *  budgets updates; a per-second stream would be discarded anyway. */
const MIN_UPDATE_INTERVAL_MS = 2000;

let activityId: string | null = null;
/** Serialises start against a concurrent end (both are async). */
let starting = false;
let lastUpdateAt = 0;
let lastPayloadKey = "";
/** The last data the card was given, sent again as its final state. */
let lastData: RunActivityData | null = null;
/** A change that came inside the throttle window, sent when it opens. */
let pending: RunActivityData | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

type Plugin = typeof import("capacitor-live-activities").LiveActivities;

/** A holder, never the plugin: a promise resolved with a Capacitor plugin
 *  calls its `then` on the native side and never settles (revenuecat.ts). */
async function loadPlugin(): Promise<{ plugin: Plugin } | null> {
  if (!isNativePlatform()) return null;
  try {
    const mod = await import("capacitor-live-activities");
    return { plugin: mod.LiveActivities };
  } catch {
    // Plugin absent from the build — inert.
    return null;
  }
}

/** The content state the widget reads (liveActivityContract.ts). */
function runState(data: RunActivityData): Record<string, string | boolean> {
  return { kind: "run", ...data };
}

function clearPending(): void {
  pending = null;
  if (flushTimer !== null) clearTimeout(flushTimer);
  flushTimer = null;
}

/**
 * Start the run Live Activity. Idempotent — a second call while one is
 * live (or starting) is a no-op, so the caller can invoke it from a
 * re-runnable effect without double-carding the lock screen.
 */
export async function startRunActivity(data: RunActivityData): Promise<void> {
  if (activityId !== null || starting) return;
  starting = true;
  try {
    const plugin = (await loadPlugin())?.plugin;
    if (!plugin) return;
    const result = await plugin.startActivity({
      ...PLUGIN_LAYOUT,
      data: runState(data),
    });
    activityId = result.activityId;
    lastUpdateAt = Date.now();
    lastPayloadKey = JSON.stringify(data);
    lastData = data;
  } catch (err) {
    logger.warn("[runLiveActivity] start failed", err);
  } finally {
    starting = false;
  }
}

/**
 * Push fresh stats. Throttled to one OS call per MIN_UPDATE_INTERVAL_MS
 * and skipped entirely when nothing changed — ActivityKit budgets
 * updates, and the caller ticks every second. A change inside the window
 * is held and sent when it opens, latest first, so a pause or a resume is
 * never lost to the throttle: while paused nothing else changes, and the
 * screen may not call again.
 */
export async function updateRunActivity(data: RunActivityData): Promise<void> {
  if (activityId === null) return;
  const key = JSON.stringify(data);
  if (key === lastPayloadKey) {
    // The card shows this already; anything held is older.
    clearPending();
    return;
  }
  const wait = lastUpdateAt + MIN_UPDATE_INTERVAL_MS - Date.now();
  if (wait > 0) {
    pending = data;
    flushTimer ??= setTimeout(() => {
      flushTimer = null;
      const next = pending;
      pending = null;
      if (next) void updateRunActivity(next);
    }, wait);
    return;
  }
  clearPending();
  // Claim the slot before the await so a per-second caller can't stack
  // parallel updates while one is in flight.
  lastUpdateAt = Date.now();
  lastPayloadKey = key;
  lastData = data;
  const id = activityId;
  try {
    const plugin = (await loadPlugin())?.plugin;
    if (!plugin) return;
    await plugin.updateActivity({ activityId: id, data: runState(data) });
  } catch (err) {
    logger.warn("[runLiveActivity] update failed", err);
  }
}

/**
 * End and dismiss the Live Activity. Safe to call when none is live
 * (unmount cleanup + finish/discard can all call it). The final state is
 * `final` when given, else the last stats sent, so the card is never
 * drawn empty on its way out; the plugin dismisses it at once
 * (patches/capacitor-live-activities+8.0.0.patch).
 */
export async function endRunActivity(final?: RunActivityData): Promise<void> {
  const id = activityId;
  const last = final ?? lastData;
  activityId = null;
  lastPayloadKey = "";
  lastData = null;
  clearPending();
  if (id === null) return;
  try {
    const plugin = (await loadPlugin())?.plugin;
    if (!plugin) return;
    await plugin.endActivity({
      activityId: id,
      data: last ? runState(last) : {},
    });
  } catch (err) {
    logger.warn("[runLiveActivity] end failed", err);
  }
}

/** Test-only: reset module state between cases. */
export function __resetRunActivityForTests(): void {
  activityId = null;
  starting = false;
  lastUpdateAt = 0;
  lastPayloadKey = "";
  lastData = null;
  clearPending();
}
