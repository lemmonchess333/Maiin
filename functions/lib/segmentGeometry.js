"use strict";

/**
 * Segments (Run26 call 3): the geometry the maker, the matcher and the
 * store share. Pure: no Firestore.
 *
 * A segment is a stretch of road or path, cut by a runner from one of their
 * own saved runs, that every later run is timed over. This module holds
 * what a stretch has to be to become one (`stretchOf`), how a segment is
 * stored (`segmentShape`) and the cells the matcher looks it up by
 * (`encodeGeohash`, `traceCells`).
 *
 * The app's segment maker says the same before the request goes: its copy
 * of the stretch rule and its refusals (src/lib/segments.ts) is pinned to
 * this one by src/lib/__tests__/segments.cross.test.ts.
 */

const EARTH_RADIUS_M = 6371000;

/** The shortest segment, in metres. A Tropos heuristic: long enough that
 *  the 25 m the matcher allows at each end (segmentMatch.js) is a small
 *  part of it, and a lap of a 400 m track. Strava publishes no minimum; it
 *  warns that segments under about 30 seconds match poorly. */
const MIN_SEGMENT_METRES = 400;

/** The longest segment, in metres. A Tropos heuristic: it bounds what one
 *  segment stores and what matching it costs. */
const MAX_SEGMENT_METRES = 50000;

/** The most points a segment keeps. A Tropos heuristic: a 4 km stretch
 *  keeps a point every 20 m, the spacing of a 10K's saved trace. */
const MAX_SEGMENT_POINTS = 200;

/** The longest name, in characters, as the maker's field allows. */
const SEGMENT_NAME_MAX = 60;

/** The geohash length of a segment's start cell: about 1.2 km by 0.6 km.
 *  A Tropos heuristic: a run reads only the segments that start in the
 *  cells it passes, a handful of queries for a long run. */
const START_CELL_PRECISION = 6;

const GEOHASH_ALPHABET = "0123456789bcdefghjkmnpqrstuvwxyz";

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/** Metres between two points on the sphere, as src/lib/gps.ts measures. */
function haversine(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isCoordinate(point) {
  return (
    !!point &&
    typeof point.lat === "number" &&
    typeof point.lon === "number" &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lon) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lon >= -180 &&
    point.lon <= 180
  );
}

/** Metres along a line of points, joining each to the next. */
function pathMetres(points) {
  let metres = 0;
  for (let i = 1; i < points.length; i++) {
    metres += haversine(
      points[i - 1].lat,
      points[i - 1].lon,
      points[i].lat,
      points[i].lon
    );
  }
  return metres;
}

/** The standard geohash of a point, `precision` characters long. */
function encodeGeohash(lat, lon, precision = START_CELL_PRECISION) {
  let latMin = -90;
  let latMax = 90;
  let lonMin = -180;
  let lonMax = 180;
  let hash = "";
  let bits = 0;
  let value = 0;
  let evenBit = true;
  while (hash.length < precision) {
    if (evenBit) {
      const mid = (lonMin + lonMax) / 2;
      if (lon >= mid) {
        value = value * 2 + 1;
        lonMin = mid;
      } else {
        value *= 2;
        lonMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        value = value * 2 + 1;
        latMin = mid;
      } else {
        value *= 2;
        latMax = mid;
      }
    }
    evenBit = !evenBit;
    if (++bits === 5) {
      hash += GEOHASH_ALPHABET[value];
      bits = 0;
      value = 0;
    }
  }
  return hash;
}

/** The cells a point's surroundings fall in: the point's own and those of
 *  the corners of a square `radiusM` either side of it. */
function cellsAround(lat, lon, radiusM, precision, into) {
  const dLat = (radiusM / EARTH_RADIUS_M) * (180 / Math.PI);
  const cos = Math.max(0.01, Math.cos(toRad(lat)));
  const dLon = dLat / cos;
  into.add(encodeGeohash(lat, lon, precision));
  for (const sLat of [-1, 1]) {
    for (const sLon of [-1, 1]) {
      const cLat = Math.max(-90, Math.min(90, lat + sLat * dLat));
      let cLon = lon + sLon * dLon;
      if (cLon > 180) cLon -= 360;
      if (cLon < -180) cLon += 360;
      into.add(encodeGeohash(cLat, cLon, precision));
    }
  }
}

/** How far apart the points sampled along a run are when its cells are
 *  worked out, and the longest straight line between two saved points that
 *  is sampled at all: past it the line is a gap in the trace (a tunnel, a
 *  lost signal), not a road anyone ran. Tropos heuristics. */
const CELL_SAMPLE_STEP_M = 50;
const CELL_SAMPLE_MAX_GAP_M = 2000;

/**
 * The start cells a run could pass a segment's start in: every cell within
 * `radiusM` of the line the run's points draw. The matcher reads only the
 * segments that start in one of them.
 */
function traceCells(points, radiusM, precision = START_CELL_PRECISION) {
  const cells = new Set();
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    cellsAround(p.lat, p.lon, radiusM, precision, cells);
    const next = points[i + 1];
    if (!next || next.breakBefore) continue;
    const metres = haversine(p.lat, p.lon, next.lat, next.lon);
    if (metres <= CELL_SAMPLE_STEP_M || metres > CELL_SAMPLE_MAX_GAP_M)
      continue;
    const steps = Math.ceil(metres / CELL_SAMPLE_STEP_M);
    for (let s = 1; s < steps; s++) {
      const f = s / steps;
      cellsAround(
        p.lat + (next.lat - p.lat) * f,
        p.lon + (next.lon - p.lon) * f,
        radiusM,
        precision,
        cells
      );
    }
  }
  return [...cells].sort();
}

/** At most `max` of the points, the first and last always among them,
 *  the rest evenly spaced along the list. */
function thinPoints(points, max) {
  if (points.length <= max) return points.slice();
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

function boundingBox(points) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  return { minLat, maxLat, minLon, maxLon };
}

/** What a refused stretch is told, in the app's words. */
const STRETCH_REFUSALS = Object.freeze({
  range: "Pick a start before the end.",
  gap: "A segment can’t cross a gap in the route.",
  short: `A segment needs to be at least ${MIN_SEGMENT_METRES} m.`,
  long: `A segment can be at most ${MAX_SEGMENT_METRES / 1000} km.`,
});

/**
 * The stretch of a saved run's points from `startIndex` to `endIndex`, both
 * included, as a segment would be made from it, or the reason it can't be.
 * A stretch can't cross a gap (a point that begins a new piece, after a
 * privacy cut or a lost signal) and must be between the shortest and the
 * longest segment.
 *
 * @returns {{ points: {lat:number, lon:number}[], metres: number } |
 *           { refusal: string, reason: keyof STRETCH_REFUSALS }}
 */
function stretchOf(points, startIndex, endIndex) {
  if (
    !Array.isArray(points) ||
    !Number.isInteger(startIndex) ||
    !Number.isInteger(endIndex) ||
    startIndex < 0 ||
    endIndex >= points.length ||
    endIndex <= startIndex
  ) {
    return { reason: "range", refusal: STRETCH_REFUSALS.range };
  }
  const stretch = points.slice(startIndex, endIndex + 1);
  if (!stretch.every(isCoordinate)) {
    return { reason: "gap", refusal: STRETCH_REFUSALS.gap };
  }
  if (stretch.slice(1).some((p) => p.breakBefore === true)) {
    return { reason: "gap", refusal: STRETCH_REFUSALS.gap };
  }
  const metres = pathMetres(stretch);
  if (metres < MIN_SEGMENT_METRES) {
    return { reason: "short", refusal: STRETCH_REFUSALS.short };
  }
  if (metres > MAX_SEGMENT_METRES) {
    return { reason: "long", refusal: STRETCH_REFUSALS.long };
  }
  return {
    points: stretch.map((p) => ({ lat: p.lat, lon: p.lon })),
    metres,
  };
}

/** Six decimal places: about 11 cm, finer than any fix. */
function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * The stored shape of a segment made from a stretch: its points thinned to
 * `MAX_SEGMENT_POINTS`, its length as the stretch measured it (whole
 * metres), its two ends, the cell its start lies in and its bounding box.
 */
function segmentShape(stretch) {
  const points = thinPoints(stretch.points, MAX_SEGMENT_POINTS).map((p) => ({
    lat: round6(p.lat),
    lon: round6(p.lon),
  }));
  const start = points[0];
  const end = points[points.length - 1];
  return {
    points,
    lengthMeters: Math.round(stretch.metres),
    start,
    end,
    startCell: encodeGeohash(start.lat, start.lon, START_CELL_PRECISION),
    bbox: boundingBox(points),
  };
}

module.exports = {
  EARTH_RADIUS_M,
  MIN_SEGMENT_METRES,
  MAX_SEGMENT_METRES,
  MAX_SEGMENT_POINTS,
  SEGMENT_NAME_MAX,
  START_CELL_PRECISION,
  STRETCH_REFUSALS,
  haversine,
  isCoordinate,
  pathMetres,
  encodeGeohash,
  traceCells,
  thinPoints,
  boundingBox,
  stretchOf,
  segmentShape,
};
