import { useEffect, useRef } from "react";
import { Navigation, AlertTriangle } from "lucide-react";
import { routeProgress } from "../../lib/gps";
import type { GPSPoint } from "../../lib/gps";
import { haptic } from "../../lib/haptic";
import { THEME } from "../../lib/theme";

interface RouteFollowChipProps {
  targetRoute: GPSPoint[];
  currentPoint: GPSPoint | null;
}

/** Beyond this perpendicular distance from the route line you're "off route". */
const OFF_ROUTE_M = 35;

function fmtRemaining(metres: number): string {
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m to go`;
  return `${(metres / 1000).toFixed(1)} km to go`;
}

/**
 * Follow-a-route guidance for the live run. Shows distance remaining + percent
 * complete against the target route, and flips to an "off route" warning (with
 * a one-shot haptic on the transition) when you stray beyond OFF_ROUTE_M of the
 * line. Pairs with the faded target-route line RunMap draws.
 *
 * Visual + off-route alert only (the locked guidance level) — no turn-by-turn,
 * which would need a routing engine's turn data.
 */
export default function RouteFollowChip({
  targetRoute,
  currentPoint,
}: RouteFollowChipProps) {
  const p =
    currentPoint && targetRoute.length >= 2
      ? routeProgress(targetRoute, currentPoint.lat, currentPoint.lon)
      : null;
  const off = !!p && p.offRouteMeters > OFF_ROUTE_M;

  const wasOffRef = useRef(false);
  useEffect(() => {
    if (off && !wasOffRef.current) haptic("error");
    wasOffRef.current = off;
  }, [off]);

  if (!p) return null;
  const pct = Math.round(p.fraction * 100);

  return (
    <div
      className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-white backdrop-blur"
      style={{ background: off ? `${THEME.warning}e6` : "rgba(0,0,0,0.55)" }}
      role="status"
      aria-label={
        off
          ? `Off route by ${Math.round(p.offRouteMeters)} metres`
          : `On route, ${fmtRemaining(p.remainingMeters)}, ${pct} percent complete`
      }
    >
      {off ? (
        <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <Navigation
          className="size-3.5 shrink-0 text-running"
          aria-hidden="true"
        />
      )}
      <span
        className="font-mono font-semibold"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {off
          ? `Off route · ${Math.round(p.offRouteMeters)}m`
          : `${fmtRemaining(p.remainingMeters)} · ${pct}%`}
      </span>
    </div>
  );
}
