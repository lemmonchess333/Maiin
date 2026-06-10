/**
 * Share-card route polyline engine (SOCIAL S1).
 *
 * Pure, deterministic GPS → abstract-stroke-path transforms for the RUN
 * share template. NOT a map: the default share visual is an abstract
 * route polyline (privacy + aesthetics per the S1 spec). Three composable
 * stages, each independently testable:
 *
 *   clipRouteEnds  — privacy: trim the first/last N metres of the track
 *                    so the start/finish (≈ home) isn't pinpointable.
 *   simplifyRoute  — Douglas–Peucker on a local metre-plane projection,
 *                    so a 5,000-point track strokes as a clean line and
 *                    the rasterised SVG stays small.
 *   buildRoutePath — normalise the surviving points into an SVG `d`
 *                    string fitted (aspect-preserved, Y-flipped to screen
 *                    space) inside a target box.
 *
 * No React, no DOM, no html-to-image — those live in the renderer. This
 * module is the part worth unit-testing in isolation.
 */

import { haversine, type GPSPoint } from "@/lib/gps";

/** Metres per degree of latitude (and of longitude at the equator). */
const M_PER_DEG = (Math.PI / 180) * 6371000;

/** Default privacy trim, in metres, applied to each end of the track. */
export const DEFAULT_CLIP_METERS = 200;
/** Default Douglas–Peucker tolerance, in metres. */
export const DEFAULT_SIMPLIFY_TOLERANCE_M = 8;

interface PlanePoint {
  x: number;
  y: number;
  /** index back into the source GPSPoint[] */
  i: number;
}

/**
 * Equirectangular projection to a local metre plane, centred on the
 * track's mean latitude. Good enough for a single run (a few km span);
 * the share visual is abstract, not survey-grade.
 */
function project(points: GPSPoint[]): PlanePoint[] {
  if (points.length === 0) return [];
  const lat0 =
    points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const lon0 = points[0].lon;
  const cosLat0 = Math.cos((lat0 * Math.PI) / 180);
  return points.map((p, i) => ({
    x: (p.lon - lon0) * cosLat0 * M_PER_DEG,
    y: (p.lat - lat0) * M_PER_DEG,
    i,
  }));
}

/** Perpendicular distance from `p` to the segment `a`–`b` (metres). */
function perpendicularDistance(
  p: PlanePoint,
  a: PlanePoint,
  b: PlanePoint
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Iterative Douglas–Peucker over a projected plane; returns kept points. */
function douglasPeucker(pts: PlanePoint[], tolerance: number): PlanePoint[] {
  if (pts.length < 3) return pts.slice();
  const keep = new Array<boolean>(pts.length).fill(false);
  keep[0] = true;
  keep[pts.length - 1] = true;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let maxDist = 0;
    let idx = -1;
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistance(pts[i], pts[start], pts[end]);
      if (d > maxDist) {
        maxDist = d;
        idx = i;
      }
    }
    if (maxDist > tolerance && idx !== -1) {
      keep[idx] = true;
      stack.push([start, idx], [idx, end]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * Douglas–Peucker simplification. Returns a subset of the input points
 * (endpoints always retained). Routes with ≤2 points pass through.
 */
export function simplifyRoute(
  points: GPSPoint[],
  toleranceMeters: number = DEFAULT_SIMPLIFY_TOLERANCE_M
): GPSPoint[] {
  if (points.length <= 2) return points.slice();
  const simplified = douglasPeucker(project(points), toleranceMeters);
  return simplified.map((pp) => points[pp.i]);
}

/**
 * Privacy clip: drop the leading and trailing `trimMeters` of the track
 * (cumulative haversine distance) so the start/finish location isn't
 * exposed. Self-protecting: if trimming would leave fewer than 2 points
 * (a short route), the original track is returned unclipped rather than
 * collapsing to nothing — the caller's privacy toggle can still choose
 * not to clip, but we never produce an empty path from a real run.
 */
export function clipRouteEnds(
  points: GPSPoint[],
  trimMeters: number = DEFAULT_CLIP_METERS
): GPSPoint[] {
  if (points.length < 3 || trimMeters <= 0) return points.slice();

  let acc = 0;
  let startIdx = 0;
  for (let i = 1; i < points.length; i++) {
    acc += haversine(
      points[i - 1].lat,
      points[i - 1].lon,
      points[i].lat,
      points[i].lon
    );
    if (acc >= trimMeters) {
      startIdx = i;
      break;
    }
  }

  let accEnd = 0;
  let endIdx = points.length - 1;
  for (let i = points.length - 1; i > 0; i--) {
    accEnd += haversine(
      points[i].lat,
      points[i].lon,
      points[i - 1].lat,
      points[i - 1].lon
    );
    if (accEnd >= trimMeters) {
      endIdx = i - 1;
      break;
    }
  }

  // Trim consumed the whole track (start passed end, or <2 survivors):
  // keep the real route rather than emit nothing.
  if (endIdx - startIdx < 1) return points.slice();
  return points.slice(startIdx, endIdx + 1);
}

export interface RoutePathOptions {
  /** Target box width in px (SVG user units). */
  width?: number;
  /** Target box height in px. */
  height?: number;
  /** Inner padding so the stroke isn't flush to the edge. */
  padding?: number;
  /** Apply the privacy end-clip first (S1 default: ON). */
  clip?: boolean;
  /** End-clip distance when `clip` is true. */
  trimMeters?: number;
  /** Douglas–Peucker tolerance. */
  toleranceMeters?: number;
}

export interface RoutePathResult {
  /** SVG path `d` string, or "" when there's nothing renderable. */
  d: string;
  /** Box the path was fitted into. */
  width: number;
  height: number;
  /** Number of points actually plotted (post clip + simplify). */
  pointCount: number;
}

/**
 * Full pipeline: (optional clip) → simplify → normalise to an SVG path
 * fitted inside `width`×`height` (aspect-preserved, centred, Y-flipped to
 * screen space). Returns an empty `d` when fewer than 2 points survive
 * (manual / GPS-less runs) so the renderer can fall back gracefully.
 */
export function buildRoutePath(
  points: GPSPoint[],
  opts: RoutePathOptions = {}
): RoutePathResult {
  const {
    width = 1000,
    height = 1000,
    padding = 80,
    clip = true,
    trimMeters = DEFAULT_CLIP_METERS,
    toleranceMeters = DEFAULT_SIMPLIFY_TOLERANCE_M,
  } = opts;

  const clipped = clip ? clipRouteEnds(points, trimMeters) : points.slice();
  const simplified = simplifyRoute(clipped, toleranceMeters);
  if (simplified.length < 2) {
    return { d: "", width, height, pointCount: simplified.length };
  }

  const plane = project(simplified);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of plane) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const innerW = Math.max(1, width - padding * 2);
  const innerH = Math.max(1, height - padding * 2);
  // Single scale keeps the route's true aspect ratio.
  const scale = Math.min(innerW / spanX, innerH / spanY);
  const drawnW = spanX * scale;
  const drawnH = spanY * scale;
  const offsetX = (width - drawnW) / 2;
  const offsetY = (height - drawnH) / 2;

  const coords = plane.map((p) => {
    const x = offsetX + (p.x - minX) * scale;
    // Flip Y: GPS north is +y, screen down is +y.
    const y = offsetY + (maxY - p.y) * scale;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const d = `M${coords[0]}` + coords.slice(1).map((c) => `L${c}`).join("");
  return { d, width, height, pointCount: plane.length };
}
