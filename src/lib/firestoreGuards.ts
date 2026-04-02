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
