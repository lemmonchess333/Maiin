/**
 * A lift's Live Activity: one card from the first set to the finish (Wid2
 * call 2), on the Lock Screen and in the Dynamic Island, drawn the way
 * Wid2 decided (design C, the picture leads). It replaces the card that
 * showed a rest alone (Mob2 call 1, lifting finding 7), which is Apple's
 * advice: one Live Activity whose layout changes.
 *
 * - **On a set:** the session's drawing mid-rep, "SET 2 OF 4", the set's
 *   weight and reps as the card's one figure ("100 kg × 5"), and the
 *   exercise under it.
 * - **Resting:** the drawing standing, "REST", the system's own countdown
 *   to the rest's end, which stops at 0:00 and keeps time with the app
 *   asleep, and the set that comes next.
 * - **Rest over:** the drawing set up for the next set, "REST OVER", the
 *   next set's name as the figure. Only the app can say so, so it shows
 *   once the app is awake past the rest's end; asleep, the countdown holds
 *   at 0:00.
 * - **Finished:** the card goes at once (Wid2 call 4, `endCard`).
 *
 * The drawing is the session's lead lift (`sessionLeadArt`), one pose of
 * the flipbook Home's hero plays (`liveActivityArt.ts`); a session whose
 * lead lift has none shows no drawing.
 *
 * The plugin draws a layout the app sends when a card starts, and a card's
 * later updates change its data only. A rest's countdown is part of the
 * layout, so a card cannot turn from a set to a rest: each change between
 * a set and a rest starts the card again (Wid2 call 6, its first step),
 * which happens with the app open, where ActivityKit allows a start. A set
 * after a set, and a rest's end, change the data alone.
 *
 * Every call is guarded and its failure swallowed: a Live Activity must
 * never affect the workout. On the web, and on an iPhone below iOS 16.2,
 * nothing shows; the web's own way to see a rest from outside is the
 * tab's title (`restOutside.ts`). The Settings switch turns it off
 * (`liveActivitySetting.ts`).
 */
import { logger } from "@/lib/logger";
import {
  endCard,
  ISLAND_FIGURE_PT,
  loadLiveActivities,
} from "@/lib/liveActivities";
import {
  liveActivitiesOn,
  onLiveActivitiesSetting,
} from "@/lib/liveActivitySetting";
import {
  LIFT_POSE,
  POSE_HEIGHT_PT,
  poseAssetName,
  poseBoxPt,
  type LiftArtId,
} from "@/lib/liveActivityArt";
import { mixHex } from "@/lib/runLiveActivity";
import { THEME } from "@/lib/theme";
import type {
  ActivityLayout,
  DynamicIslandLayout,
  LayoutElement,
} from "capacitor-live-activities";

/** The set the lifter is on, or the one a rest leads to. */
export interface LiftCardSet {
  exerciseName: string;
  /** "Set 2 of 4", "Warm-up 1 of 2". */
  setLabel: string;
  /** As the rest band names it: "100 kg × 5", "12 reps", "30 s". */
  load: string;
  /** The island's figure: "2/4". */
  fact: string;
}

export interface LiftCardSession {
  /** The day's name as the workout's header says it ("Pull A"). */
  name: string;
  /** The lead lift's drawing, or null for none. */
  art: LiftArtId | null;
  /** The set the cursor is on; null once every set is done. */
  set: LiftCardSet | null;
  /** Sets done that count, for the card once every set is done. */
  setsDone: number;
}

type Phase = "set" | "rest" | "restOver" | "allDone";

interface Rest {
  /** When it ends, ms. */
  endsAt: number;
}

type Hex = `#${string}`;
/* Literal hex, as the run's card has it: the plugin draws natively and
   reads no CSS custom property. The card is always dark. */
const CARD_BG = "#17171B" as const;
const TEXT_MUTED = "#8E8E93" as const;
const LIFT = THEME.lifting as Hex;
const LIFT_LIGHT = THEME.liftingLight as Hex;
/** The card's soft light: the lift's purple at about a fifth, in the
 *  corner the drawing stands in (DS6, DESIGN_GUIDE §14o). */
const GLOW = mixHex(CARD_BG, LIFT, 0.22);

/** The figure's size: "+12.5 kg × 10" is the longest a set says, and
 *  needs about 200 pt at 28 pt beside a drawing at its widest (Tropos
 *  heuristic, from typical digit widths; the backlog's device rows
 *  confirm it). A rest's countdown is short and takes the run's size. */
const SET_FIGURE_PT = 28;
const REST_FIGURE_PT = 34;

/* A placeholder where the plugin's types want the value itself: it reads
   `{{key}}` from the update's data for any property. */
const bound = <T>(key: string) => `{{${key}}}` as unknown as T;

const glyph = (size: number): LayoutElement => ({
  type: "image",
  properties: [
    { systemName: "dumbbell.fill" },
    { color: LIFT },
    { width: size },
    { height: size },
  ],
});

/** The session's drawing, in the pose the update names. */
const drawing = (art: LiftArtId, height: number): LayoutElement => {
  const box = poseBoxPt(art, height);
  return {
    type: "image",
    properties: [
      { asset: bound<string>("pose") },
      { resizable: true },
      { contentMode: "fit" },
      { height: box.height },
      { width: box.width },
    ],
  };
};

const kicker: LayoutElement = {
  type: "text",
  properties: [
    { text: "{{kicker}}" },
    { fontSize: 11 },
    { fontWeight: "semibold" },
    { color: LIFT_LIGHT },
    { lineLimit: 1 },
  ],
};

const textFigure = (fontSize: number): LayoutElement => ({
  type: "text",
  properties: [
    { text: "{{figure}}" },
    { fontSize },
    { fontWeight: "bold" },
    { color: "#FFFFFF" },
    { monospacedDigit: true },
    { lineLimit: 1 },
  ],
});

const countdown = (
  endsAt: number,
  fontSize: number,
  alignment?: "center"
): LayoutElement => ({
  type: "timer",
  properties: [
    { endTime: endsAt },
    // It stops at 0:00. "timer" counts back up once its time has passed,
    // and the phone can stay locked well past a rest with the app asleep.
    { style: "countdown" },
    { fontSize },
    { fontWeight: "bold" },
    { color: "#FFFFFF" },
    { monospacedDigit: true },
    ...(alignment ? [{ alignment }] : []),
  ],
});

const line: LayoutElement = {
  type: "text",
  properties: [
    { text: "{{line}}" },
    { fontSize: 13 },
    { color: TEXT_MUTED },
    { monospacedDigit: true },
    { lineLimit: 1 },
  ],
};

const smallFact: LayoutElement = {
  type: "text",
  properties: [
    { text: "{{fact}}" },
    { fontSize: ISLAND_FIGURE_PT },
    { fontWeight: "semibold" },
    { color: LIFT_LIGHT },
    { monospacedDigit: true },
  ],
};

/** The drawing on the left when there is one, the words beside it, and a
 *  spacer so the row (and the light behind it) runs the card's width. */
const pictureRow = (
  art: LiftArtId | null,
  height: number,
  figure: LayoutElement,
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
      ...(art ? [drawing(art, height)] : []),
      {
        type: "container",
        properties: [
          { direction: "vertical" },
          { insideAlignment: "leading" },
          { spacing: 4 },
        ],
        children: [kicker, figure, line],
      },
      { type: "spacer", properties: [] },
    ],
  }) as LayoutElement;

/** The Lock Screen card: the picture row in the lift's light, with the
 *  session's name in its top corner. */
function cardLayout(art: LiftArtId | null, rest: Rest | null): ActivityLayout {
  return {
    type: "container",
    properties: [{ direction: "stack" }, { insideAlignment: "top-trailing" }],
    children: [
      pictureRow(
        art,
        POSE_HEIGHT_PT,
        rest
          ? countdown(rest.endsAt, REST_FIGURE_PT)
          : textFigure(SET_FIGURE_PT),
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
      ),
      {
        type: "text",
        properties: [
          { text: "{{name}}" },
          { fontSize: 13 },
          { fontWeight: "semibold" },
          { color: TEXT_MUTED },
          { lineLimit: 1 },
          { padding: 14 },
        ],
      },
    ],
  } as ActivityLayout;
}

function islandLayout(
  art: LiftArtId | null,
  rest: Rest | null
): DynamicIslandLayout {
  return {
    expanded: {
      leading: glyph(16),
      trailing: {
        type: "text",
        properties: [
          { text: "{{name}}" },
          { fontSize: 13 },
          { fontWeight: "semibold" },
          { color: TEXT_MUTED },
          { lineLimit: 1 },
        ],
      },
      // The drawing can be read only here: a compact side is 37 pt tall.
      bottom: pictureRow(
        art,
        84,
        rest ? countdown(rest.endsAt, 30) : textFigure(26),
        []
      ),
    },
    // The two sides read as one fact: a lift, and where it stands.
    compactLeading: glyph(14),
    compactTrailing: rest
      ? countdown(rest.endsAt, ISLAND_FIGURE_PT)
      : smallFact,
    // Something live in the smallest size, as Apple asks (Wid2 call 1):
    // the rest's time left, or the set's number.
    minimal: rest
      ? countdown(rest.endsAt, ISLAND_FIGURE_PT, "center")
      : smallFact,
  };
}

/** What the card says in each phase (Wid2 call 1). */
export function liftCardWords(
  session: LiftCardSession,
  phase: Phase
): { kicker: string; figure: string; line: string; fact: string } {
  const set = session.set;
  if (phase === "allDone" || !set)
    return {
      kicker: "ALL SETS DONE",
      figure: `${session.setsDone} ${session.setsDone === 1 ? "set" : "sets"}`,
      line: "Finish when you’re ready",
      fact: "Done",
    };
  if (phase === "rest")
    return {
      kicker: "REST",
      // The countdown is the system's own; this is its words' twin.
      figure: "",
      line: `Next: ${set.exerciseName} · ${set.setLabel.toLowerCase()} · ${set.load}`,
      fact: "",
    };
  if (phase === "restOver")
    return {
      kicker: "REST OVER",
      figure: set.setLabel,
      line: `${set.exerciseName} · ${set.load}`,
      fact: "Go",
    };
  return {
    kicker: set.setLabel.toUpperCase(),
    figure: set.load,
    line: set.exerciseName,
    fact: set.fact,
  };
}

/** The pose each phase shows: mid-rep on a set, standing between sets,
 *  set up once the rest is over. */
const PHASE_POSE: Record<Phase, number> = {
  set: LIFT_POSE.lifting,
  rest: LIFT_POSE.standing,
  restOver: LIFT_POSE.setUp,
  allDone: LIFT_POSE.standing,
};

/** What the card's bindings read. */
export function liftCardData(
  session: LiftCardSession,
  phase: Phase
): Record<string, string> {
  return {
    ...liftCardWords(session, phase),
    name: session.name,
    pose: session.art ? poseAssetName(session.art, PHASE_POSE[phase]) : "",
  };
}

/* ── What is wanted, and what is shown ─────────────────────────────── */

let session: LiftCardSession | null = null;
let rest: Rest | null = null;
let restOverTimer: ReturnType<typeof setTimeout> | null = null;
/** The rest whose end has passed with the app awake. */
let restOverAt: number | null = null;

interface Shown {
  activityId: string;
  /** The layout the card was started with: a change here starts it again. */
  layoutKey: string;
  dataKey: string;
}
let shown: Shown | null = null;
/** Every change goes through one queue, so a start in flight is never
 *  raced by an end or another start. */
let queue: Promise<void> = Promise.resolve();
let listening = false;

function phaseNow(): Phase {
  if (!session?.set) return "allDone";
  if (!rest) return "set";
  return restOverAt === rest.endsAt ? "restOver" : "rest";
}

/** The card the state asks for, or null for none. */
function wanted(): {
  layoutKey: string;
  data: Record<string, string>;
  art: LiftArtId | null;
  rest: Rest | null;
} | null {
  if (!session || !liveActivitiesOn()) return null;
  const phase = phaseNow();
  // A rest over shows its words, not its countdown: the set's layout.
  const timed = phase === "rest" ? rest : null;
  return {
    layoutKey: `${session.art ?? ""}|${timed ? timed.endsAt : "set"}`,
    data: liftCardData(session, phase),
    art: session.art,
    rest: timed,
  };
}

async function endShown(): Promise<void> {
  const current = shown;
  shown = null;
  if (!current) return;
  try {
    const plugin = (await loadLiveActivities())?.plugin;
    if (plugin) await endCard(plugin, current.activityId);
  } catch (err) {
    logger.warn("[liftLiveActivity] end failed", err);
  }
}

/** Brings the card to what the state asks for: ends it, starts it again,
 *  or updates its data. */
async function reconcile(): Promise<void> {
  const want = wanted();
  if (!want) return endShown();
  const dataKey = JSON.stringify(want.data);
  if (shown && shown.layoutKey === want.layoutKey) {
    if (shown.dataKey === dataKey) return;
    try {
      const plugin = (await loadLiveActivities())?.plugin;
      if (!plugin) return;
      await plugin.updateActivity({
        activityId: shown.activityId,
        data: want.data,
      });
      shown = { ...shown, dataKey };
    } catch (err) {
      logger.warn("[liftLiveActivity] update failed", err);
    }
    return;
  }
  await endShown();
  try {
    const plugin = (await loadLiveActivities())?.plugin;
    if (!plugin) return;
    const result = await plugin.startActivity({
      layout: cardLayout(want.art, want.rest),
      dynamicIslandLayout: islandLayout(want.art, want.rest),
      data: want.data,
      behavior: {
        // The whole card is dark, the light included, to its corners.
        backgroundTint: CARD_BG,
        systemActionForegroundColor: LIFT,
        keyLineTint: LIFT,
        // Tapping the card opens the app wherever it was.
        widgetUrl: "tropos://workout",
      },
    });
    shown = {
      activityId: result.activityId,
      layoutKey: want.layoutKey,
      dataKey,
    };
  } catch (err) {
    logger.warn("[liftLiveActivity] start failed", err);
  }
}

function sync(): Promise<void> {
  if (!listening) {
    listening = true;
    // The Settings switch: off ends the card, on brings it back mid-lift.
    onLiveActivitiesSetting(() => void sync());
  }
  queue = queue.then(reconcile, reconcile);
  return queue;
}

/**
 * Shows the lift on the Lock Screen: the session and the set it is on.
 * Null takes the card away at once, for a finished workout or one left.
 */
export function showLiftSession(next: LiftCardSession | null): Promise<void> {
  session = next;
  if (!next) clearRest();
  return sync();
}

/** Shows a rest on the lift's card until it is cleared with null. A rest
 *  made longer is shown again with its new end. */
export function showLiftRest(next: Rest | null): Promise<void> {
  clearRest();
  if (next) {
    rest = next;
    // Asleep, a timer waits until the app wakes, and says so then.
    restOverTimer = setTimeout(
      () => {
        restOverTimer = null;
        if (rest?.endsAt !== next.endsAt) return;
        restOverAt = next.endsAt;
        void sync();
      },
      // A browser fires a wait past 2^31 ms at once; no rest is that long.
      Math.min(MAX_WAIT_MS, Math.max(0, next.endsAt - Date.now()))
    );
  }
  return sync();
}

const MAX_WAIT_MS = 2 ** 31 - 1;

function clearRest(): void {
  if (restOverTimer) clearTimeout(restOverTimer);
  restOverTimer = null;
  rest = null;
  restOverAt = null;
}

/** Test-only: forget the card and the state between cases. */
export function __resetLiftActivityForTests(): void {
  clearRest();
  session = null;
  shown = null;
  queue = Promise.resolve();
}
