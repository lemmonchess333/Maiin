/**
 * Road-aware route planning — client transport (Run11, Mapbox
 * supersession 2026-07-17).
 *
 * The Mapbox token NEVER reaches the browser: both actions proxy
 * through the Pro-gated `planRunningRoute` callable, which returns
 * only route geometry + aggregate distance/duration. Gated by
 * `VITE_ROUTE_PLANNING_ENABLED` so the planner ships dark until the
 * operator provisions the secret and flips the flag (rollout doc:
 * docs/road-aware-route-planning.md).
 */
import { getFunctions, httpsCallable } from "firebase/functions";
import type { Waypoint } from "@/lib/routePlanner";

export interface RoadRoute {
  points: Waypoint[];
  distanceM: number;
  durationS: number | null;
}

export const LOOP_TARGETS_KM = [3, 5, 10, 15] as const;
export type LoopTargetKm = (typeof LOOP_TARGETS_KM)[number];

export function isRoutePlanningEnabled(): boolean {
  return import.meta.env.VITE_ROUTE_PLANNING_ENABLED === "true";
}

type PlanRequest =
  | { action: "align"; waypoints: Waypoint[] }
  | { action: "loop"; start: Waypoint; targetKm: LoopTargetKm };

const planRunningRoute = () =>
  httpsCallable<PlanRequest, RoadRoute>(getFunctions(), "planRunningRoute");

/** Connect 2–12 tapped waypoints along the walking road network. */
export async function alignRouteToRoads(
  waypoints: Waypoint[]
): Promise<RoadRoute> {
  const result = await planRunningRoute()({ action: "align", waypoints });
  return result.data;
}

/** Generate a ~targetKm walking loop from the given start point. */
export async function generateRouteLoop(
  start: Waypoint,
  targetKm: LoopTargetKm
): Promise<RoadRoute> {
  const result = await planRunningRoute()({ action: "loop", start, targetKm });
  return result.data;
}

/** Human copy for a failed plan call, without leaking raw error text. */
export function routePlanningErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null
      ? (error as { code?: string }).code
      : undefined;
  if (code === "functions/not-found")
    return "No road route found for those points.";
  if (code === "functions/resource-exhausted")
    return "Too many route requests — give it a few minutes.";
  if (code === "functions/permission-denied")
    return "Road routing is a Pro feature.";
  return "Route planning is unavailable right now.";
}
