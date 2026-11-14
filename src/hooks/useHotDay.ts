import { useEffect, useState } from "react";
import { getCurrentWeather } from "@/lib/weather";
import { isHotDay } from "@/lib/heatAdjustment";

/** "checking" while the weather is read, then whether it is hot. */
export type HotDay = "checking" | "hot" | "not-hot";

/**
 * Whether it is hot where the phone is, by Pgm8 (E8)'s rule (`isHotDay`,
 * heatAdjustment.ts), for the places a run is started or looked at: the
 * run page, Home's day, the setup.
 *
 * The weather is the setup strip's (`getCurrentWeather`): asked only once
 * location permission is already granted, kept ten minutes, and shared
 * between callers asking at once. A day whose weather can't be read (no
 * permission yet, no signal, the lookup failing) is not hot, so nothing
 * changes on it. Reads nothing while `enabled` is false, and says
 * "not-hot" then.
 */
export function useHotDay(enabled = true): HotDay {
  const [answer, setAnswer] = useState<Exclude<HotDay, "checking"> | null>(
    null
  );
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getCurrentWeather()
      .then((weather) => {
        if (!cancelled) setAnswer(isHotDay(weather) ? "hot" : "not-hot");
      })
      .catch(() => {
        if (!cancelled) setAnswer("not-hot");
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  if (!enabled) return "not-hot";
  return answer ?? "checking";
}
