import { Navigation } from "lucide-react";
import { haversine, bearing } from "../../lib/gps";
import type { GPSPoint } from "../../lib/gps";

interface BackToStartChipProps {
  points: GPSPoint[];
  currentPoint: GPSPoint | null;
}

/** Distance from start below which the chip stays hidden (no point telling a
 *  runner who's basically at the start which way it is). */
const MIN_DISTANCE_M = 200;
/** Minimum movement between the last two fixes to trust a heading (m). Below
 *  this the runner is effectively stationary and GPS jitter spins the arrow. */
const MIN_HEADING_MOVE_M = 5;

function formatBack(metres: number): string {
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m to start`;
  return `${(metres / 1000).toFixed(1)} km to start`;
}

/**
 * "Back to start" navigation aid for the live run. Shows the straight-line
 * (crow-flies) distance back to where the run began, plus a direction arrow
 * pointing the way RELATIVE to the current heading (so it reads "turn this
 * way"). The arrow only appears once we have a trustworthy heading; while
 * stationary it shows distance alone rather than a misleading direction.
 *
 * Deliberately crow-flies, not a routed path — Tropos has no street-routing
 * engine, and an honest "X to start, that way" is the useful signal for the
 * lost-runner case without pretending to navigate streets.
 */
export default function BackToStartChip({
  points,
  currentPoint,
}: BackToStartChipProps) {
  if (!currentPoint || points.length < 2) return null;

  const start = points[0];
  const dist = haversine(
    currentPoint.lat,
    currentPoint.lon,
    start.lat,
    start.lon
  );
  if (dist < MIN_DISTANCE_M) return null;

  const bearingToStart = bearing(
    currentPoint.lat,
    currentPoint.lon,
    start.lat,
    start.lon
  );

  // Heading from the last two fixes, trusted only once we've actually moved.
  const prev = points[points.length - 2];
  const last = points[points.length - 1];
  const moved = haversine(prev.lat, prev.lon, last.lat, last.lon);
  const heading =
    moved > MIN_HEADING_MOVE_M
      ? bearing(prev.lat, prev.lon, last.lat, last.lon)
      : null;
  const relative = heading != null ? (bearingToStart - heading + 360) % 360 : null;

  return (
    <div
      className="flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-xs text-white/90 backdrop-blur"
      role="status"
      aria-label={`${formatBack(dist)}${
        relative != null ? `, bearing ${Math.round(relative)} degrees` : ""
      }`}
    >
      <Navigation
        className="size-3.5 shrink-0 text-running"
        aria-hidden="true"
        style={
          relative != null
            ? { transform: `rotate(${relative}deg)`, transition: "transform .3s" }
            : { opacity: 0.4 }
        }
      />
      <span
        className="font-mono font-semibold"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {formatBack(dist)}
      </span>
    </div>
  );
}
