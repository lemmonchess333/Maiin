/**
 * The Settings switch that turns Tropos's Live Activities off (Wid2 call
 * 6): Apple asks that they be easy to turn off in the app, beside the
 * system's own switch for the app in iOS Settings.
 *
 * It is this phone's, as iOS's own switch is: the Lock Screen and the
 * Dynamic Island are the device's, so it is kept on the device, not on the
 * account (`localStorageUidScoping.test.ts` lists the key with its
 * reason). On by default; off ends every card at once, and a run or lift
 * shows none until it is turned on again.
 *
 * This module holds no plugin: Settings reads and writes it without
 * loading the Live Activity code, which is loaded on a phone only when it
 * is needed.
 */
import { readString, remove, writeString } from "@/lib/localStore";
import { isNativePlatform } from "@/lib/platform";
import { logger } from "@/lib/logger";

export const LIVE_ACTIVITIES_OFF_KEY = "tropos.liveActivities.off";

const listeners = new Set<() => void>();

/** Whether the app may show a Live Activity on this phone. */
export function liveActivitiesOn(): boolean {
  return readString(LIVE_ACTIVITIES_OFF_KEY) !== "1";
}

/** Turns them on or off. Off takes every card down at once. */
export function setLiveActivitiesOn(on: boolean): void {
  if (on) remove(LIVE_ACTIVITIES_OFF_KEY);
  else writeString(LIVE_ACTIVITIES_OFF_KEY, "1");
  for (const listener of [...listeners]) listener();
  if (!on && isNativePlatform())
    void import("@/lib/liveActivities")
      .then(({ endEveryCard }) => endEveryCard())
      .catch((err) => logger.warn("[liveActivities] ending cards failed", err));
}

/** Called when the switch changes. Returns the way to stop listening. */
export function onLiveActivitiesSetting(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
