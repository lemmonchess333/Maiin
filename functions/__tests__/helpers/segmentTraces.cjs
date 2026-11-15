// Synthetic run traces for the segment tests (Run26 call 3): drawn in
// metres east and north of a point in south London and turned into the
// points a saved run keeps, a position and the time of each fix.

const ORIGIN = { lat: 51.4433, lon: -0.1517 };
const M_PER_DEG_LAT = (Math.PI / 180) * 6371000;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((ORIGIN.lat * Math.PI) / 180);
const T0 = 1_790_000_000_000;

/** A point `east` and `north` metres from the origin. */
function at(east, north) {
  return {
    lat: ORIGIN.lat + north / M_PER_DEG_LAT,
    lon: ORIGIN.lon + east / M_PER_DEG_LON,
  };
}

/**
 * A saved trace along waypoints given in metres: a point every `spacing`
 * metres at `speed` m/s, the first at `startMs`. `nudge(i, east, north)`
 * may move each point, as noise or a detour would.
 */
function trace(
  waypoints,
  { spacing = 20, speed = 4, startMs = T0, nudge } = {}
) {
  const points = [];
  let walked = 0;
  const push = (x, y, metres) =>
    points.push({
      ...at(x, y),
      timestamp: startMs + (metres / speed) * 1000,
      accuracy: 5,
      altitude: null,
      speed: null,
    });
  for (let w = 1; w < waypoints.length; w++) {
    const [ax, ay] = waypoints[w - 1];
    const [bx, by] = waypoints[w];
    const length = Math.hypot(bx - ax, by - ay);
    const first = w === 1 ? 0 : spacing - (walked % spacing || spacing);
    for (let d = first; d < length; d += spacing) {
      const f = d / length;
      let x = ax + (bx - ax) * f;
      let y = ay + (by - ay) * f;
      if (nudge) [x, y] = nudge(points.length, x, y);
      push(x, y, walked + d);
    }
    walked += length;
  }
  const [lx, ly] = waypoints[waypoints.length - 1];
  push(lx, ly, walked);
  return points;
}

/** The index of the trace's point nearest `east`, `north`. */
function nearestIndex(points, east, north) {
  const target = at(east, north);
  let best = 0;
  let bestD = Infinity;
  points.forEach((p, i) => {
    const d = Math.hypot(
      (p.lat - target.lat) * M_PER_DEG_LAT,
      (p.lon - target.lon) * M_PER_DEG_LON
    );
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** A pseudo-random number in [-1, 1), the same every run. */
function jitter(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/** A saved run document along `waypoints`, as runDocument writes one. */
function savedRun(
  waypoints,
  { date = "2026-11-10", startMs = T0, speed = 4, ...rest } = {}
) {
  const points = trace(waypoints, { startMs, speed });
  const last = points[points.length - 1];
  let metres = 0;
  for (let i = 1; i < waypoints.length; i++)
    metres += Math.hypot(
      waypoints[i][0] - waypoints[i - 1][0],
      waypoints[i][1] - waypoints[i - 1][1]
    );
  return {
    name: "Morning run",
    type: "run",
    activityType: "freerun",
    place: null,
    distance: Math.round(metres),
    duration: Math.round((last.timestamp - startMs) / 1000),
    avgPace: 250,
    date,
    completedAt: last.timestamp,
    isInvalid: false,
    savedAnyway: false,
    visibility: "followers",
    points,
    ...rest,
  };
}

module.exports = { ORIGIN, T0, at, trace, nearestIndex, jitter, savedRun };
