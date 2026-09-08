import { haversine } from "./gps";
import type { GPSPoint } from "./gps";

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

/** A sparse GPS trace can jump across a zone without a fix inside it.
 * Check the drawn segment too, on the same local longitude/latitude plane
 * used to render it. A small radius margin avoids rounding at the edge. */
function crossesZone(a: GPSPoint, b: GPSPoint, zones: PrivacyZone[]): boolean {
  return zones.some((zone) => {
    const scale = Math.cos((zone.lat * Math.PI) / 180);
    const ax = (a.lon - zone.lon) * scale;
    const ay = a.lat - zone.lat;
    const bx = (b.lon - zone.lon) * scale;
    const by = b.lat - zone.lat;
    const dx = bx - ax,
      dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const t =
      lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
    const metres =
      ((Math.hypot(ax + t * dx, ay + t * dy) * Math.PI) / 180) * 6371000;
    return metres <= zone.radiusMeters * 1.01;
  });
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

/** Remove every zone crossing and mark the surviving disconnected segments.
 * The marker is serializable in a flat Firestore array; maps and exports must
 * split on it, never draw a chord over the removed coordinates. */
export function applyPrivacyZones(
  points: GPSPoint[],
  zones: PrivacyZone[]
): GPSPoint[] {
  if (zones.length === 0 || points.length === 0) return points;

  const inside = points.map((p) => isInsideZone(p.lat, p.lon, zones));
  const breaks = points.map(
    (point, index) =>
      index > 0 &&
      !point.breakBefore &&
      !inside[index - 1] &&
      !inside[index] &&
      crossesZone(points[index - 1], point, zones)
  );
  if (!inside.some(Boolean) && !breaks.some(Boolean)) return points;

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
    for (
      let k = Math.max(0, i - before);
      k < Math.min(points.length, j + after);
      k++
    ) {
      drop[k] = true;
    }
    i = j;
  }

  const safe: GPSPoint[] = [];
  let cut = false;
  for (let index = 0; index < points.length; index++) {
    if (drop[index]) {
      cut = true;
      continue;
    }
    const point = points[index];
    safe.push(
      (cut || breaks[index]) && safe.length > 0
        ? { ...point, breakBefore: true }
        : point
    );
    cut = false;
  }
  return safe;
}
