/**
 * Saved routes — reusable run routes the user can follow again.
 *
 * Owner-only storage at users/{uid}/savedRoutes/{routeId}, mirroring the
 * savedRoutines pattern. A saved route is a snapshot of a polyline (from a GPX
 * import or a past run), stored as a flat [lon, lat, lon, lat, …] number array
 * — Firestore can't hold nested arrays, and flat numbers are the most compact
 * encoding. Downsampled to keep docs small; reconstructed into GPSPoints (a
 * plan, no timestamps) for following.
 *
 * Account deletion: "savedRoutes" is in functions USER_SUBCOLLECTIONS so these
 * docs are cleaned up with the account. Rules: firestore.rules owner-only.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { addDocGuarded } from "@/lib/firestoreWrite";
import { db } from "@/lib/firebase";
import { routeTotalDistance, type GPSPoint } from "@/lib/gps";

export type SavedRouteSource = "gpx" | "run";

export interface SavedRoute {
  id: string;
  name: string;
  distanceMeters: number;
  source: SavedRouteSource;
  /** Flat polyline: [lon0, lat0, lon1, lat1, …]. */
  coords: number[];
  createdAt?: Timestamp;
}

/** Cap on stored points — plenty of fidelity for following (≈20m spacing on a
 *  12km route) while keeping the doc well under Firestore's 1MB limit. */
export const MAX_COORDS = 600;

/**
 * Downsample a polyline to at most `max` points and flatten to [lon,lat,…].
 * Always keeps the first and last point so the route endpoints are exact.
 */
export function downsampleCoords(
  points: GPSPoint[],
  max = MAX_COORDS
): number[] {
  if (points.length === 0) return [];
  const out: number[] = [];
  if (points.length <= max) {
    for (const p of points) out.push(p.lon, p.lat);
    return out;
  }
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    const idx = Math.round(i * step);
    out.push(points[idx].lon, points[idx].lat);
  }
  return out;
}

/** Reconstruct GPSPoints (a plan — no timestamps) from a flat coords array. */
export function coordsToPoints(coords: number[]): GPSPoint[] {
  const points: GPSPoint[] = [];
  for (let i = 0; i + 1 < coords.length; i += 2) {
    const lon = coords[i];
    const lat = coords[i + 1];
    points.push({
      lat,
      lon,
      altitude: null,
      accuracy: 0,
      speed: null,
      timestamp: 0,
      rawLat: lat,
      rawLon: lon,
    });
  }
  return points;
}

export interface SaveRouteInput {
  name: string;
  points: GPSPoint[];
  source: SavedRouteSource;
}

export async function saveRoute(
  uid: string,
  input: SaveRouteInput
): Promise<string> {
  const ref = await addDocGuarded(collection(db, "users", uid, "savedRoutes"), {
    name: input.name,
    distanceMeters: Math.round(routeTotalDistance(input.points)),
    source: input.source,
    coords: downsampleCoords(input.points),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function listSavedRoutes(uid: string): Promise<SavedRoute[]> {
  const snap = await getDocs(
    query(
      collection(db, "users", uid, "savedRoutes"),
      orderBy("createdAt", "desc")
    )
  );
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<SavedRoute, "id">),
  }));
}

export async function deleteSavedRoute(
  uid: string,
  routeId: string
): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "savedRoutes", routeId));
}
