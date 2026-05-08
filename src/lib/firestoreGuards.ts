/**
 * Runtime type guards for Firestore document data.
 * Prevents silent crashes when Firestore schema changes.
 */

import type { DocumentData } from "firebase/firestore";

/** Safely extract a typed value with fallback */
function field<T>(data: DocumentData, key: string, fallback: T): T {
  const val = data[key];
  if (val === undefined || val === null) return fallback;
  return val as T;
}

/**
 * Parse a Firestore doc into a DailyLog-shaped object with safe defaults.
 * Prevents crashes if a field is missing or has the wrong type.
 */
export function parseDailyLog(id: string, data: DocumentData) {
  return {
    id,
    date: field(data, "date", ""),
    workouts: typeof data.workouts === "number" ? data.workouts : 0,
    meals: typeof data.meals === "number" ? data.meals : 0,
    hasPR: !!data.hasPR,
    weightKg: typeof data.weightKg === "number" ? data.weightKg : undefined,
    notes: field(data, "notes", ""),
    createdAt: data.createdAt,
  };
}

/**
 * Validate a Group-shaped doc.
 */
export function parseGroup(id: string, data: DocumentData) {
  return {
    id,
    name: field(data, "name", ""),
    description: field(data, "description", ""),
    icon: field(data, "icon", ""),
    memberCount: Math.max(0, typeof data.memberCount === "number" ? data.memberCount : 0),
    createdAt: data.createdAt,
    createdBy: field(data, "createdBy", ""),
  };
}

/**
 * Validate a Crew-shaped doc.
 */
export function parseCrew(id: string, data: DocumentData) {
  return {
    id,
    name: field(data, "name", ""),
    description: field(data, "description", ""),
    icon: field(data, "icon", ""),
    memberCount: Math.max(0, typeof data.memberCount === "number" ? data.memberCount : 0),
    leaderboardMetric: field(data, "leaderboardMetric", "workout_count"),
    type: (data.type === "default" || data.type === "custom") ? data.type : "custom" as const,
    createdAt: data.createdAt,
    createdBy: field(data, "createdBy", ""),
  };
}

/**
 * Recursively strip `undefined` values from an object before passing it
 * to Firestore. Firestore's `addDoc` / `setDoc` reject any document
 * whose payload contains an explicit `undefined` (nested or top-level)
 * with `Function addDoc() called with invalid data. Unsupported field
 * value: undefined`. JS objects with optional fields routinely produce
 * such payloads (e.g. RunSummary's `runData.intervalData` is undefined
 * for non-interval runs, `runConfig.target.value` is undefined for
 * `target.type === 'none'`).
 *
 * `null` is preserved — Firestore accepts nulls and they're a
 * meaningful signal ("explicitly cleared"). Arrays are walked but
 * their indices are preserved (we don't compact); `undefined`
 * elements stay as `null` to maintain length, mirroring how
 * Firestore stores arrays. Class instances (Timestamp, GeoPoint, etc.)
 * pass through unchanged via the `constructor` check.
 */
export function stripUndefined<T>(value: T): T {
  if (value === undefined) return null as unknown as T;
  if (value === null) return value;
  if (Array.isArray(value)) {
    return value.map((v) => (v === undefined ? null : stripUndefined(v))) as unknown as T;
  }
  if (typeof value === "object") {
    /* Pass-through for non-plain objects (Firestore Timestamp,
       Date, GeoPoint, etc.). Plain objects from `{}` literals have
       Object as their constructor; class instances do not. */
    if (value.constructor !== Object) return value;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}
