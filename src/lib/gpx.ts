import type { GPSPoint } from "./gps";

/**
 * Parse a GPX document into the app's GPSPoint polyline — the inverse of
 * `toGPX` in gps.ts, used to import a route to follow.
 *
 * Reads `<trkpt>` track points (preferred) and falls back to `<rtept>` route
 * points. Uses getElementsByTagName (not querySelector) so it matches GPX's
 * default-namespaced elements reliably across DOM implementations.
 *
 * Imported points are a PLAN, not measured fixes: accuracy is 0, speed null,
 * and timestamp comes from `<time>` when present (else 0). Only lat/lon (and
 * optional altitude) are meaningful downstream (route rendering + progress).
 * Returns [] for malformed / empty / non-GPX input — callers should surface a
 * "couldn't read that file" message rather than starting an empty route.
 */
export function parseGpx(xml: string): GPSPoint[] {
  if (typeof DOMParser === "undefined" || !xml) return [];

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, "application/xml");
  } catch {
    return [];
  }
  // A parse error yields a <parsererror> node rather than throwing.
  if (doc.getElementsByTagName("parsererror").length > 0) return [];

  const trkpts = Array.from(doc.getElementsByTagName("trkpt"));
  const nodes =
    trkpts.length > 0 ? trkpts : Array.from(doc.getElementsByTagName("rtept"));

  const points: GPSPoint[] = [];
  for (const node of nodes) {
    const lat = parseFloat(node.getAttribute("lat") ?? "");
    const lon = parseFloat(node.getAttribute("lon") ?? "");
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;

    const eleText = node.getElementsByTagName("ele")[0]?.textContent ?? "";
    const altitude = parseFloat(eleText);
    const timeText = node.getElementsByTagName("time")[0]?.textContent ?? "";
    const t = timeText ? Date.parse(timeText) : NaN;

    points.push({
      lat,
      lon,
      altitude: Number.isFinite(altitude) ? altitude : null,
      accuracy: 0,
      speed: null,
      timestamp: Number.isFinite(t) ? t : 0,
      rawLat: lat,
      rawLon: lon,
    });
  }
  return points;
}

/**
 * The route's name from a GPX, preferring <trk>/<rte> name, then <metadata>.
 * Returns null when absent — callers fall back to a generic default. Used to
 * pre-fill the import preview / saved-route name.
 */
export function parseGpxName(xml: string): string | null {
  if (typeof DOMParser === "undefined" || !xml) return null;
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, "application/xml");
  } catch {
    return null;
  }
  if (doc.getElementsByTagName("parsererror").length > 0) return null;
  for (const tag of ["trk", "rte", "metadata"]) {
    const parent = doc.getElementsByTagName(tag)[0];
    const txt = parent?.getElementsByTagName("name")[0]?.textContent?.trim();
    if (txt) return txt;
  }
  return null;
}
