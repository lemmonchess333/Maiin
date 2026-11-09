/**
 * Saves the drinks the food widget's "+" queued (Wid1 call 2), once each,
 * on the app's next open.
 *
 * A widget cannot reach Firestore, so its button writes the drink to the
 * App Group with an id it makes at the tap (`HomeWidgetStore.swift`). Here
 * each one becomes an ordinary water action carrying THAT id, through the
 * same queue every tap on Home goes through (`waterActions.ts`). The id is
 * what makes it once:
 *
 *  - the action is kept on this device, under its id, before the drink is
 *    taken out of the App Group. An app stopped in between finds the drink
 *    again on its next open, queues the same id again (the same key, so
 *    still one action), and the water log's receipt for that id makes a
 *    second save a no-op (`applyWaterAction`);
 *  - a drink the queue refuses (storage full, another account signed in)
 *    stays in the App Group for the next open, so none is lost;
 *  - only the drinks read are taken out: one poured while this ran stays.
 *
 * Until it is saved, the widget adds it to the total it draws, and the
 * snapshot names the drinks its total already counts (`drinkIds`), so it
 * is never drawn twice. Firestore, the Watch and the web see it from the
 * save, which Wid1 accepts for v1.
 */
import { localDateString } from "@/lib/dateHelpers";
import { queueWater } from "@/lib/waterActions";
import { MAX_SINGLE_LOG_ML } from "@/lib/waterUnits";
import { widgetAccount } from "@/lib/homeWidgetContract";
import { readWidgetDrinks, removeWidgetDrinks } from "@/lib/homeWidgets";

let running: Promise<number> | null = null;

/**
 * Hands the widget's queued drinks to the water log, for `uid`, against
 * today's water target. How many it handed over. A second call while one
 * runs waits for it rather than reading the same drinks again.
 */
export function replayWidgetDrinks(
  uid: string,
  targetMl: number
): Promise<number> {
  running ??= replay(uid, targetMl).finally(() => {
    running = null;
  });
  return running;
}

async function replay(uid: string, targetMl: number): Promise<number> {
  const { drinks, unreadable } = await readWidgetDrinks();
  if (drinks.length === 0 && unreadable.length === 0) return 0;
  const account = widgetAccount(uid);
  const today = localDateString();
  // Taken out of the App Group at the end: what was saved, and what can
  // never be (not a drink, an amount the log refuses, another account's).
  const settled = [...unreadable];
  let saved = 0;
  for (const drink of [...drinks].sort((a, b) => a.at - b.at)) {
    const ml = Math.round(drink.ml);
    // The widget pours only against the signed-in account's snapshot, and
    // sign-out clears it: a drink tagged for another account cannot be
    // said to be this one's.
    if (drink.account !== account || !(ml > 0 && ml <= MAX_SINGLE_LOG_ML)) {
      settled.push(drink.id);
      continue;
    }
    // A drink counts on the day it was poured, as a tap on Home's card
    // does; that day keeps its own target. One dated past this clock's
    // today is today's.
    const date = drink.date > today ? today : drink.date;
    const queued = queueWater(uid, {
      id: drink.id,
      date,
      delta: ml,
      targetMl,
      ...(date !== today ? { keepTarget: true } : {}),
      queuedAt: Date.now(),
      at: drink.at,
    });
    if (!queued) break;
    settled.push(drink.id);
    saved += 1;
  }
  await removeWidgetDrinks(settled);
  return saved;
}

export function __resetWidgetDrinksForTests(): void {
  running = null;
}
