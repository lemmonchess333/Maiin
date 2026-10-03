/**
 * A saved run document in the shape `RunSummary` writes it.
 *
 * Every saved run carries `completedAt` (a Timestamp, the instant it was
 * saved) and `date` (the local "YYYY-MM-DD" it STARTED, Lift3). Readers go
 * through `src/lib/savedRuns.ts`, which windows by `completedAt`, so a
 * fixture without it is left out of every query, as Firestore leaves it
 * out. Tests that seeded `date` alone passed only while readers queried by
 * `date`; this builder keeps fixtures honest about both fields.
 *
 * Call it inside a suite that mocks `firebase/firestore` with the shared
 * fake (bare `vi.mock("firebase/firestore")`), so the Timestamp is the
 * fake's.
 */
import { Timestamp } from "firebase/firestore";

/**
 * @param day the local day the run started (`date`)
 * @param fields stored fields to set or override (distance in metres,
 *   duration in seconds, eligibility flags…)
 * @param finishedAt when it was saved; defaults to 12:30 local on `day`
 */
export function savedRunDoc(
  day: string,
  fields: Record<string, unknown> = {},
  finishedAt?: Date
): Record<string, unknown> {
  const [y, m, d] = day.split("-").map(Number);
  const completed = finishedAt ?? new Date(y, m - 1, d, 12, 30, 0);
  return {
    date: day,
    completedAt: Timestamp.fromDate(completed),
    distance: 5000,
    duration: 1800,
    avgPace: 360,
    calories: 300,
    activityType: "easy",
    ...fields,
  };
}

/**
 * A saved workout document in the shape the finish writers store it: the
 * local day it started (`date`, Lift3), its exercises, and when it was
 * saved (`createdAt`, a Timestamp). Readers go through
 * `src/lib/savedWorkouts.ts`, which windows and orders by `date`.
 *
 * @param day the local day the workout started (`date`)
 * @param fields stored fields to set or override
 * @param savedAt when it was saved; defaults to 18:00 local on `day`
 */
export function savedWorkoutDoc(
  day: string,
  fields: Record<string, unknown> = {},
  savedAt?: Date
): Record<string, unknown> {
  const [y, m, d] = day.split("-").map(Number);
  const saved = savedAt ?? new Date(y, m - 1, d, 18, 0, 0);
  return {
    date: day,
    exercises: [
      {
        exerciseId: "bench-press",
        exerciseName: "Bench Press",
        category: "chest",
        sets: [
          { setNumber: 1, reps: 5, weightKg: 80 },
          { setNumber: 2, reps: 5, weightKg: 80 },
        ],
        caloriesBurned: 0,
      },
    ],
    totalCalories: 250,
    durationMinutes: 45,
    notes: "Push — Programme Week 1",
    createdAt: Timestamp.fromDate(saved),
    source: "programme",
    ...fields,
  };
}
