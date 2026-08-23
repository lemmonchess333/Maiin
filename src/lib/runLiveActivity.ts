/**
 * Live Activity for active runs — lock-screen / Dynamic Island pace,
 * distance and time while a run records (Tier 2 item 4).
 *
 * Seam-first, per the appCheck.ts / analyticsProvider.ts pattern: this
 * module is the ONLY place that touches `capacitor-live-activities`, it
 * dynamically imports the plugin so the registration chunk never ships
 * in the web bundle, and every call is guarded + error-swallowed — a
 * Live Activity failure must never affect the run itself. On web (or
 * before the operator's Xcode half exists) every function is an inert
 * no-op; the web-visible path for this feature is the in-app run HUD
 * that already ships.
 *
 * Layout model: the card and Dynamic Island are declared ONCE at start
 * with `{{placeholder}}` bindings, and every subsequent update sends
 * data only — the shape the plugin optimises for. Labels arrive
 * PRE-FORMATTED from Run.tsx (distanceLabel / paceLabel / the timer's
 * own formatter) so this module stays unit-agnostic and the lock screen
 * can never disagree with the in-app HUD about what "1.2 mi" reads as.
 *
 * No native self-ticking timer element, deliberately: ActivityKit's
 * timer keeps counting through a PAUSE, so elapsed comes through the
 * app's own label on each update — always consistent with the HUD,
 * at worst a few seconds stale while backgrounded.
 *
 * Operator half (Mac/Xcode, documented in docs/run-live-activity.md):
 * widget-extension target + Podfile entry + NSSupportsLiveActivities +
 * App Group, then `npx cap sync ios`. Until then `startActivity`
 * rejects and this module swallows it.
 */
import { isNativePlatform } from "@/lib/platform";
import { logger } from "@/lib/logger";
import { THEME } from "@/lib/theme";
/* Type-only — erased at build, zero web-bundle cost (the runtime import
   below stays dynamic). */
import type {
  ActivityLayout,
  DynamicIslandLayout,
  LayoutElement,
} from "capacitor-live-activities";

export interface RunActivityData {
  /** Pre-formatted, unit-aware distance, e.g. "3.42 km". */
  distance: string;
  /** Pre-formatted rolling pace, e.g. "5:12/km" (em-dash when unknown). */
  pace: string;
  /** Pre-formatted elapsed time from the run timer, e.g. "23:41". */
  elapsed: string;
  /** State line: "Recording" | "Paused" | activity label. */
  label: string;
}

/** Min interval between updateActivity calls. ActivityKit throttles and
 *  budgets updates; a per-second stream would be discarded anyway. */
const MIN_UPDATE_INTERVAL_MS = 2000;

let activityId: string | null = null;
/** Serialises start against a concurrent end (both are async). */
let starting = false;
let lastUpdateAt = 0;
let lastPayloadKey = "";

type Plugin = typeof import("capacitor-live-activities").LiveActivities;

async function loadPlugin(): Promise<Plugin | null> {
  if (!isNativePlatform()) return null;
  try {
    const mod = await import("capacitor-live-activities");
    return mod.LiveActivities;
  } catch {
    // Plugin absent from the build (operator half not done) — inert.
    return null;
  }
}

const CARD_BG = "#1A1A1F" as const; // dark surface — the run overlay is always-dark
/* Literal hex is DELIBERATE here (DS2 exemption): the Live Activity plugin
   renders natively and cannot resolve CSS custom properties, and this
   overlay is always-dark, where #8E8E93 measures ~4.9:1 — passing. */
const TEXT_MUTED = "#8E8E93" as const;
/* The plugin's ColorString wants a template-literal hex; THEME.running is
   typed plain string. The value IS "#D4637A" — assert the shape once. */
const CORAL = THEME.running as `#${string}`;

/** One stat column: micro label over the bound value. */
function statColumn(caption: string, binding: string): LayoutElement {
  return {
    type: "container" as const,
    properties: [{ direction: "vertical" as const }, { spacing: 2 }],
    children: [
      {
        type: "text" as const,
        properties: [
          { text: caption },
          { fontSize: 11 },
          { color: TEXT_MUTED },
        ],
      },
      {
        type: "text" as const,
        properties: [
          { text: binding },
          { fontSize: 20 },
          { fontWeight: "bold" as const },
          { color: "#FFFFFF" },
          { monospacedDigit: true },
        ],
      },
    ],
  };
}

function runCardLayout(): ActivityLayout {
  return {
    type: "container" as const,
    properties: [
      { direction: "vertical" as const },
      { spacing: 10 },
      { padding: 14 },
      { backgroundColor: CARD_BG },
    ],
    children: [
      {
        type: "container" as const,
        properties: [{ direction: "horizontal" as const }, { spacing: 6 }],
        children: [
          {
            type: "image" as const,
            properties: [
              { systemName: "figure.run" },
              { color: CORAL },
              { width: 16 },
              { height: 16 },
            ],
          },
          {
            type: "text" as const,
            properties: [
              { text: "{{label}}" },
              { fontSize: 12 },
              { fontWeight: "semibold" as const },
              { color: CORAL },
            ],
          },
        ],
      },
      {
        type: "container" as const,
        properties: [{ direction: "horizontal" as const }, { spacing: 18 }],
        children: [
          statColumn("DISTANCE", "{{distance}}"),
          statColumn("PACE", "{{pace}}"),
          statColumn("TIME", "{{elapsed}}"),
        ],
      },
    ],
  };
}

function dynamicIslandLayout(): DynamicIslandLayout {
  const smallText = (binding: string): LayoutElement => ({
    type: "text",
    properties: [
      { text: binding },
      { fontSize: 14 },
      { fontWeight: "semibold" },
      { monospacedDigit: true },
    ],
  });
  const runGlyph: LayoutElement = {
    type: "image",
    properties: [
      { systemName: "figure.run" },
      { color: CORAL },
      { width: 14 },
      { height: 14 },
    ],
  };
  return {
    expanded: {
      leading: smallText("{{distance}}"),
      center: smallText("{{pace}}"),
      trailing: smallText("{{elapsed}}"),
      bottom: {
        type: "text" as const,
        properties: [
          { text: "{{label}}" },
          { fontSize: 12 },
          { color: TEXT_MUTED },
        ],
      },
    },
    compactLeading: runGlyph,
    compactTrailing: smallText("{{distance}}"),
    minimal: runGlyph,
  };
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
    const plugin = await loadPlugin();
    if (!plugin) return;
    const result = await plugin.startActivity({
      layout: runCardLayout(),
      dynamicIslandLayout: dynamicIslandLayout(),
      data: { ...data },
      behavior: {
        systemActionForegroundColor: CORAL,
        keyLineTint: CORAL,
        /* Required by the plugin type; tapping the card foregrounds the
           app regardless. "tropos://run" is inert until a custom URL
           scheme is registered — noted in docs/run-live-activity.md. */
        widgetUrl: "tropos://run",
      },
    });
    activityId = result.activityId;
    lastUpdateAt = Date.now();
    lastPayloadKey = JSON.stringify(data);
  } catch (err) {
    logger.warn("[runLiveActivity] start failed", err);
  } finally {
    starting = false;
  }
}

/**
 * Push fresh stats. Throttled to one OS call per MIN_UPDATE_INTERVAL_MS
 * and skipped entirely when nothing changed — ActivityKit budgets
 * updates, and the caller ticks every second.
 */
export async function updateRunActivity(data: RunActivityData): Promise<void> {
  if (activityId === null) return;
  const key = JSON.stringify(data);
  const now = Date.now();
  if (key === lastPayloadKey) return;
  if (now - lastUpdateAt < MIN_UPDATE_INTERVAL_MS) return;
  // Claim the slot before the await so a per-second caller can't stack
  // parallel updates while one is in flight.
  lastUpdateAt = now;
  lastPayloadKey = key;
  try {
    const plugin = await loadPlugin();
    if (!plugin) return;
    await plugin.updateActivity({ activityId, data: { ...data } });
  } catch (err) {
    logger.warn("[runLiveActivity] update failed", err);
  }
}

/**
 * End and dismiss the Live Activity. Safe to call when none is live
 * (unmount cleanup + finish/discard can all call it). Final stats stick
 * on the lock screen briefly per OS behaviour when provided.
 */
export async function endRunActivity(final?: RunActivityData): Promise<void> {
  const id = activityId;
  activityId = null;
  lastPayloadKey = "";
  if (id === null) return;
  try {
    const plugin = await loadPlugin();
    if (!plugin) return;
    await plugin.endActivity({
      activityId: id,
      data: final ? { ...final } : {},
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
}
