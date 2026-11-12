/**
 * Live Activity for active runs — lock-screen / Dynamic Island pace,
 * distance and time while a run records (Tier 2 item 4), drawn the way
 * Wid2 decided (2026-11-12): the runner's drawing leads.
 *
 * Seam-first, per the appCheck.ts / analyticsProvider.ts pattern: this
 * module reaches `capacitor-live-activities` only through
 * `liveActivities.ts`, which imports the plugin dynamically so the
 * registration chunk never ships in the web bundle, and every call is
 * guarded + error-swallowed — a
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
 * Native half: the `LiveActivitiesExtension` widget target in
 * ios/App (docs/run-live-activity.md), NSSupportsLiveActivities and the
 * App Group. A build without it, or iOS before 16.2, rejects
 * `startActivity`, and this module swallows it.
 */
import { logger } from "@/lib/logger";
import { endCard, loadLiveActivities } from "@/lib/liveActivities";
import { POSE_HEIGHT_PT, poseAt } from "@/lib/liveActivityArt";
import { THEME } from "@/lib/theme";
/* Type-only — erased at build, zero web-bundle cost (the runtime import
   below stays dynamic). */
import type {
  ActivityLayout,
  DynamicIslandLayout,
  LayoutElement,
} from "capacitor-live-activities";

export interface RunActivityData {
  /** Pre-formatted, unit-aware distance, e.g. "3.4 km". */
  distance: string;
  /** Pre-formatted rolling pace, e.g. "5:12 /km" (em-dash when unknown). */
  pace: string;
  /** Pre-formatted elapsed time from the run timer, e.g. "23:41". */
  elapsed: string;
  /** State line: "Recording" | "Paused" | activity label. */
  label: string;
  /** The run is paused: the drawing holds its pose, dimmed. */
  paused?: boolean;
}

/** Min interval between updateActivity calls. ActivityKit throttles and
 *  budgets updates; a per-second stream would be discarded anyway. */
const MIN_UPDATE_INTERVAL_MS = 2000;

/** The drawing takes its next pose on every second update sent, about
 *  every four seconds of a run: often enough to read as running, and not
 *  a picture that twitches each time a figure changes. */
const UPDATES_PER_POSE = 2;

let activityId: string | null = null;
/** The start in flight: a second start waits on it, and an end that
 *  comes first waits for it, so a card that appears after its run ended
 *  is taken down rather than left on "Recording". */
let starting: Promise<void> | null = null;
let lastUpdateAt = 0;
let lastPayloadKey = "";
/** Updates sent while the run was moving, which is what turns the pose. */
let movingUpdates = 0;

type Hex = `#${string}`;

const CARD_BG = "#17171B" as const; // THEME.surface — the run overlay is always-dark
/* Literal hex is DELIBERATE here (DS2 exemption): the Live Activity plugin
   renders natively and cannot resolve CSS custom properties, and this
   overlay is always-dark, where #8E8E93 measures ~4.9:1 — passing. */
const TEXT_MUTED = "#8E8E93" as const;
/* The plugin's ColorString wants a template-literal hex; THEME.running is
   typed plain string. The value IS "#D4637A" — assert the shape once. */
const CORAL = THEME.running as Hex;
const CORAL_LIGHT = THEME.runningLight as Hex;

/** `tint` laid over `base` at `share`, as one opaque colour: the plugin's
 *  gradient takes hex stops and has no alpha. */
export function mixHex(base: string, tint: string, share: number): Hex {
  const channel = (hex: string, at: number) =>
    parseInt(hex.slice(1 + at * 2, 3 + at * 2), 16);
  const mixed = [0, 1, 2].map((at) =>
    Math.round(channel(base, at) * (1 - share) + channel(tint, at) * share)
      .toString(16)
      .padStart(2, "0")
  );
  return `#${mixed.join("").toUpperCase()}`;
}

/** The card's soft light: the run's colour at about a fifth, in the corner
 *  the runner stands in, gone by the card's middle (DS6, DESIGN_GUIDE §14o). */
const GLOW = mixHex(CARD_BG, CORAL, 0.22);

/** The flipbook frame's shape (269 x 480), for the drawing's box. */
const POSE_ASPECT = 269 / 480;

/* A placeholder where the plugin's types want the value itself: it reads
   `{{key}}` from the update's data for any property. */
const bound = <T>(key: string) => `{{${key}}}` as unknown as T;

/** The runner, in the pose and at the strength the update names. */
const runner = (height: number): LayoutElement => ({
  type: "image",
  properties: [
    { asset: bound<string>("pose") },
    { resizable: true },
    { contentMode: "fit" },
    { height },
    { width: Math.round(height * POSE_ASPECT) },
    { opacity: bound<number>("poseOpacity") },
  ],
});

const runGlyph = (size: number): LayoutElement => ({
  type: "image",
  properties: [
    { systemName: "figure.run" },
    { color: CORAL },
    { width: size },
    { height: size },
  ],
});

const kicker: LayoutElement = {
  type: "text",
  properties: [
    { text: "{{kicker}}" },
    { fontSize: 11 },
    { fontWeight: "semibold" },
    { color: CORAL_LIGHT },
  ],
};

/** The distance as the card's one figure, its unit small beside it. */
const figure = (fontSize: number): LayoutElement => ({
  type: "container",
  properties: [
    { direction: "horizontal" },
    { insideAlignment: "last-text-baseline" },
    { spacing: 4 },
  ],
  children: [
    {
      type: "text",
      properties: [
        { text: "{{distanceValue}}" },
        { fontSize },
        { fontWeight: "bold" },
        { color: "#FFFFFF" },
        { monospacedDigit: true },
      ],
    },
    {
      type: "text",
      properties: [
        { text: "{{distanceUnit}}" },
        { fontSize: 15 },
        { fontWeight: "semibold" },
        { color: TEXT_MUTED },
      ],
    },
  ],
});

const line = (binding: string): LayoutElement => ({
  type: "text",
  properties: [
    { text: binding },
    { fontSize: 13 },
    { color: TEXT_MUTED },
    { monospacedDigit: true },
  ],
});

/** The drawing on the left, the words beside it, and a spacer so the row
 *  (and the card's light behind it) runs the card's whole width. */
const pictureRow = (
  height: number,
  words: LayoutElement[],
  frame: object[]
): LayoutElement =>
  ({
    type: "container",
    properties: [
      { direction: "horizontal" },
      { insideAlignment: "bottom" },
      { spacing: 14 },
      ...frame,
    ],
    children: [
      runner(height),
      {
        type: "container",
        properties: [
          { direction: "vertical" },
          { insideAlignment: "leading" },
          { spacing: 4 },
        ],
        children: words,
      },
      { type: "spacer", properties: [] },
    ],
  }) as LayoutElement;

function runCardLayout(): ActivityLayout {
  return pictureRow(
    POSE_HEIGHT_PT,
    [kicker, figure(34), line("{{line}}")],
    [
      { padding: 14 },
      {
        backgroundGradient: {
          colors: [GLOW, CARD_BG, CARD_BG],
          startPoint: "bottomLeading",
          endPoint: "topTrailing",
        },
      },
    ]
  );
}

function dynamicIslandLayout(): DynamicIslandLayout {
  const small = (binding: string, size: number): LayoutElement => ({
    type: "text",
    properties: [
      { text: binding },
      { fontSize: size },
      { fontWeight: "semibold" },
      { color: CORAL_LIGHT },
      { monospacedDigit: true },
    ],
  });
  return {
    expanded: {
      leading: {
        type: "container",
        properties: [{ direction: "horizontal" }, { spacing: 6 }],
        children: [runGlyph(16), kicker],
      },
      trailing: {
        type: "text",
        properties: [
          { text: "{{elapsed}}" },
          { fontSize: 13 },
          { fontWeight: "semibold" },
          { color: TEXT_MUTED },
          { monospacedDigit: true },
        ],
      },
      // The drawing can be read only here: a compact side is 37 pt tall.
      bottom: pictureRow(84, [figure(32), line("{{paceLine}}")], []),
    },
    // The two sides read as one fact: a run, and how far.
    compactLeading: runGlyph(14),
    compactTrailing: small("{{distanceValue}}", 14),
    // Something live in the smallest size, as Apple asks (Wid2 call 1).
    minimal: small("{{distanceValue}}", 12),
  };
}

/** What the card's bindings read, from the run's labels and the pose. */
export function runCardData(
  data: RunActivityData,
  step: number
): Record<string, string> {
  // "3.4 km" is a figure and its unit; an em-dash (no distance yet) is
  // the figure alone.
  const cut = data.distance.lastIndexOf(" ");
  const distanceValue = cut < 0 ? data.distance : data.distance.slice(0, cut);
  const distanceUnit = cut < 0 ? "" : data.distance.slice(cut + 1);
  return {
    kicker: data.label.toUpperCase(),
    distanceValue,
    distanceUnit,
    elapsed: data.elapsed,
    line: `${data.pace} · ${data.elapsed}`,
    paceLine: `Pace ${data.pace}`,
    pose: poseAt("run-easy", step),
    poseOpacity: data.paused ? "0.45" : "1",
  };
}

/**
 * Start the run Live Activity. Idempotent — a second call while one is
 * live (or starting) is a no-op, so the caller can invoke it from a
 * re-runnable effect without double-carding the lock screen.
 */
export async function startRunActivity(data: RunActivityData): Promise<void> {
  if (activityId !== null || starting) return;
  const begin = beginRunActivity(data);
  starting = begin;
  await begin;
  if (starting === begin) starting = null;
}

async function beginRunActivity(data: RunActivityData): Promise<void> {
  try {
    const plugin = (await loadLiveActivities())?.plugin;
    if (!plugin) return;
    const result = await plugin.startActivity({
      layout: runCardLayout(),
      dynamicIslandLayout: dynamicIslandLayout(),
      data: runCardData(data, 0),
      behavior: {
        // The whole card is dark, the light included, to its corners.
        backgroundTint: CARD_BG,
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
    movingUpdates = 0;
  } catch (err) {
    logger.warn("[runLiveActivity] start failed", err);
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
  // A paused run holds its pose.
  if (!data.paused) movingUpdates += 1;
  const step = Math.floor(movingUpdates / UPDATES_PER_POSE);
  try {
    const plugin = (await loadLiveActivities())?.plugin;
    if (!plugin) return;
    await plugin.updateActivity({ activityId, data: runCardData(data, step) });
  } catch (err) {
    logger.warn("[runLiveActivity] update failed", err);
  }
}

/**
 * End the Live Activity and take it off the lock screen at once. Safe to
 * call when none is live (unmount cleanup + finish/discard can all call
 * it).
 */
export async function endRunActivity(final?: RunActivityData): Promise<void> {
  if (starting) await starting;
  const id = activityId;
  activityId = null;
  lastPayloadKey = "";
  if (id === null) return;
  try {
    const plugin = (await loadLiveActivities())?.plugin;
    if (!plugin) return;
    await endCard(
      plugin,
      id,
      final
        ? runCardData(final, Math.floor(movingUpdates / UPDATES_PER_POSE))
        : {}
    );
  } catch (err) {
    logger.warn("[runLiveActivity] end failed", err);
  }
}

/** Test-only: reset module state between cases. */
export function __resetRunActivityForTests(): void {
  activityId = null;
  starting = null;
  lastUpdateAt = 0;
  lastPayloadKey = "";
  movingUpdates = 0;
}
