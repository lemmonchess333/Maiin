import { useEffect } from "react";
import { isNativePlatform } from "@/lib/platform";

/** How often the setup screen asks for a fix while it is open. */
export const GPS_WARM_INTERVAL_MS = 15_000;

/**
 * Warms the GPS while the run setup screen is open, so a tap on Start
 * usually finds a fix waiting rather than the acquiring screen (Mob2's
 * Mobbin finding 7: Strava and Nike Run Club show the signal before
 * START).
 *
 * It asks for a one-shot fix (`useGPS.preWarm`) at once and again every
 * 15 seconds while the screen is open and the app is in front, and stops
 * when the screen goes. It never asks for permission: on the web it runs
 * only once location is already allowed, and the app's one-shot asks the
 * native plugin with permission requests off. Nothing joins a trace: a
 * warm fix only updates the signal shown.
 *
 * Returns whether the screen may show the signal: true when warming is
 * allowed, false while location is undecided or refused.
 */
export function useGpsWarmup({
  active,
  permissionState,
  preWarm,
}: {
  /** The setup screen is the one showing. */
  active: boolean;
  permissionState: PermissionState | null | undefined;
  preWarm: () => void;
}): boolean {
  const allowed =
    permissionState === "granted" ||
    (isNativePlatform() && permissionState !== "denied");
  const warming = active && allowed;

  useEffect(() => {
    if (!warming) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const begin = () => {
      if (timer || document.visibilityState === "hidden") return;
      preWarm();
      timer = setInterval(preWarm, GPS_WARM_INTERVAL_MS);
    };
    const halt = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () =>
      document.visibilityState === "hidden" ? halt() : begin();
    begin();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      halt();
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // preWarm is a stable callback (useCallback in useGPS).
  }, [warming, preWarm]);

  return allowed;
}
