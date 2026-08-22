import { useEffect, useRef } from "react";
import { Navigation, AlertTriangle } from "lucide-react";
import { routeProgress } from "../../lib/gps";
import type { GPSPoint } from "../../lib/gps";
import { haptic } from "../../lib/haptic";
import { THEME } from "../../lib/theme";
import { nearDistanceLabel } from "../../lib/runLabels";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";

interface RouteFollowChipProps {
  targetRoute: GPSPoint[];
  currentPoint: GPSPoint | null;
}

/** Beyond this perpendicular distance from the route line you're "off route". */
const OFF_ROUTE_M = 35;

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
  const unit = useDistanceUnit();
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
      style={{
        /* Off-route: near-black ink on the amber chip — white on the
           warning identity is ~3.2:1 at 12px, and this is the one label
           that exists to be read at a glance mid-run. Dark-on-amber is
           the road-sign register and measures ~5.9:1. Theme-INDEPENDENT
           by design (the map, not the theme, is the surface — same rule
           as THEME.scrim), so a fixed ink, not a token. On-route keeps
           the class's white-on-scrim (inline undefined defers to it). */
        background: off ? `${THEME.warning}e6` : "rgba(0,0,0,0.55)",
        color: off ? THEME.bg : undefined,
      }}
      role="status"
      aria-label={
        off
          ? `Off route by ${Math.round(p.offRouteMeters)} metres`
          : `On route, ${nearDistanceLabel(p.remainingMeters, unit, "to go")}, ${pct} percent complete`
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
          ? `Off route · ${Math.round(p.offRouteMeters)} m`
          : `${nearDistanceLabel(p.remainingMeters, unit, "to go")} · ${pct}%`}
      </span>
    </div>
  );
}
