import { splitRouteSegments, type RouteCoordinate } from "@/lib/routeSegments";

/**
 * Where the run card's route scene (`RouteScene.tsx`) draws a route: the
 * trace stretched to fill one band of the drawing, its start and its
 * finish.
 *
 * The band is the whole drawing. It used to sit in the top half of a
 * taller one, leaving the bottom for the distance numeral a card lays
 * over the art. That ground was measured in the drawing's units and the
 * numeral in the page's, so it never held: the drawing scales to fit its
 * box and the numeral grows with the text size, and a route that started
 * bottom-left put its start ring on the number. The numeral now has its
 * own row under the drawing (`RouteScene`'s `footer`), so nothing in the
 * drawing can reach it at any width or text size.
 */

/** The drawing's size, in its own units. */
export const ROUTE_SCENE_VIEWBOX = { width: 200, height: 58 } as const;

/** Clear ground at each edge, wide enough for the start ring (r 3.2 with
 *  its stroke) and the widest glow stroke (7) to stay inside. */
export const ROUTE_SCENE_PAD = { x: 10, y: 6 } as const;

export interface RouteSceneGeometry {
  /** One SVG `points` string per unbroken piece of the route. */
  paths: string[];
  start: [number, number];
  finish: [number, number];
}

export function routeSceneGeometry(
  preview: RouteCoordinate[]
): RouteSceneGeometry {
  const lats = preview.map((p) => p.lat);
  const lons = preview.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const rLat = maxLat - minLat || 0.001;
  const rLon = maxLon - minLon || 0.001;
  const w = ROUTE_SCENE_VIEWBOX.width - 2 * ROUTE_SCENE_PAD.x;
  const h = ROUTE_SCENE_VIEWBOX.height - 2 * ROUTE_SCENE_PAD.y;
  const toXY = (p: { lat: number; lon: number }): [number, number] => [
    ((p.lon - minLon) / rLon) * w + ROUTE_SCENE_PAD.x,
    (1 - (p.lat - minLat) / rLat) * h + ROUTE_SCENE_PAD.y,
  ];
  return {
    paths: splitRouteSegments(preview)
      .filter((segment) => segment.length > 1)
      .map((segment) => segment.map((p) => toXY(p).join(",")).join(" ")),
    start: toXY(preview[0]),
    finish: toXY(preview[preview.length - 1]),
  };
}
