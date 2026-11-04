/**
 * A run post's map image (Soc15 call 5): what it draws, worked out
 * without MapLibre so it can be tested in node.
 *
 * The image draws one line, the `mapLine` of the post's `RunPostRoute`:
 * the shared route (`sharedRouteTrace` in runCompletion.ts, privacy zones
 * cut and ends clipped as the post's preview is) at the map's resolution.
 * Everything here reads that line and nothing else, so the map can show
 * no point the post's preview could not.
 */
import { splitRouteSegments, type RouteCoordinate } from "@/lib/routeSegments";

export type RouteMapTheme = "light" | "dark";

/** Both images every map is made in, so the card follows the theme. */
export const ROUTE_MAP_THEMES: readonly RouteMapTheme[] = ["light", "dark"];

/**
 * The image's size in CSS pixels, 5:2: the run card draws its map in a
 * box of the same ratio (`aspect-[5/2]`, RouteMapHero.tsx), so nothing is
 * cropped and the burned-in credit stays in the corner. A phone's feed
 * card is about 360 px wide.
 */
export const ROUTE_MAP_CSS_SIZE = { width: 360, height: 144 } as const;

/** Rendered at twice its CSS size, for a phone's screen. */
export const ROUTE_MAP_PIXEL_RATIO = 2;

/** Clear ground round the route, in CSS pixels: room for the start ring
 *  and the glow at the sides, and for the credit along the bottom. */
export const ROUTE_MAP_PADDING = {
  top: 18,
  right: 22,
  bottom: 28,
  left: 22,
} as const;

/** The closest the map zooms, so a short route still shows its streets. */
export const ROUTE_MAP_MAX_ZOOM = 16;

type LonLat = [number, number];

/** The line's stretches as MapLibre takes them, [lon, lat]: a privacy
 *  zone's gap (`breakBefore`) starts a new one, so no line crosses it. A
 *  stretch of one point draws nothing and is left out. */
export function routeMapLines(line: readonly RouteCoordinate[]): LonLat[][] {
  return splitRouteSegments([...line])
    .filter((segment) => segment.length > 1)
    .map((segment) => segment.map((p): LonLat => [p.lon, p.lat]));
}

/** Where the drawn line starts and finishes: the first point of its first
 *  stretch and the last of its last. Null when there is no line. */
export function routeMapEnds(
  line: readonly RouteCoordinate[]
): { start: LonLat; finish: LonLat } | null {
  const lines = routeMapLines(line);
  if (lines.length === 0) return null;
  const last = lines[lines.length - 1];
  return { start: lines[0][0], finish: last[last.length - 1] };
}

/** The box the map is fitted to, [[west, south], [east, north]]: the
 *  drawn line's, so the camera frames only what may be shown. */
export function routeMapBounds(
  line: readonly RouteCoordinate[]
): [LonLat, LonLat] | null {
  const points = routeMapLines(line).flat();
  if (points.length === 0) return null;
  let [west, south] = points[0];
  let [east, north] = points[0];
  for (const [lon, lat] of points) {
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return [
    [west, south],
    [east, north],
  ];
}

/** A line worth a map: at least one stretch of two points. */
export function hasRouteMapLine(line: readonly RouteCoordinate[]): boolean {
  return routeMapLines(line).length > 0;
}
