export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export class KalmanFilter {
  private lat = 0;
  private lon = 0;
  private variance = -1;

  process(lat: number, lon: number, accuracy: number): { lat: number; lon: number } {
    if (this.variance < 0) {
      this.lat = lat;
      this.lon = lon;
      this.variance = accuracy * accuracy;
    } else {
      this.variance += 3;
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

export function isValidReading(coords: GeolocationCoordinates, lastPoint: GPSPoint | null, elapsedSeconds?: number): boolean {
  // First point (no lastPoint): accept up to 150m accuracy to avoid stuck acquiring phase
  if (!lastPoint) {
    return coords.accuracy <= 150;
  }

  const maxAccuracy = elapsedSeconds !== undefined && elapsedSeconds < 15 ? 50 : 35;
  if (coords.accuracy > maxAccuracy) return false;

  const dist = haversine(lastPoint.lat, lastPoint.lon, coords.latitude, coords.longitude);
  const timeDiff = (Date.now() - lastPoint.timestamp) / 1000;
  if (timeDiff <= 0) return false;
  const impliedSpeed = dist / timeDiff;
  if (impliedSpeed > 12) return false;
  if (dist < 1) return false;
  return true;
}

export function calculatePace(distanceMeters: number, timeSeconds: number): string {
  if (distanceMeters < 10) return '--:--';
  const paceSecsPerKm = (timeSeconds / distanceMeters) * 1000;
  const mins = Math.floor(paceSecsPerKm / 60);
  const secs = Math.floor(paceSecsPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function paceAsNumber(distanceMeters: number, timeSeconds: number): number {
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
    accDistance += haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
    if (accDistance >= currentKm * 1000) {
      const splitTime = (points[i].timestamp - splitStartTime) / 1000;
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
        paceSeconds: splitTime,
        elevationGain: Math.round(elevGain),
        elevationLoss: Math.round(elevLoss),
      });
      splitStartTime = points[i].timestamp;
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
    dist += haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
  }
  return dist;
}

export function detectBestEfforts(points: GPSPoint[], totalDistance: number): { distance: number; time: number; label: string }[] {
  const efforts = [
    { target: 1000, label: '1K' },
    { target: 5000, label: '5K' },
    { target: 10000, label: '10K' },
  ];
  const results: { distance: number; time: number; label: string }[] = [];

  for (const effort of efforts) {
    if (totalDistance < effort.target) continue;
    let bestTime = Infinity;
    let startIdx = 0;
    let accDist = 0;

    for (let endIdx = 1; endIdx < points.length; endIdx++) {
      accDist += haversine(points[endIdx - 1].lat, points[endIdx - 1].lon, points[endIdx].lat, points[endIdx].lon);
      while (startIdx < endIdx) {
        const frontDist = haversine(points[startIdx].lat, points[startIdx].lon, points[startIdx + 1].lat, points[startIdx + 1].lon);
        if (accDist - frontDist >= effort.target) {
          accDist -= frontDist;
          startIdx++;
        } else break;
      }
      if (accDist >= effort.target) {
        const segTime = (points[endIdx].timestamp - points[startIdx].timestamp) / 1000;
        if (segTime < bestTime) bestTime = segTime;
      }
    }

    if (bestTime < Infinity) results.push({ distance: effort.target, time: bestTime, label: effort.label });
  }

  return results;
}

export function toGPX(points: GPSPoint[], name: string): string {
  const trkpts = points
    .map((p) => {
      const time = new Date(p.timestamp).toISOString();
      const ele = p.altitude != null ? `<ele>${p.altitude.toFixed(1)}</ele>` : '';
      return `      <trkpt lat="${p.lat}" lon="${p.lon}">${ele}<time>${time}</time></trkpt>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Tropos">
  <trk><name>${name}</name><trkseg>
${trkpts}
  </trkseg></trk>
</gpx>`;
}

export function estimateRunCalories(distanceMeters: number, weightKg: number): number {
  return Math.round((distanceMeters / 1000) * weightKg * 1.036);
}
