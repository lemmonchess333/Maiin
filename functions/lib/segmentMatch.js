"use strict";

/**
 * Matching a saved run to a segment (Run26 call 3). Pure: no Firestore.
 *
 * A run is timed over a segment when its trace, in the order it was run:
 *
 *   1. passes within ENDPOINT_TOLERANCE_M of the segment's start,
 *   2. then within ENDPOINT_TOLERANCE_M of its end, having covered between
 *      MIN_PATH_RATIO and MAX_PATH_RATIO of the segment's length on the way
 *      (so a loop whose start and end meet is not timed over a few metres,
 *      and a wander that comes back is not timed at all),
 *   3. comes within the route tolerance of every point of the segment,
 *      sampled every SAMPLE_STEP_M along it, in the segment's order: a
 *      shortcut leaves part of the segment far from the run, and a run the
 *      other way round meets the end before the start,
 *   4. and keeps every point it recorded between the two within the route
 *      tolerance of the segment: a detour inside it still matches, one
 *      beyond it does not,
 *   5. with no gap in the trace between the two (a privacy cut or a lost
 *      signal), and at a speed a runner can hold (MAX_PLAUSIBLE_SPEED_MPS).
 *
 * Each pass that does all of that is an effort, so a second lap of a loop
 * is a second effort; a pass starts no earlier than the end of the one
 * before it, less the slack at the ends (a loop's start and end sit side
 * by side). This is Tropos's rule. Strava's published rule is the same in
 * its parts that are published: the points nearest the segment's start and
 * end are used, and any deviation from the segment's route prevents a
 * match (support.strava.com, "Segment Matching Issues" and "Optimizing
 * Segment Creation").
 *
 * TIMING. An effort's time is elapsed time, the clock between the moments
 * the run was nearest the start and the end, worked out along the line
 * between the two saved points either side of each, so a thinned trace
 * still times to the metre. A stop on the way counts, as Strava's does:
 * "in a race, the clock keeps running even if you stop" (Strava support,
 * "Why is there resting time in my segment efforts").
 *
 * THE SAVED TRACE. A saved run keeps at most 500 points
 * (`KEPT_ROUTE_POINTS`), so the line between two of them cuts the corners
 * of a long run: a marathon's points are about 84 m apart, and a corner can
 * sit a third of that from the line. The route tolerance therefore grows
 * with the length of the line it is measured against (`routeTolerance`),
 * from ROUTE_TOLERANCE_M up to MAX_ROUTE_TOLERANCE_M.
 *
 * Every number here is a Tropos heuristic, chosen against the matcher's
 * tests (functions/__tests__/segmentMatch.test.js) and GPS accuracy outdoors
 * (about ±5 to ±16 m on a phone in the open and in streets).
 */

const { EARTH_RADIUS_M } = require("./segmentGeometry");

/** How close the run must come to the segment's start and its end. */
const ENDPOINT_TOLERANCE_M = 25;
/** How close the run and the segment must stay to each other between. */
const ROUTE_TOLERANCE_M = 35;
/** The most the route tolerance grows to on a thinned trace. */
const MAX_ROUTE_TOLERANCE_M = 75;
/** The share of a line's length a corner can be cut by, as tolerance. */
const CHORD_ALLOWANCE = 0.5;
/** How often along the segment the run's coverage is checked. */
const SAMPLE_STEP_M = 20;
/** The run's distance between the start and the end, against the
 *  segment's: GPS cuts corners and wobbles, a detour adds a little. */
const MIN_PATH_RATIO = 0.8;
const MAX_PATH_RATIO = 1.3;
/** Metres either side of that ratio, for the two ends' tolerance. */
const PATH_SLACK_M = 2 * ENDPOINT_TOLERANCE_M;
/** Faster than any runner holds over a segment: 43 km/h, as gps.ts. */
const MAX_PLAUSIBLE_SPEED_MPS = 12;
/** The most efforts one run records on one segment (a track session of
 *  400 m laps is 25). */
const MAX_EFFORTS_PER_RUN = 50;

/** The route tolerance against a line `chordMetres` long. */
function routeTolerance(chordMetres) {
  return Math.min(
    MAX_ROUTE_TOLERANCE_M,
    Math.max(ROUTE_TOLERANCE_M, CHORD_ALLOWANCE * chordMetres)
  );
}

/** A flat plane in metres around `origin`: accurate to well under a metre
 *  over the tens of kilometres a segment spans. */
function planeAround(origin) {
  const k = (Math.PI / 180) * EARTH_RADIUS_M;
  const cos = Math.cos((origin.lat * Math.PI) / 180);
  return (p) => ({ x: (p.lon - origin.lon) * cos * k, y: (p.lat - origin.lat) * k });
}

/** Distance from p to the line a→b, and where along it the nearest point
 *  is (0 at a, 1 at b). */
function toLine(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return { d: Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)), t };
}

function isTracePoint(p) {
  return (
    !!p &&
    typeof p.lat === "number" &&
    typeof p.lon === "number" &&
    typeof p.timestamp === "number" &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lon) &&
    Number.isFinite(p.timestamp) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lon) <= 180
  );
}

/**
 * A saved run's points as the matcher reads them: each with a position and
 * a time, in the order they were recorded. A point that can't be read is
 * left out and the next one begins a new piece, so no line is drawn across
 * it. A trace whose clock runs backwards is not matched at all (empty).
 */
function traceOf(points) {
  if (!Array.isArray(points)) return [];
  const trace = [];
  let cut = false;
  for (const p of points) {
    if (!isTracePoint(p)) {
      cut = true;
      continue;
    }
    if (trace.length > 0 && p.timestamp < trace[trace.length - 1].timestamp)
      return [];
    trace.push({
      lat: p.lat,
      lon: p.lon,
      timestamp: p.timestamp,
      breakBefore: trace.length > 0 && (cut || p.breakBefore === true),
    });
    cut = false;
  }
  return trace;
}

/** The segment's points every `step` metres along it, both ends included. */
function samplesAlong(points, step) {
  const out = [points[0]];
  let carried = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    let at = step - carried;
    while (at < length) {
      const f = at / length;
      out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
      at += step;
    }
    carried = length - (at - step);
  }
  out.push(points[points.length - 1]);
  return out;
}

/**
 * Every effort the run makes on the segment, in the order it ran them.
 *
 * @param {{ points: {lat:number, lon:number}[], lengthMeters: number }} segment
 * @param {object[]} runPoints  the saved run's `points`
 * @returns {{
 *   lap: number, startMs: number, endMs: number, elapsedSeconds: number,
 *   start: {lat:number, lon:number}, end: {lat:number, lon:number},
 *   pathMeters: number
 * }[]}
 */
function matchSegment(segment, runPoints) {
  const segPoints = segment && Array.isArray(segment.points) ? segment.points : [];
  const length = Number(segment && segment.lengthMeters);
  if (segPoints.length < 2 || !(length > 0)) return [];
  const trace = traceOf(runPoints);
  if (trace.length < 2) return [];

  const plane = planeAround(segPoints[0]);
  const seg = segPoints.map(plane);
  const segChords = [];
  for (let i = 1; i < seg.length; i++) {
    segChords.push({
      a: seg[i - 1],
      b: seg[i],
      tol: routeTolerance(Math.hypot(seg[i].x - seg[i - 1].x, seg[i].y - seg[i - 1].y)),
    });
  }
  const run = trace.map(plane);
  // chord i joins run point i to i + 1; null across a gap.
  const chords = [];
  const along = [0];
  for (let i = 0; i < run.length - 1; i++) {
    const metres = Math.hypot(run[i + 1].x - run[i].x, run[i + 1].y - run[i].y);
    chords.push(trace[i + 1].breakBefore ? null : { metres });
    along.push(along[i] + (trace[i + 1].breakBefore ? 0 : metres));
  }

  /** The passes of the run near `target`: for each stretch of lines in
   *  reach, the nearest point on it. */
  function passes(target) {
    const found = [];
    let best = null;
    for (let i = 0; i < chords.length; i++) {
      const chord = chords[i];
      const hit = chord ? toLine(target, run[i], run[i + 1]) : null;
      if (hit && hit.d <= ENDPOINT_TOLERANCE_M) {
        if (!best || hit.d < best.d) best = { chord: i, t: hit.t, d: hit.d };
      } else if (best) {
        found.push(best);
        best = null;
      }
    }
    if (best) found.push(best);
    return found.map((p) => ({
      ...p,
      at: along[p.chord] + p.t * chords[p.chord].metres,
    }));
  }

  const interpolate = (pass) => {
    const a = trace[pass.chord];
    const b = trace[pass.chord + 1];
    return {
      ms: a.timestamp + pass.t * (b.timestamp - a.timestamp),
      lat: a.lat + pass.t * (b.lat - a.lat),
      lon: a.lon + pass.t * (b.lon - a.lon),
    };
  };

  /** No gap in the trace between two passes. */
  const unbroken = (from, to) => {
    for (let i = from.chord; i <= to.chord; i++) if (!chords[i]) return false;
    return true;
  };

  const samples = samplesAlong(seg, SAMPLE_STEP_M);
  /** Every sample of the segment, in order, within reach of the run
   *  between the two passes. */
  const covered = (from, to) => {
    let at = from.chord;
    for (const sample of samples) {
      let hit = false;
      for (let i = at; i <= to.chord; i++) {
        const { d } = toLine(sample, run[i], run[i + 1]);
        if (d <= routeTolerance(chords[i].metres)) {
          at = i;
          hit = true;
          break;
        }
      }
      if (!hit) return false;
    }
    return true;
  };

  /** Every point the run recorded between the passes within reach of the
   *  segment. */
  const staysOn = (from, to) => {
    for (let k = from.chord + 1; k <= to.chord; k++) {
      const p = run[k];
      let near = false;
      for (const c of segChords) {
        if (toLine(p, c.a, c.b).d <= c.tol) {
          near = true;
          break;
        }
      }
      if (!near) return false;
    }
    return true;
  };

  const starts = passes(seg[0]);
  const ends = passes(seg[seg.length - 1]);
  const minPath = MIN_PATH_RATIO * length - PATH_SLACK_M;
  const maxPath = MAX_PATH_RATIO * length + PATH_SLACK_M;
  const efforts = [];
  let from = -Infinity;
  for (const s of starts) {
    if (efforts.length >= MAX_EFFORTS_PER_RUN) break;
    // A loop's next lap may start a few metres before the last one ended,
    // where its start and end sit side by side.
    if (s.at < from - PATH_SLACK_M) continue;
    for (const e of ends) {
      const path = e.at - s.at;
      if (path <= 0 || path < minPath) continue;
      if (path > maxPath) break;
      if (!unbroken(s, e) || !covered(s, e) || !staysOn(s, e)) continue;
      const a = interpolate(s);
      const b = interpolate(e);
      const elapsedSeconds = (b.ms - a.ms) / 1000;
      if (!(elapsedSeconds > 0)) continue;
      if (length / elapsedSeconds > MAX_PLAUSIBLE_SPEED_MPS) continue;
      efforts.push({
        lap: efforts.length + 1,
        startMs: Math.round(a.ms),
        endMs: Math.round(b.ms),
        elapsedSeconds: Math.round(elapsedSeconds),
        start: { lat: a.lat, lon: a.lon },
        end: { lat: b.lat, lon: b.lon },
        pathMeters: Math.round(path),
      });
      from = e.at;
      break;
    }
  }
  return efforts;
}

/** Whether a segment's bounding box lies inside the run's, widened by the
 *  route tolerance: a cheap test before `matchSegment`. */
function boxCouldMatch(segmentBox, runPoints) {
  if (!segmentBox) return true;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const p of runPoints) {
    if (!isTracePoint(p)) continue;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  if (!Number.isFinite(minLat)) return false;
  const margin = MAX_ROUTE_TOLERANCE_M / ((Math.PI / 180) * EARTH_RADIUS_M);
  const lonMargin = margin / Math.max(0.01, Math.cos((minLat * Math.PI) / 180));
  return (
    segmentBox.minLat >= minLat - margin &&
    segmentBox.maxLat <= maxLat + margin &&
    segmentBox.minLon >= minLon - lonMargin &&
    segmentBox.maxLon <= maxLon + lonMargin
  );
}

module.exports = {
  ENDPOINT_TOLERANCE_M,
  ROUTE_TOLERANCE_M,
  MAX_ROUTE_TOLERANCE_M,
  SAMPLE_STEP_M,
  MIN_PATH_RATIO,
  MAX_PATH_RATIO,
  MAX_PLAUSIBLE_SPEED_MPS,
  MAX_EFFORTS_PER_RUN,
  routeTolerance,
  traceOf,
  matchSegment,
  boxCouldMatch,
};
