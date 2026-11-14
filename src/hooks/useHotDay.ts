import { useEffect, useState } from "react";
import { getCurrentWeather, type WeatherData } from "@/lib/weather";
import { heatLevel, type HeatLevel } from "@/lib/heatAdjustment";

/** The weather where the phone is, as the heat surfaces read it. */
export interface HotDay {
  /** "checking" while the weather is read. */
  status: "checking" | "read";
  /** The reading, or null when it could not be had. */
  weather: WeatherData | null;
  /** Hot, extreme or neither (`heatLevel`); "none" while checking. */
  level: HeatLevel;
}

/**
 * The weather for the places a run is started or looked at (the run page,
 * Home's day), and whether it is hot by the T+DP rule (heatAdjustment.ts).
 *
 * The weather is the setup strip's (`getCurrentWeather`): asked only once
 * location permission is already granted, kept ten minutes, and shared
 * between callers asking at once. A day whose weather can't be read (no
 * permission yet, no signal, the lookup failing) is not hot, so nothing
 * changes on it. Reads nothing while `enabled` is false.
 */
export function useHotDay(enabled = true): HotDay {
  const [weather, setWeather] = useState<WeatherData | null | undefined>(
    undefined
  );
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getCurrentWeather()
      .then((reading) => {
        if (!cancelled) setWeather(reading);
      })
      .catch(() => {
        if (!cancelled) setWeather(null);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  if (!enabled) return { status: "read", weather: null, level: "none" };
  if (weather === undefined)
    return { status: "checking", weather: null, level: "none" };
  return { status: "read", weather, level: heatLevel(weather) };
}
