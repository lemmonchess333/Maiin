import { useCallback } from "react";
import { usePrivacyZones } from "./usePrivacyZones";
import { resolveShareRoute, shareRoute } from "@/lib/shareRoute";
import type { GPSPoint } from "@/lib/gps";
import { toast } from "@/lib/toast";

/**
 * Share a route as a .gpx with privacy zones applied — the single entry point
 * for "Share route" actions. Removes every home/work crossing via the user's privacy
 * zones (resolveShareRoute), refuses to share a route that's entirely inside a
 * zone, and toasts the outcome (silent on user-cancel).
 */
export function useShareRoute() {
  const { zones, loading, error } = usePrivacyZones();

  return useCallback(
    async (name: string, points: GPSPoint[]) => {
      if (loading || error) {
        toast.error(
          loading
            ? "Privacy settings are still loading"
            : "Couldn't check your privacy settings. Try again"
        );
        return;
      }
      const safe = resolveShareRoute(points, zones);
      if (!safe) {
        toast.error("That route is inside a privacy zone — nothing to share");
        return;
      }
      const result = await shareRoute(name, safe);
      if (result === "downloaded") toast.success("Route downloaded");
      else if (result === "failed") toast.error("Couldn't share route");
    },
    [zones, loading, error]
  );
}
