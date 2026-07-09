export function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Initial great-circle bearing point 1 → point 2, in degrees clockwise from
 * north (0–360). Used for the back-to-start direction arrow and heading.
 */
export function bearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export interface RouteProgress {
  /** Perpendicular distance (m) from the position to the nearest route point. */
  offRouteMeters: number;
  /** Distance (m) along the route to the nearest point (how far you've got). */
  coveredMeters: number;
  /** Route distance (m) still ahead. */
  remainingMeters: number;
  /** Total route length (m). */
  totalMeters: number;
  /** coveredMeters / totalMeters, 0..1. */
  fraction: number;
}

/** Total length of a route polyline in metres. */
export function routeTotalDistance(route: GPSPoint[]): number {
  let total = 0;
  for (let i = 1; i < route.length; i++) {
    total += haversine(
      route[i - 1].lat,
      route[i - 1].lon,
      route[i].lat,
      route[i].lon
    );
  }
  return total;
}

/**
 * Progress of a position against a target route: how far off the line you are,
 * how much you've covered, and how much remains. Used by the follow-a-route
 * guidance (off-route alert + distance remaining).
 *
 * Uses a local equirectangular projection (metres) anchored at the route's
 * first point for the point-to-segment maths — accurate at running scale
 * (sub-metre over a few km), and far cheaper than per-segment haversine.
 * Returns null for a degenerate route (<2 points).
 */
export function routeProgress(
  route: GPSPoint[],
  lat: number,
  lon: number
): RouteProgress | null {
  if (route.length < 2) return null;

  const lat0 = (route[0].lat * Math.PI) / 180;
  const mPerLat = 110540;
  const mPerLon = 111320 * Math.cos(lat0);
  const px = lon * mPerLon;
  const py = lat * mPerLat;

  let best = Infinity;
  let bestCovered = 0;
  let cum = 0;
  for (let i = 1; i < route.length; i++) {
    const ax = route[i - 1].lon * mPerLon;
    const ay = route[i - 1].lat * mPerLat;
    const bx = route[i].lon * mPerLon;
    const by = route[i].lat * mPerLat;
    const dx = bx - ax;
    const dy = by - ay;
    const segLen2 = dx * dx + dy * dy;
    const t =
      segLen2 > 0
        ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / segLen2))
        : 0;
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const d = Math.hypot(px - cx, py - cy);
    const segLen = Math.sqrt(segLen2);
    if (d < best) {
      best = d;
      bestCovered = cum + t * segLen;
    }
    cum += segLen;
  }

  const totalMeters = cum;
  return {
    offRouteMeters: best,
    coveredMeters: bestCovered,
    remainingMeters: Math.max(0, totalMeters - bestCovered),
    totalMeters,
    fraction: totalMeters > 0 ? bestCovered / totalMeters : 0,
  };
}

/**
 * Elapsed time (seconds) the route's original recording took to reach a given
 * distance along it — the "ghost" lookup for vs-last-time pacing when
 * re-running a past run. Interpolates between the bracketing fixes' timestamps.
 *
 * Returns null when the route carries no real timestamps (e.g. a GPX import
 * without <time>, where every timestamp is 0), so callers hide the ghost rather
 * than show a bogus delta. Beyond the route end, returns the full original time.
 */
export function routeTimeAtDistance(
  route: GPSPoint[],
  meters: number
): number | null {
  if (route.length < 2) return null;
  const t0 = route[0].timestamp;
  if (!t0) return null;

  let cum = 0;
  for (let i = 1; i < route.length; i++) {
    const seg = haversine(
      route[i - 1].lat,
      route[i - 1].lon,
      route[i].lat,
      route[i].lon
    );
    if (cum + seg >= meters) {
      const tA = route[i - 1].timestamp;
      const tB = route[i].timestamp;
      if (!tA || !tB) return null;
      const frac = seg > 0 ? (meters - cum) / seg : 0;
      const interp = tA + (tB - tA) * frac;
      return Math.max(0, (interp - t0) / 1000);
    }
    cum += seg;
  }

  const tLast = route[route.length - 1].timestamp;
  if (!tLast) return null;
  return Math.max(0, (tLast - t0) / 1000);
}

export class KalmanFilter {
  private lat = 0;
  private lon = 0;
  private variance = -1;
  private processNoise: number;

  constructor(processNoise = 3) {
    this.processNoise = processNoise;
  }

  process(
    lat: number,
    lon: number,
    accuracy: number
  ): { lat: number; lon: number } {
    if (this.variance < 0) {
      this.lat = lat;
      this.lon = lon;
      this.variance = accuracy * accuracy;
    } else {
      this.variance += this.processNoise;
      const k = this.variance / (this.variance + accuracy * accuracy);
      this.lat += k * (lat - this.lat);
      this.lon += k * (lon - this.lon);
      this.variance *= 1 - k;
    }
    return { lat: this.lat, lon: this.lon };
  }

  reset() {
    this.variance = -1;
  }
}

export interface GPSPoint {
  lat: number;
  lon: number;
  altitude: number | null;
  accuracy: number;
  speed: number | null;
  timestamp: number;
  rawLat: number;
  rawLon: number;
}

export interface Split {
  km: number;
  time: number;
  pace: string;
  paceSeconds: number;
  elevationGain: number;
  elevationLoss: number;
}

export function isValidReading(
  coords: GeolocationCoordinates,
  lastPoint: GPSPoint | null,
  elapsedSeconds?: number
): boolean {
  // First point (no lastPoint): accept up to 150m accuracy to avoid stuck acquiring phase
  if (!lastPoint) {
    return coords.accuracy <= 150;
  }

  const maxAccuracy =
    elapsedSeconds !== undefined && elapsedSeconds < 15 ? 50 : 35;
  if (coords.accuracy > maxAccuracy) return false;

  const dist = haversine(
    lastPoint.lat,
    lastPoint.lon,
    coords.latitude,
    coords.longitude
  );
  const timeDiff = (Date.now() - lastPoint.timestamp) / 1000;
  if (timeDiff <= 0) return false;
  const impliedSpeed = dist / timeDiff;
  if (impliedSpeed > 12) return false;
  if (dist < 1) return false;
  return true;
}

export function calculatePace(
  distanceMeters: number,
  timeSeconds: number
): string {
  if (distanceMeters < 10) return "--:--";
  const paceSecsPerKm = (timeSeconds / distanceMeters) * 1000;
  const mins = Math.floor(paceSecsPerKm / 60);
  const secs = Math.floor(paceSecsPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Pace over the last `windowSeconds` of GPS points. Returns the same
 * "M:SS" format as `calculatePace` so the consumer can drop it into
 * the same UI slot.
 *
 * The all-time average pace `calculatePace(distance, elapsed)` lags
 * badly mid-run — once you've banked 3km at 5:00/km, a 4:00/km fourth
 * km only nudges the average. The rolling window answers "what am I
 * doing right now" instead, which is what runners actually want on
 * the live screen. The full-run average still drives the saved record.
 *
 * Returns '--:--' when there's not enough data (need ≥10m AND ≥5s
 * within the window) — same convention as `calculatePace`.
 */
export function rollingPace(
  points: GPSPoint[],
  windowSeconds: number = 30
): string {
  if (points.length < 2) return "--:--";
  const now = points[points.length - 1].timestamp;
  const windowMs = windowSeconds * 1000;
  /* Find the first point within the rolling window. Points are kept
     in chronological order by useGPS so a linear scan from the start
     is fine; the array is also bounded by the run duration. */
  const startIdx = points.findIndex((p) => now - p.timestamp <= windowMs);
  if (startIdx === -1 || startIdx === points.length - 1) return "--:--";

  let dist = 0;
  for (let i = startIdx + 1; i < points.length; i++) {
    dist += haversine(
      points[i - 1].lat,
      points[i - 1].lon,
      points[i].lat,
      points[i].lon
    );
  }
  const elapsedSec = (now - points[startIdx].timestamp) / 1000;

  if (dist < 10 || elapsedSec < 5) return "--:--";

  const paceSecsPerKm = (elapsedSec / dist) * 1000;
  const mins = Math.floor(paceSecsPerKm / 60);
  const secs = Math.floor(paceSecsPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function paceAsNumber(
  distanceMeters: number,
  timeSeconds: number
): number {
  if (distanceMeters < 10) return 0;
  return (timeSeconds / distanceMeters) * 1000;
}

export function calculateSplits(points: GPSPoint[]): Split[] {
  if (points.length < 2) return [];
  const splits: Split[] = [];
  let accDistance = 0;
  let splitStartTime = points[0].timestamp;
  let splitStartIdx = 0;
  let currentKm = 1;

  for (let i = 1; i < points.length; i++) {
    const segStart = accDistance;
    const segDist = haversine(
      points[i - 1].lat,
      points[i - 1].lon,
      points[i].lat,
      points[i].lon
    );
    accDistance += segDist;
    const segStartTime = points[i - 1].timestamp;
    const segEndTime = points[i].timestamp;
    // A single GPS segment can cross multiple km thresholds (signal drop +
    // reappear with a multi-km jump). Distribute THIS segment's time
    // proportionally across each km boundary it crosses — interpolate the
    // timestamp at which each boundary was reached. The previous code credited
    // the whole segment time to the first km and then set splitStartTime to
    // points[i].timestamp, so the 2nd+ boundaries in the same segment computed
    // splitTime = 0 → bogus "1km in 0:00" (0:00/km pace) splits.
    while (accDistance >= currentKm * 1000) {
      const boundary = currentKm * 1000;
      const frac =
        segDist > 0
          ? Math.min(1, Math.max(0, (boundary - segStart) / segDist))
          : 1;
      const boundaryTime = segStartTime + frac * (segEndTime - segStartTime);
      const splitTime = (boundaryTime - splitStartTime) / 1000;
      let elevGain = 0;
      let elevLoss = 0;
      for (let j = splitStartIdx + 1; j <= i; j++) {
        if (points[j].altitude != null && points[j - 1].altitude != null) {
          const diff = points[j].altitude! - points[j - 1].altitude!;
          if (diff > 2) elevGain += diff;
          if (diff < -2) elevLoss += Math.abs(diff);
        }
      }
      splits.push({
        km: currentKm,
        time: splitTime,
        pace: calculatePace(1000, splitTime),
        paceSeconds: paceAsNumber(1000, splitTime),
        elevationGain: Math.round(elevGain),
        elevationLoss: Math.round(elevLoss),
      });
      splitStartTime = boundaryTime;
      splitStartIdx = i;
      currentKm++;
    }
  }

  return splits;
}

export function totalElevationGain(points: GPSPoint[]): number {
  let gain = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].altitude != null && points[i - 1].altitude != null) {
      const diff = points[i].altitude! - points[i - 1].altitude!;
      if (diff > 2) gain += diff;
    }
  }
  return Math.round(gain);
}

export function totalDistance(points: GPSPoint[]): number {
  let dist = 0;
  for (let i = 1; i < points.length; i++) {
    dist += haversine(
      points[i - 1].lat,
      points[i - 1].lon,
      points[i].lat,
      points[i].lon
    );
  }
  return dist;
}

export function detectBestEfforts(
  points: GPSPoint[],
  totalDistance: number
): { distance: number; time: number; label: string }[] {
  const efforts = [
    { target: 1000, label: "1K" },
    { target: 5000, label: "5K" },
    { target: 10000, label: "10K" },
  ];
  const results: { distance: number; time: number; label: string }[] = [];

  for (const effort of efforts) {
    if (totalDistance < effort.target) continue;
    let bestTime = Infinity;
    let startIdx = 0;
    let accDist = 0;

    for (let endIdx = 1; endIdx < points.length; endIdx++) {
      accDist += haversine(
        points[endIdx - 1].lat,
        points[endIdx - 1].lon,
        points[endIdx].lat,
        points[endIdx].lon
      );
      while (startIdx < endIdx) {
        const frontDist = haversine(
          points[startIdx].lat,
          points[startIdx].lon,
          points[startIdx + 1].lat,
          points[startIdx + 1].lon
        );
        if (accDist - frontDist >= effort.target) {
          accDist -= frontDist;
          startIdx++;
        } else break;
      }
      if (accDist >= effort.target) {
        const segTime =
          (points[endIdx].timestamp - points[startIdx].timestamp) / 1000;
        if (segTime < bestTime) bestTime = segTime;
      }
    }

    if (bestTime < Infinity)
      results.push({
        distance: effort.target,
        time: bestTime,
        label: effort.label,
      });
  }

  return results;
}

/** Escape XML metacharacters so a user-supplied run name can't produce
 *  invalid GPX (e.g. a name containing `&`, `<`, `"`). */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function toGPX(points: GPSPoint[], name: string): string {
  const trkpts = points
    .map((p) => {
      const time = new Date(p.timestamp).toISOString();
      const ele =
        p.altitude != null ? `<ele>${p.altitude.toFixed(1)}</ele>` : "";
      return `      <trkpt lat="${p.lat}" lon="${p.lon}">${ele}<time>${time}</time></trkpt>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Tropos">
  <trk><name>${escapeXml(name)}</name><trkseg>
${trkpts}
  </trkseg></trk>
</gpx>`;
}

export function estimateRunCalories(
  distanceMeters: number,
  weightKg: number
): number {
  return Math.round((distanceMeters / 1000) * weightKg * 1.036);
}
