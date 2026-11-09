/**
 * Live Activity for a lift's rest: the countdown on the lock screen and in
 * the Dynamic Island while the phone is down between sets (Mob2 call 1,
 * lifting finding 7). Hevy shows the same.
 *
 * The app's half, on the seam `runLiveActivity.ts` set: the only module
 * that touches `capacitor-live-activities` for a rest, the plugin imported
 * dynamically so the web bundle never carries it, every call guarded and
 * its failure swallowed, since a Live Activity must never affect the
 * workout. The widget extension (`ios/App/LiveActivities/`,
 * docs/run-live-activity.md) draws the card from the data sent here, the
 * keys `liveActivityContract.ts` lists. On the web this is never loaded;
 * the web's own way to see a rest from outside the app is the tab's title
 * (`restOutside.ts`). The device check is in `docs/qa/pre-launch-backlog.md`.
 *
 * The countdown and its bar are the system's own, counting from the
 * rest's start to its end, so the lock screen keeps time with the app
 * asleep and needs no updates. The rest's end is also the activity's
 * stale date: when it passes, the system draws the card again as done,
 * green, as the rest band turns green. A rest that gets longer (+15 s) is
 * shown by ending the activity and starting another, since an update
 * would clear that stale date.
 */
import { isNativePlatform } from "@/lib/platform";
import { logger } from "@/lib/logger";
import { PLUGIN_LAYOUT } from "@/lib/liveActivityContract";

export interface RestActivity {
  /** When the rest started, in ms. */
  startedAt: number;
  /** When the rest ends, in ms. */
  endsAt: number;
  /** The exercise of the set the rest leads to. */
  exerciseName?: string;
  /** That set, as the rest band names it: "Set 2" and "15 kg × 10". */
  next?: { name: string; load: string };
}

let activityId: string | null = null;
/** The data the card was started with, sent again as its final state. */
let shownData: Record<string, string | number> | null = null;
/** The start in flight, so an end that comes first waits for it. */
let starting: Promise<void> | null = null;

type Plugin = typeof import("capacitor-live-activities").LiveActivities;

/** A holder, never the plugin: a promise resolved with a Capacitor plugin
 *  calls its `then` on the native side and never settles (revenuecat.ts). */
async function loadPlugin(): Promise<{ plugin: Plugin } | null> {
  if (!isNativePlatform()) return null;
  try {
    const mod = await import("capacitor-live-activities");
    return { plugin: mod.LiveActivities };
  } catch {
    // Not in this build: nothing to show.
    return null;
  }
}

/** The next set's line under the countdown: "Set 2 · 15 kg × 10". */
export function restSetLine(next?: { name: string; load: string }): string {
  return next
    ? [next.name, next.load].filter((part) => part.trim()).join(" · ")
    : "";
}

/** The content state the widget reads (liveActivityContract.ts). */
export function restActivityData(
  rest: RestActivity
): Record<string, string | number> {
  return {
    kind: "rest",
    startedAt: Math.min(rest.startedAt, rest.endsAt),
    endsAt: rest.endsAt,
    exercise: rest.exerciseName?.trim() ?? "",
    set: restSetLine(rest.next),
  };
}

/** Shows a rest on the lock screen, in place of any rest shown there. */
export async function startRestActivity(rest: RestActivity): Promise<void> {
  await endRestActivity();
  const begin = (async () => {
    const plugin = (await loadPlugin())?.plugin;
    if (!plugin) return;
    const data = restActivityData(rest);
    try {
      const result = await plugin.startActivity({
        ...PLUGIN_LAYOUT,
        data,
        staleDate: rest.endsAt,
      });
      activityId = result.activityId;
      shownData = data;
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
  const data = shownData;
  activityId = null;
  shownData = null;
  if (id === null) return;
  try {
    const plugin = (await loadPlugin())?.plugin;
    if (!plugin) return;
    await plugin.endActivity({ activityId: id, data: data ?? {} });
  } catch (err) {
    logger.warn("[restLiveActivity] end failed", err);
  }
}

/** Test-only: forget the activity between cases. */
export function __resetRestActivityForTests(): void {
  activityId = null;
  shownData = null;
  starting = null;
}
