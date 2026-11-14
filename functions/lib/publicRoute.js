"use strict";

/* ─────────────────────────────────────────────
   The route a run's public page draws (App1 Q51). The owner, 14 November
   2026: the run's map "with its start and finish cut off (as Strava
   does), so a stranger can't see where someone lives".

   publicPost.js reads the run behind a public post and its author's
   privacy zones with the Admin SDK and hands them here. What this returns
   is all of the route that leaves the server: every point it drops stays
   on the server, and only a point's latitude and longitude go, never its
   time, accuracy or raw fix.

   The rule, in order:
   - Only an outdoor GPS run whose post shares a route. A lift, a
     treadmill or manual run, a post whose route was withheld or never
     recorded, and a run whose zones cannot be read get none.
   - Every point inside one of the author's privacy zones goes, as on the
     phone (src/lib/privacyZones.ts), and a stretch that jumps across a
     zone with no point inside it is broken there, so no line crosses it.
   - The first and last 400 m of each piece of line that is left go,
     measured along it: the run's start and finish, and either side of a
     gap a zone leaves, so no end of the line sits on a zone's edge
     (three points on that edge draw the circle round the home).
   - What is left must be at least 1 km and at least half the run, or
     there is no map: a stub says little about the run and much about
     where it was.
   - About 400 points at most (the app's own map image draws 400), each
     to 5 decimal places, about a metre.

   The distance is the app's haversine and the treadmill and manual test
   is its isOutdoorGpsRun (src/lib/runGuards.ts); publicPost.cross.test.ts
   holds both to the app's.
   ───────────────────────────────────────────── */

/** Metres cut from each end of each piece of the line. */
const END_CUT_M = 400;
/** The shortest line drawn, in metres. */
const MIN_SHOWN_M = 1000;
/** The least of the run a line may be and still be drawn. */
const MIN_SHOWN_SHARE = 0.5;
/** About the most points sent; the app's map image draws 400
 *  (ROUTE_MAP_POINTS in src/lib/runCompletion.ts). */
const MAX_POINTS = 400;
/** A zone saved without a radius is 500 m, as the app reads one
 *  (src/hooks/usePrivacyZones.ts). */
const DEFAULT_ZONE_RADIUS_M = 500;

const EARTH_RADIUS_M = 6371000;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/** Metres between two points on the earth's surface (src/lib/gps.ts
 *  `haversine`). */
function haversine(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function metresBetween(a, b) {
  return haversine(a.lat, a.lon, b.lat, b.lon);
}

/** Whether a run was run outdoors with GPS (src/lib/runGuards.ts
 *  `isOutdoorGpsRun`): not on a treadmill, by its place or by the type a
 *  treadmill run had before the treadmill became a place, and not
 *  entered by hand. */
function isOutdoorGpsRun(run) {
  return !(
    run.place === "treadmill" ||
    run.activityType === "treadmill" ||
    run.activityType === "manual"
  );
}

function isLat(value) {
  return (
    typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 90
  );
}

function isLon(value) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= 180
  );
}

/** A stored trace as points with a flag where a new piece starts. A
 *  point that cannot be read starts a new piece after it, so no line is
 *  drawn across it. */
function traceOf(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  let gap = false;
  for (const p of raw) {
    if (!p || typeof p !== "object" || !isLat(p.lat) || !isLon(p.lon)) {
      gap = true;
      continue;
    }
    out.push({
      lat: p.lat,
      lon: p.lon,
      breakBefore: out.length > 0 && (gap || p.breakBefore === true),
    });
    gap = false;
  }
  return out;
}

/** The author's zones as numbers, or null when one cannot be read: a
 *  zone that cannot be applied is no reason to draw what it hides. */
function zonesOf(raw) {
  if (!Array.isArray(raw)) return null;
  const zones = [];
  for (const zone of raw) {
    if (!zone || !isLat(zone.lat) || !isLon(zone.lon)) return null;
    const radius =
      typeof zone.radiusMeters === "number" &&
      Number.isFinite(zone.radiusMeters) &&
      zone.radiusMeters > 0
        ? zone.radiusMeters
        : DEFAULT_ZONE_RADIUS_M;
    zones.push({ lat: zone.lat, lon: zone.lon, radiusMeters: radius });
  }
  return zones;
}

function insideZone(point, zones) {
  return zones.some(
    (zone) =>
      haversine(point.lat, point.lon, zone.lat, zone.lon) <= zone.radiusMeters
  );
}

/** A straight stretch between two fixes outside every zone that still
 *  passes through one, on the same local plane the phone uses
 *  (src/lib/privacyZones.ts `crossesZone`), with its 1% margin. */
function crossesZone(a, b, zones) {
  return zones.some((zone) => {
    const scale = Math.cos(toRad(zone.lat));
    const ax = (a.lon - zone.lon) * scale;
    const ay = a.lat - zone.lat;
    const bx = (b.lon - zone.lon) * scale;
    const by = b.lat - zone.lat;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const t =
      lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
    const metres = toRad(Math.hypot(ax + t * dx, ay + t * dy)) * EARTH_RADIUS_M;
    return metres <= zone.radiusMeters * 1.01;
  });
}

/** The trace without its zones: every point inside one goes, and the
 *  line breaks where one went or where a stretch crosses a zone. */
function withoutZones(trace, zones) {
  if (zones.length === 0) return trace;
  const out = [];
  let cut = false;
  for (const point of trace) {
    if (insideZone(point, zones)) {
      cut = true;
      continue;
    }
    const prev = out[out.length - 1];
    const crossed =
      !!prev && !cut && !point.breakBefore && crossesZone(prev, point, zones);
    out.push({
      ...point,
      breakBefore: !!prev && (cut || point.breakBefore || crossed),
    });
    cut = false;
  }
  return out;
}

function piecesOf(points) {
  const pieces = [];
  for (const point of points) {
    if (pieces.length === 0 || point.breakBefore) pieces.push([]);
    pieces[pieces.length - 1].push(point);
  }
  return pieces;
}

function lengthOf(piece) {
  let metres = 0;
  for (let i = 1; i < piece.length; i++) {
    metres += metresBetween(piece[i - 1], piece[i]);
  }
  return metres;
}

/** A piece without its first and last `metres`, measured along it: it
 *  starts at the first point that far along and ends at the last point
 *  that far from its end. Empty when nothing is left between. */
function withoutEnds(piece, metres) {
  let start = -1;
  for (let i = 1, along = 0; i < piece.length; i++) {
    along += metresBetween(piece[i - 1], piece[i]);
    if (along >= metres) {
      start = i;
      break;
    }
  }
  let end = -1;
  for (let i = piece.length - 2, along = 0; i >= 0; i--) {
    along += metresBetween(piece[i], piece[i + 1]);
    if (along >= metres) {
      end = i;
      break;
    }
  }
  return start === -1 || end - start < 1 ? [] : piece.slice(start, end + 1);
}

/** Pieces thinned to about `max` points between them, each keeping its
 *  two ends. */
function thinned(pieces, max) {
  const total = pieces.reduce((n, piece) => n + piece.length, 0);
  if (total <= max) return pieces;
  return pieces.map((piece) => {
    const count = Math.max(2, Math.floor((piece.length / total) * max));
    if (piece.length <= count) return piece;
    const step = (piece.length - 1) / (count - 1);
    return Array.from({ length: count }, (_, i) => piece[Math.round(i * step)]);
  });
}

/** About a metre: enough for a map, no more than it needs. */
function rounded(degrees) {
  return Math.round(degrees * 1e5) / 1e5;
}

/**
 * The route a public post's page may draw, or null for no map.
 *
 * @param {{
 *   post: { type?: unknown, distance?: unknown, routePreview?: unknown },
 *   run: { points?: unknown, place?: unknown, activityType?: unknown } | null,
 *   zones: unknown[] | null,
 * }} input  The post, the run it was posted from (null when it cannot be
 *   found or read) and the author's privacy zones (null when unread).
 * @returns {{ lat: number, lon: number, breakBefore?: true }[] | null}
 */
function publicRoute({ post, run, zones }) {
  if (!post || post.type !== "run") return null;
  // The author's post shares a route: none withheld, none unrecorded.
  if (!Array.isArray(post.routePreview) || post.routePreview.length < 2) {
    return null;
  }
  if (!run || typeof run !== "object" || !isOutdoorGpsRun(run)) return null;
  const known = zonesOf(zones);
  if (!known) return null;
  const trace = traceOf(run.points);
  if (trace.length < 2) return null;

  const kept = piecesOf(withoutZones(trace, known))
    .map((piece) => withoutEnds(piece, END_CUT_M))
    .filter((piece) => piece.length >= 2);
  const shown = kept.reduce((metres, piece) => metres + lengthOf(piece), 0);
  const recorded = piecesOf(trace).reduce(
    (metres, piece) => metres + lengthOf(piece),
    0
  );
  const distance =
    typeof post.distance === "number" && Number.isFinite(post.distance)
      ? post.distance
      : 0;
  const runLength = Math.max(distance, recorded);
  if (shown < MIN_SHOWN_M || shown < MIN_SHOWN_SHARE * runLength) return null;

  return thinned(kept, MAX_POINTS).flatMap((piece, n) =>
    piece.map((point, i) => ({
      lat: rounded(point.lat),
      lon: rounded(point.lon),
      ...(n > 0 && i === 0 ? { breakBefore: true } : {}),
    }))
  );
}

module.exports = {
  END_CUT_M,
  MAX_POINTS,
  MIN_SHOWN_M,
  MIN_SHOWN_SHARE,
  haversine,
  isOutdoorGpsRun,
  publicRoute,
};
