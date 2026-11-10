/**
 * The one way into `capacitor-live-activities`, for the run's card
 * (`runLiveActivity.ts`) and a lift's rest (`restLiveActivity.ts`).
 *
 * - The plugin is imported dynamically, so the web bundle never carries
 *   it, and handed back in a holder: a promise resolved with a Capacitor
 *   plugin calls its `then` on the native side and never settles
 *   (revenuecat.ts).
 * - A card is taken off the Lock Screen as it ends (`endCard`). iOS's
 *   default keeps an ended card there for up to four hours: one for every
 *   rest of a lift, and a run's with its figures blank. The plugin always
 *   used the default; `patches/capacitor-live-activities+8.0.0.patch`
 *   makes it read `dismissalPolicy`.
 * - Before the first card of a launch starts, the cards an earlier launch
 *   left are ended. The app forgets a card's id when it closes, so a
 *   launch that was closed mid-run or mid-rest (by the person, or by iOS)
 *   left its card on the Lock Screen until iOS ended it, up to eight
 *   hours later: a rest at 0:00, a run stopped at the figures it last
 *   sent. Every start waits for this, so it can only find cards from
 *   before this launch.
 *
 * Every call is the caller's to guard: a Live Activity must never affect
 * the session it shows.
 */
import { isNativePlatform } from "@/lib/platform";
import { logger } from "@/lib/logger";

type Plugin = typeof import("capacitor-live-activities").LiveActivities;

let ready: Promise<{ plugin: Plugin } | null> | null = null;

/** The plugin, once this launch's leftover cards are gone; null on the
 *  web, or where the plugin is not in the build. */
export function loadLiveActivities(): Promise<{ plugin: Plugin } | null> {
  if (!isNativePlatform()) return Promise.resolve(null);
  ready ??= open().then((opened) => {
    // A failed import is tried again on the next call.
    if (!opened) ready = null;
    return opened;
  });
  return ready;
}

async function open(): Promise<{ plugin: Plugin } | null> {
  let plugin: Plugin;
  try {
    plugin = (await import("capacitor-live-activities")).LiveActivities;
  } catch {
    return null;
  }
  await endEarlierCards(plugin);
  return { plugin };
}

/** What the patched plugin reads to end a card (patches/, whose
 *  `endActivity` honours `dismissalPolicy`). The plugin's own types have
 *  no `behavior` here. */
type EndOptions = Parameters<Plugin["endActivity"]>[0] & {
  behavior: { dismissalPolicy: "immediate" };
};

/** Ends a card and takes it off the Lock Screen at once. */
export function endCard(
  plugin: Plugin,
  activityId: string,
  data: Record<string, string> = {}
): Promise<void> {
  const options: EndOptions = {
    activityId,
    data,
    behavior: { dismissalPolicy: "immediate" },
  };
  return plugin.endActivity(options);
}

/** The cards iOS still has for this app. The plugin types them as its
 *  start options; what it sends is `{ id, state, systemId }`, `id` being
 *  the one `endActivity` takes. */
async function cardIds(plugin: Plugin): Promise<string[]> {
  const { activities } = await plugin.getAllActivities();
  return (activities as unknown as { id?: unknown }[]).flatMap((card) =>
    typeof card.id === "string" ? [card.id] : []
  );
}

async function endEarlierCards(plugin: Plugin): Promise<void> {
  let ids: string[];
  try {
    ids = await cardIds(plugin);
  } catch {
    // Below iOS 16.2, or the widget is not in the build: none to end.
    return;
  }
  await Promise.all(
    ids.map((id) =>
      endCard(plugin, id).catch((err) => {
        logger.warn("[liveActivities] ending an earlier card failed", err);
      })
    )
  );
}

/** Test-only: forget the plugin, so the next load ends earlier cards. */
export function __resetLiveActivitiesForTests(): void {
  ready = null;
}
