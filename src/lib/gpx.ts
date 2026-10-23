import type { GPSPoint } from "./gps";

const GPX_NAMESPACES = new Set([
  null,
  "http://www.topografix.com/GPX/1/0",
  "http://www.topografix.com/GPX/1/1",
]);

/** Older Tropos exports had no namespace; keep those readable too. */
function gpxRoot(xml: string): Element | null {
  if (typeof DOMParser === "undefined" || !xml) return null;
  try {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length > 0) return null;
    const root = doc.documentElement;
    return root.localName === "gpx" && GPX_NAMESPACES.has(root.namespaceURI)
      ? root
      : null;
  } catch {
    return null;
  }
}

/** Prefixes are arbitrary. Stay in the parent's GPX namespace and hierarchy
 *  so extension elements cannot become route points, names or measurements. */
function gpxChildren(parent: Element, name: string): Element[] {
  return Array.from(parent.children).filter(
    (child) =>
      child.localName === name && child.namespaceURI === parent.namespaceURI
  );
}

/**
 * Parse a GPX document into the app's GPSPoint polyline — the inverse of
 * `toGPX` in gps.ts, used to import a route to follow.
 *
 * Reads `<trkpt>` track points (preferred) and falls back to `<rtept>` route
 * points. Matches namespace/local name regardless of the document's prefix,
 * and reads only the GPX track/segment/point or route/point hierarchy.
 *
 * Imported points are a PLAN, not measured fixes: accuracy is 0, speed null,
 * and timestamp comes from `<time>` when present (else 0). Only lat/lon (and
 * optional altitude) are meaningful downstream (route rendering + progress).
 * Returns [] for malformed / empty / non-GPX input — callers should surface a
 * "couldn't read that file" message rather than starting an empty route.
 */
export function parseGpx(xml: string): GPSPoint[] {
  const root = gpxRoot(xml);
  if (!root) return [];

  const trkpts = gpxChildren(root, "trk").flatMap((track) =>
    gpxChildren(track, "trkseg").flatMap((segment) =>
      gpxChildren(segment, "trkpt")
    )
  );
  const nodes =
    trkpts.length > 0
      ? trkpts
      : gpxChildren(root, "rte").flatMap((route) =>
          gpxChildren(route, "rtept")
        );

  const points: GPSPoint[] = [];
  let previousSegment: Element | null = null;
  for (const node of nodes) {
    const lat = parseFloat(node.getAttribute("lat") ?? "");
    const lon = parseFloat(node.getAttribute("lon") ?? "");
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;

    const eleText = gpxChildren(node, "ele")[0]?.textContent ?? "";
    const altitude = parseFloat(eleText);
    const timeText = gpxChildren(node, "time")[0]?.textContent ?? "";
    const t = timeText ? Date.parse(timeText) : NaN;

    const segment = node.parentElement;
    points.push({
      ...(points.length > 0 && segment !== previousSegment
        ? { breakBefore: true }
        : {}),
      lat,
      lon,
      altitude: Number.isFinite(altitude) ? altitude : null,
      accuracy: 0,
      speed: null,
      timestamp: Number.isFinite(t) ? t : 0,
      rawLat: lat,
      rawLon: lon,
    });
    previousSegment = segment;
  }
  return points;
}

/**
 * The route's name from a GPX, preferring <trk>/<rte> name, then <metadata>.
 * Returns null when absent — callers fall back to a generic default. Used to
 * pre-fill the import preview / saved-route name.
 */
export function parseGpxName(xml: string): string | null {
  const root = gpxRoot(xml);
  if (!root) return null;
  for (const tag of ["trk", "rte", "metadata"]) {
    const parent = gpxChildren(root, tag)[0];
    const txt = parent && gpxChildren(parent, "name")[0]?.textContent?.trim();
    if (txt) return txt;
  }
  return null;
}
