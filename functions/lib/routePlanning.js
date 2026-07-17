/**
 * Road-aware route planning — pure core (Run11, Mapbox supersession
 * 2026-07-17; see the Run11 STATUS line in the plan file).
 *
 * Two actions, both provider-backed through ONE injected fetch so the
 * whole module unit-tests without the network:
 *
 *   align  — connect 2..12 member-tapped waypoints along the walking
 *            network; returns the road polyline + aggregate distance.
 *   loop   — from one start point and a target distance (3/5/10/15 km),
 *            seed a square loop and calibrate it against the provider's
 *            actual routed distance in at most MAX_LOOP_PROVIDER_CALLS
 *            requests.
 *
 * Privacy contract: this module NEVER logs, stores, or returns anything
 * beyond route geometry + distance/duration. Callers must not log raw
 * coordinates either (the callable logs only action + failure kind).
 */

"use strict";

const MAX_ALIGN_WAYPOINTS = 12;
const MAX_GEOMETRY_POINTS = 5000;
const LOOP_TARGETS_KM = Object.freeze([3, 5, 10, 15]);
const MAX_LOOP_PROVIDER_CALLS = 4;
/** Accept a calibrated loop within ±12% of target before spending
 *  another provider call — routed distance is inherently network-quantised. */
const LOOP_TOLERANCE = 0.12;
const MIN_LOOP_KM = 1;
const MAX_LOOP_KM = 42.2; // marathon — hard ceiling per the rollout doc

class RoutePlanningError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "RoutePlanningError";
    this.code = code; // invalid-request | provider-unavailable | no-route
  }
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidWaypoint(point) {
  return (
    !!point &&
    typeof point === "object" &&
    isFiniteNumber(point.lat) &&
    isFiniteNumber(point.lon) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lon >= -180 &&
    point.lon <= 180
  );
}

/** 2..12 valid {lat, lon} waypoints or throws invalid-request. */
function validateAlignWaypoints(raw) {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > MAX_ALIGN_WAYPOINTS) {
    throw new RoutePlanningError("invalid-request", "2-12 waypoints required.");
  }
  if (!raw.every(isValidWaypoint)) {
    throw new RoutePlanningError("invalid-request", "Invalid coordinates.");
  }
  return raw.map((p) => ({ lat: p.lat, lon: p.lon }));
}

/** One valid start + an offered loop distance, or throws invalid-request. */
function validateLoopRequest(raw) {
  if (!raw || typeof raw !== "object" || !isValidWaypoint(raw.start)) {
    throw new RoutePlanningError("invalid-request", "Valid start required.");
  }
  const km = raw.targetKm;
  if (!LOOP_TARGETS_KM.includes(km)) {
    throw new RoutePlanningError("invalid-request", "Unsupported distance.");
  }
  return { start: { lat: raw.start.lat, lon: raw.start.lon }, targetKm: km };
}

/**
 * Square loop seed: start → 4 corners → start, with the square's
 * perimeter equal to perimeterKm. Offsets convert km to degrees at the
 * start's latitude; the routed (walking-network) result is what the
 * member actually receives — this seed only has to be in the right
 * neighbourhood for calibration to converge.
 */
function squareLoopSeed(start, perimeterKm) {
  const sideKm = perimeterKm / 4;
  const dLat = sideKm / 110.574;
  const cosLat = Math.cos((start.lat * Math.PI) / 180);
  // Clamp so polar-adjacent starts can't divide by ~0 into wild spans.
  const dLon = sideKm / (111.32 * Math.max(Math.abs(cosLat), 0.1));
  return [
    { lat: start.lat, lon: start.lon },
    { lat: start.lat + dLat / 2, lon: start.lon + dLon / 2 },
    { lat: start.lat + dLat, lon: start.lon - dLon / 2 },
    { lat: start.lat + dLat / 2, lon: start.lon - dLon },
    { lat: start.lat, lon: start.lon },
  ];
}

/**
 * One Directions request through the injected fetch. Returns
 * { points, distanceM, durationS } or throws provider-unavailable /
 * no-route. Never logs input coordinates.
 */
async function fetchWalkingRoute({ fetchImpl, token, waypoints }) {
  const coords = waypoints.map((p) => `${p.lon},${p.lat}`).join(";");
  const url =
    "https://api.mapbox.com/directions/v5/mapbox/walking/" +
    encodeURIComponent(coords) +
    `?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`;

  let response;
  try {
    response = await fetchImpl(url);
  } catch (_) {
    throw new RoutePlanningError("provider-unavailable", "Routing failed.");
  }
  if (!response.ok) {
    throw new RoutePlanningError(
      response.status >= 500 ? "provider-unavailable" : "no-route",
      "Routing failed."
    );
  }
  const body = await response.json();
  const route = body && Array.isArray(body.routes) ? body.routes[0] : null;
  const coordinates =
    route && route.geometry && Array.isArray(route.geometry.coordinates)
      ? route.geometry.coordinates
      : null;
  if (!coordinates || coordinates.length < 2) {
    throw new RoutePlanningError("no-route", "No route found.");
  }
  const points = coordinates
    .slice(0, MAX_GEOMETRY_POINTS)
    .filter(
      (pair) =>
        Array.isArray(pair) && isFiniteNumber(pair[0]) && isFiniteNumber(pair[1])
    )
    .map(([lon, lat]) => ({ lat, lon }));
  if (points.length < 2) {
    throw new RoutePlanningError("no-route", "No route found.");
  }
  return {
    points,
    distanceM: isFiniteNumber(route.distance) ? Math.round(route.distance) : 0,
    durationS: isFiniteNumber(route.duration)
      ? Math.round(route.duration)
      : null,
  };
}

/** Align 2..12 already-validated waypoints along the walking network. */
async function alignToRoads({ fetchImpl, token, waypoints }) {
  return fetchWalkingRoute({ fetchImpl, token, waypoints });
}

/**
 * Generate a walking loop close to targetKm from a validated request.
 * At most MAX_LOOP_PROVIDER_CALLS provider requests: seed, then rescale
 * the square by target/actual until within tolerance; returns the
 * closest attempt if the budget runs out. Perimeter scale is clamped to
 * [MIN_LOOP_KM, MAX_LOOP_KM] so calibration can never wander outside
 * the offered envelope.
 */
async function generateLoop({ fetchImpl, token, start, targetKm }) {
  let perimeterKm = targetKm;
  let best = null;
  let bestError = Infinity;

  for (let attempt = 0; attempt < MAX_LOOP_PROVIDER_CALLS; attempt++) {
    const seed = squareLoopSeed(start, perimeterKm);
    const route = await fetchWalkingRoute({ fetchImpl, token, waypoints: seed });
    const actualKm = route.distanceM / 1000;
    const error = Math.abs(actualKm - targetKm) / targetKm;
    if (error < bestError) {
      best = route;
      bestError = error;
    }
    if (error <= LOOP_TOLERANCE) break;
    if (actualKm <= 0) break;
    perimeterKm = Math.min(
      MAX_LOOP_KM,
      Math.max(MIN_LOOP_KM, perimeterKm * (targetKm / actualKm))
    );
  }

  if (!best) throw new RoutePlanningError("no-route", "No route found.");
  return best;
}

module.exports = {
  MAX_ALIGN_WAYPOINTS,
  MAX_GEOMETRY_POINTS,
  LOOP_TARGETS_KM,
  MAX_LOOP_PROVIDER_CALLS,
  RoutePlanningError,
  validateAlignWaypoints,
  validateLoopRequest,
  squareLoopSeed,
  alignToRoads,
  generateLoop,
};
