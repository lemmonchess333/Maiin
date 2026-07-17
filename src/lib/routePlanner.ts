/**
 * Route planner core (running roadmap P2 — route planning v1).
 *
 * The builder places WAYPOINTS by tapping the map; segments between them are
 * straight lines (no external routing/snap-to-road service — deliberate v1:
 * zero API keys, works offline, and the honest "point-to-point distance"
 * label keeps the contract clear). The planned polyline saves through the
 * existing savedRoutes store (source "planned") and is followed exactly like
 * a GPX import or a re-run route.
 *
 * Pure helpers — the map component owns only gestures + rendering.
 */

import { routeTotalDistance, type GPSPoint } from "@/lib/gps";

export interface Waypoint {
  lat: number;
  lon: number;
}

/** Two waypoints closer than this (metres) count as "the loop is closed". */
export const LOOP_CLOSED_TOLERANCE_M = 25;

/** Waypoints → the GPSPoint plan shape savedRoutes/follow expect
 *  (no timestamps — same contract as coordsToPoints). */
export function waypointsToRoute(wps: Waypoint[]): GPSPoint[] {
  return wps.map((w) => ({
    lat: w.lat,
    lon: w.lon,
    altitude: null,
    accuracy: 0,
    speed: null,
    timestamp: 0,
    rawLat: w.lat,
    rawLon: w.lon,
  }));
}

/** Total straight-segment distance in metres. */
export function plannerDistanceM(wps: Waypoint[]): number {
  if (wps.length < 2) return 0;
  return routeTotalDistance(waypointsToRoute(wps));
}

/** Distance between two waypoints in metres (via the same haversine chain). */
function gapM(a: Waypoint, b: Waypoint): number {
  return plannerDistanceM([a, b]);
}

export function isLoopClosed(wps: Waypoint[]): boolean {
  if (wps.length < 3) return false;
  return gapM(wps[0], wps[wps.length - 1]) <= LOOP_CLOSED_TOLERANCE_M;
}

/**
 * Close the loop: append the start as the final waypoint. No-op when there
 * aren't at least 2 points to run between, or the loop is already closed.
 */
export function closeLoop(wps: Waypoint[]): Waypoint[] {
  if (wps.length < 2 || isLoopClosed(wps)) return wps;
  return [...wps, { ...wps[0] }];
}

/** Cap applied to provider polylines before save — live route following
 *  runs an O(n) segment sweep per GPS tick (gps.ts routeProgress), so a
 *  5,000-point Mapbox polyline costs 5,000 projections every second of a
 *  multi-hour run. 1,000 points keeps segments ≤ ~10 m for typical
 *  planner distances (a 42.2 km worst case is ~42 m — still well inside
 *  the off-route threshold). */
export const MAX_FOLLOW_POINTS = 1000;

/**
 * Distance-based thinning: keep points at least (total/maxPoints) apart,
 * always preserving the first and last. Returns the input untouched when
 * it's already within budget — for typical 3–10 km road routes the
 * provider geometry is under the cap and this is a no-op.
 */
export function downsampleRoute(
  wps: Waypoint[],
  maxPoints: number = MAX_FOLLOW_POINTS
): Waypoint[] {
  if (wps.length <= maxPoints || maxPoints < 2) return wps;
  const totalM = plannerDistanceM(wps);
  if (totalM <= 0) return wps.slice(0, maxPoints);
  const spacingM = totalM / (maxPoints - 1);
  const kept: Waypoint[] = [wps[0]];
  let sinceKeptM = 0;
  for (let i = 1; i < wps.length - 1; i++) {
    sinceKeptM += gapM(wps[i - 1], wps[i]);
    if (sinceKeptM >= spacingM) {
      kept.push(wps[i]);
      sinceKeptM = 0;
    }
  }
  // The endpoint is always kept; if the budget is already spent, it
  // replaces the last thinned point rather than overflowing maxPoints.
  const last = wps[wps.length - 1];
  if (kept.length >= maxPoints) kept[maxPoints - 1] = last;
  else kept.push(last);
  return kept;
}
