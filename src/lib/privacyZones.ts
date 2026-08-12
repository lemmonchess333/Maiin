import { haversine } from './gps';
import type { GPSPoint } from './gps';

export interface PrivacyZone {
  id: string;
  name: string;
  lat: number;
  lon: number;
  radiusMeters: number;
}

/** Check if a point falls inside any privacy zone */
function isInsideZone(lat: number, lon: number, zones: PrivacyZone[]): boolean {
  return zones.some((z) => haversine(lat, lon, z.lat, z.lon) <= z.radiusMeters);
}

/** Extra points dropped either side of a cut so the surviving endpoints do
 *  not sit exactly on the zone circle. Without it an observer can fit a
 *  circle to the endpoints and recover the centre — which is the house.
 *
 *  Scaled by the ROUTE length, as the original end-trim was, not by the
 *  length of the crossing. Scaling by the crossing was the first thing
 *  written here and it silently disabled the jitter: a ten-point crossing
 *  gives `ceil(10 * 0.1) === 1`, and `floor(random() * 1)` is 0 for every
 *  value random() can return. A margin that is always zero looks like a
 *  margin in the diff and protects nothing. */
function jitterMargin(routeLength: number): number {
  const variation = Math.ceil(routeLength * 0.1);
  return Math.floor(Math.random() * variation);
}

/**
 * Remove GPS points that fall within a privacy zone — ANYWHERE in the route,
 * not only at its ends.
 *
 * This used to trim inward from the start and inward from the end, breaking
 * at the first point outside a zone. That left every interior crossing in
 * the shared route: an out-and-back past your own front door, or a loop that
 * starts at the park and passes home in the middle, published the exact home
 * coordinates. Neither of those is an edge case, and `LAUNCH_TODO.md` carried
 * the feature as "verified" while the only tests were start-trim, end-trim
 * and the empty cases — no fixture ever crossed a zone mid-route.
 *
 * The route is returned as ONE array, so removing an interior run leaves the
 * polyline drawing a straight chord across the zone. That is deliberate and
 * is the honest limit of this signature: the chord reveals that the route
 * passed through the area, but not the path taken inside it, where it
 * stopped, or which building it ended at. Rendering a true gap needs the
 * consumers to accept segments (`GPSPoint[][]`) and draw several polylines —
 * a bigger change to both call sites, and worth doing separately rather than
 * smuggling into a privacy fix.
 */
export function applyPrivacyZones(points: GPSPoint[], zones: PrivacyZone[]): GPSPoint[] {
  if (zones.length === 0 || points.length === 0) return points;

  const inside = points.map((p) => isInsideZone(p.lat, p.lon, zones));
  if (!inside.some(Boolean)) return points;

  // Drop every in-zone point, plus a jittered margin either side of each
  // contiguous run of them.
  const drop = new Array<boolean>(points.length).fill(false);
  let i = 0;
  while (i < points.length) {
    if (!inside[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < points.length && inside[j]) j++;
    const before = jitterMargin(points.length);
    const after = jitterMargin(points.length);
    for (let k = Math.max(0, i - before); k < Math.min(points.length, j + after); k++) {
      drop[k] = true;
    }
    i = j;
  }

  return points.filter((_, idx) => !drop[idx]);
}
