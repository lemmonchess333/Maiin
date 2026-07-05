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
