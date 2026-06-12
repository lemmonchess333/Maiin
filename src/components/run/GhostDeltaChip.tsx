import { ChevronUp, ChevronDown, Minus } from "lucide-react";
import { routeProgress, routeTimeAtDistance } from "../../lib/gps";
import type { GPSPoint } from "../../lib/gps";
import { THEME } from "../../lib/theme";

interface GhostDeltaChipProps {
  targetRoute: GPSPoint[];
  currentPoint: GPSPoint | null;
  elapsedSec: number;
}

/** Within this many seconds of the original, call it "even" (no ahead/behind). */
const EVEN_S = 2;

function fmtDelta(sec: number): string {
  const s = Math.round(Math.abs(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * "vs last time" ghost pacing — when re-running a past run, compares your
 * current elapsed time at this point on the route against how long the original
 * took to reach the same distance (routeTimeAtDistance). Green when you're
 * ahead, coral when behind, neutral when level.
 *
 * Hidden when the route has no real timestamps (GPX without <time>) — there's
 * nothing to race against. The Strava "beat your time" affordance, no deps.
 */
export default function GhostDeltaChip({
  targetRoute,
  currentPoint,
  elapsedSec,
}: GhostDeltaChipProps) {
  if (!currentPoint || targetRoute.length < 2) return null;
  const progress = routeProgress(
    targetRoute,
    currentPoint.lat,
    currentPoint.lon
  );
  if (!progress) return null;
  const original = routeTimeAtDistance(targetRoute, progress.coveredMeters);
  if (original == null) return null;

  const delta = elapsedSec - original; // + = behind, - = ahead
  const ahead = delta < -EVEN_S;
  const behind = delta > EVEN_S;
  const color = ahead ? THEME.success : behind ? THEME.danger : undefined;

  return (
    <div
      className="flex items-center gap-1 rounded-full bg-black/55 px-3 py-1 text-xs text-white backdrop-blur"
      role="status"
      aria-label={
        ahead
          ? `${fmtDelta(delta)} ahead of your last run`
          : behind
            ? `${fmtDelta(delta)} behind your last run`
            : "Level with your last run"
      }
    >
      {ahead ? (
        <ChevronUp className="size-3.5 shrink-0" style={{ color }} aria-hidden="true" />
      ) : behind ? (
        <ChevronDown className="size-3.5 shrink-0" style={{ color }} aria-hidden="true" />
      ) : (
        <Minus className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
      )}
      <span
        className="font-mono font-semibold tabular-nums"
        style={color ? { color } : undefined}
      >
        {ahead
          ? `${fmtDelta(delta)} ahead`
          : behind
            ? `${fmtDelta(delta)} behind`
            : "On last time"}
      </span>
    </div>
  );
}
