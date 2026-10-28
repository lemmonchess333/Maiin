/**
 * Live Activity for a lift's rest: the countdown on the lock screen and in
 * the Dynamic Island while the phone is down between sets (Mob2 call 1,
 * lifting finding 7). Hevy shows the same.
 *
 * NATIVE HALF DEFERRED. This is the app's half only, on the seam
 * `runLiveActivity.ts` set: the only module that touches
 * `capacitor-live-activities` for a rest, the plugin imported dynamically
 * so the web bundle never carries it, every call guarded and its failure
 * swallowed, since a Live Activity must never affect the workout. Until
 * the widget extension in `docs/run-live-activity.md` is built in Xcode
 * (Mob2 call 13: when the owner has a Mac), `startActivity` rejects and
 * this does nothing; on the web it is never loaded. The web's own way to
 * see a rest from outside the app is the tab's title (`restOutside.ts`).
 * The device check is in `docs/qa/pre-launch-backlog.md`.
 *
 * The countdown is ActivityKit's own timer element, counting to the rest's
 * end, so the lock screen keeps time with the app asleep and needs no
 * updates. Its end is part of the layout, not its data, so a rest that
 * gets longer (+15 s) is shown by ending the activity and starting
 * another.
 */
import { isNativePlatform } from "@/lib/platform";
import { logger } from "@/lib/logger";
import { THEME } from "@/lib/theme";
import type {
  ActivityLayout,
  DynamicIslandLayout,
  LayoutElement,
} from "capacitor-live-activities";

export interface RestActivity {
  /** When the rest ends, in ms. */
  endsAt: number;
  /** The exercise the rest is between sets of. */
  exerciseName?: string;
}

let activityId: string | null = null;
/** The start in flight, so an end that comes first waits for it. */
let starting: Promise<void> | null = null;

type Plugin = typeof import("capacitor-live-activities").LiveActivities;

async function loadPlugin(): Promise<Plugin | null> {
  if (!isNativePlatform()) return null;
  try {
    const mod = await import("capacitor-live-activities");
    return mod.LiveActivities;
  } catch {
    // Not in this build (the Xcode half is not done): nothing to show.
    return null;
  }
}

/* Literal hex, as the run's card has it: the plugin draws natively and
   reads no CSS custom property. The card is always dark. */
const CARD_BG = "#17171B" as const;
const TEXT_MUTED = "#8E8E93" as const;
const LIFT = THEME.lifting as `#${string}`;

const glyph = (size: number): LayoutElement => ({
  type: "image",
  properties: [
    { systemName: "dumbbell.fill" },
    { color: LIFT },
    { width: size },
    { height: size },
  ],
});

const countdown = (endsAt: number, fontSize: number): LayoutElement => ({
  type: "timer",
  properties: [
    { endTime: endsAt },
    { style: "timer" },
    { fontSize },
    { fontWeight: "bold" },
    { color: "#FFFFFF" },
    { monospacedDigit: true },
  ],
});

function cardLayout(endsAt: number): ActivityLayout {
  return {
    type: "container",
    properties: [
      { direction: "vertical" },
      { spacing: 8 },
      { padding: 14 },
      { backgroundColor: CARD_BG },
    ],
    children: [
      {
        type: "container",
        properties: [{ direction: "horizontal" }, { spacing: 6 }],
        children: [
          glyph(16),
          {
            type: "text",
            properties: [
              { text: "Rest" },
              { fontSize: 12 },
              { fontWeight: "semibold" },
              { color: LIFT },
            ],
          },
        ],
      },
      countdown(endsAt, 28),
      {
        type: "text",
        properties: [
          { text: "{{next}}" },
          { fontSize: 13 },
          { color: TEXT_MUTED },
        ],
      },
    ],
  };
}

function islandLayout(endsAt: number): DynamicIslandLayout {
  return {
    expanded: {
      leading: glyph(16),
      center: countdown(endsAt, 18),
      bottom: {
        type: "text",
        properties: [
          { text: "{{next}}" },
          { fontSize: 12 },
          { color: TEXT_MUTED },
        ],
      },
    },
    compactLeading: glyph(14),
    compactTrailing: countdown(endsAt, 14),
    minimal: glyph(14),
  };
}

/** What the card says under the countdown. */
export function restActivityLine(exerciseName?: string): string {
  return exerciseName ? `Next: ${exerciseName}` : "Next set";
}

/** Shows a rest on the lock screen, in place of any rest shown there. */
export async function startRestActivity(rest: RestActivity): Promise<void> {
  await endRestActivity();
  const begin = (async () => {
    const plugin = await loadPlugin();
    if (!plugin) return;
    try {
      const result = await plugin.startActivity({
        layout: cardLayout(rest.endsAt),
        dynamicIslandLayout: islandLayout(rest.endsAt),
        data: { next: restActivityLine(rest.exerciseName) },
        behavior: {
          systemActionForegroundColor: LIFT,
          keyLineTint: LIFT,
          // Tapping the card opens the app wherever it was.
          widgetUrl: "tropos://workout",
        },
      });
      activityId = result.activityId;
    } catch (err) {
      logger.warn("[restLiveActivity] start failed", err);
    }
  })();
  starting = begin;
  await begin;
  if (starting === begin) starting = null;
}

/** Takes the rest off the lock screen. Safe with none shown. */
export async function endRestActivity(): Promise<void> {
  if (starting) await starting;
  const id = activityId;
  activityId = null;
  if (id === null) return;
  try {
    const plugin = await loadPlugin();
    if (!plugin) return;
    await plugin.endActivity({ activityId: id, data: {} });
  } catch (err) {
    logger.warn("[restLiveActivity] end failed", err);
  }
}

/** Test-only: forget the activity between cases. */
export function __resetRestActivityForTests(): void {
  activityId = null;
  starting = null;
}
