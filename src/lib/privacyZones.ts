import { haversine } from './gps';
import type { GPSPoint } from './gps';

export interface PrivacyZone {
  id: string;
  name: string;
  lat: number;
  lon: number;
  radiusMeters: number;
}

/** Check if a point falls inside any privacy zone */
function isInsideZone(lat: number, lon: number, zones: PrivacyZone[]): boolean {
  return zones.some((z) => haversine(lat, lon, z.lat, z.lon) <= z.radiusMeters);
}

/**
 * Trim GPS points that fall within privacy zones at the start and end of a route.
 * Adds ±10% random variation to trim index for additional privacy.
 */
export function applyPrivacyZones(points: GPSPoint[], zones: PrivacyZone[]): GPSPoint[] {
  if (zones.length === 0 || points.length === 0) return points;

  // Trim from start
  let startTrim = 0;
  for (let i = 0; i < points.length; i++) {
    if (isInsideZone(points[i].lat, points[i].lon, zones)) {
      startTrim = i + 1;
    } else {
      break;
    }
  }

  // Trim from end
  let endTrim = points.length;
  for (let i = points.length - 1; i >= startTrim; i--) {
    if (isInsideZone(points[i].lat, points[i].lon, zones)) {
      endTrim = i;
    } else {
      break;
    }
  }

  // Add ±10% random variation to trim indices for additional privacy
  const totalLen = endTrim - startTrim;
  if (totalLen <= 0) return [];

  const variation = Math.ceil(totalLen * 0.1);
  const randomStart = startTrim + Math.floor(Math.random() * variation);
  const randomEnd = endTrim - Math.floor(Math.random() * variation);

  if (randomStart >= randomEnd) return [];
  return points.slice(randomStart, randomEnd);
}
