import { useEffect } from "react";
import { isNativePlatform } from "@/lib/platform";

/**
 * Watches location while the run screen is open before Start, so a tap on
 * Start usually finds the fix that starts the clock already in hand, and
 * the run starts at once (Run25 call 2, gpsStart.ts). The setup screen
 * shows the signal it finds (Mob2's Mobbin finding 7: Strava and Nike Run
 * Club show the signal before START).
 *
 * It runs `useGPS.warm` while the screen is open and the app is in front,
 * and `cool` when the screen goes or the app goes behind. It never asks
 * for permission: on the web it runs only once location is already
 * allowed, and in the app its watch asks the native plugin with permission
 * requests off. Nothing joins a trace: a warm fix only updates the signal
 * shown and the fix Start reads.
 *
 * Returns whether the screen may show the signal: true when warming is
 * allowed, false while location is undecided or refused.
 */
export function useGpsWarmup({
  active,
  permissionState,
  warm,
  cool,
}: {
  /** The run screen is open and no run has started. */
  active: boolean;
  permissionState: PermissionState | null | undefined;
  warm: () => void;
  cool: () => void;
}): boolean {
  const allowed =
    permissionState === "granted" ||
    (isNativePlatform() && permissionState !== "denied");
  const warming = active && allowed;

  useEffect(() => {
    if (!warming) return;
    const begin = () => {
      if (document.visibilityState !== "hidden") warm();
    };
    const onVisibility = () =>
      document.visibilityState === "hidden" ? cool() : begin();
    begin();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cool();
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // warm and cool are stable callbacks (useCallback in useGPS).
  }, [warming, warm, cool]);

  return allowed;
}
