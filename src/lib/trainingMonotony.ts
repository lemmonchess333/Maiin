/**
 * Hybrid Training Monotony & Strain (Foster 1998, Med Sci Sports Exerc
 * 30(7): 1164–1168 — roadmap B1).
 *
 * Computes 7-day rolling daily load across BOTH lifting and running so hybrid
 * athletes can spot "grey-zone" weeks where every day carries similar strain,
 * even when total weekly volume looks normal.
 *
 * Pure module: no React, no Firestore, no clock reads.
 */
import { addLocalDays, localDateString, parseLocalDate } from "./dateHelpers";
import { workoutCircuit } from "@/features/circuit/savedCircuit";
import type { Workout } from "./savedWorkouts";
import type { SavedRun } from "./savedRuns";

/** Minimum active training days in the 7-day window before reporting monotony. */
export const MONOTONY_MIN_ACTIVE_DAYS = 4;

const HIGH_INTENSITY_RUN_TYPES = new Set([
  "tempo",
  "intervals",
  "interval",
  "threshold",
  "race",
  "speed",
  "vo2",
  "repetition",
  "fartlek",
]);

/** Arbitrary load units per working lift set (~16 sets = 40 AU ≈ 40-min easy run). */
const LOAD_PER_WORKING_SET = 2.5;

export type TrainingMonotonyStatus =
  "insufficient" | "varied" | "moderate" | "high";

export interface TrainingMonotonyResult {
  status: TrainingMonotonyStatus;
  /** Foster monotony (mean / SD across 7 days), rounded to 2 decimals. */
  monotony: number;
  /** Foster strain (weeklyLoad × monotony), rounded to nearest integer. */
  strain: number;
  /** Total 7-day arbitrary load units. */
  weeklyLoad: number;
  activeDays: number;
  hasLift: boolean;
  hasRun: boolean;
}

function runLoadAU(
  run: Pick<
    SavedRun,
    | "duration"
    | "distance"
    | "activityType"
    | "type"
    | "relativeEffort"
    | "isInvalid"
    | "savedAnyway"
  >
): number {
  if (run.isInvalid && !run.savedAnyway) return 0;
  const minutes =
    Number.isFinite(run.duration) && run.duration > 0
      ? run.duration / 60
      : Number.isFinite(run.distance) && run.distance > 0
        ? (run.distance / 1000) * 6
        : 0;
  if (minutes <= 0) return 0;

  const rawType = (run.activityType ?? run.type ?? "").trim().toLowerCase();
  const baseFactor = HIGH_INTENSITY_RUN_TYPES.has(rawType) ? 1.35 : 1.0;
  const effortFactor =
    run.relativeEffort === "harder"
      ? 1.15
      : run.relativeEffort === "easier"
        ? 0.85
        : 1.0;
  return minutes * baseFactor * effortFactor;
}

function workoutLoadAU(workout: Pick<Workout, "exercises">): number {
  const circuit = workoutCircuit(workout as Workout);
  if (circuit) {
    const mins =
      Number.isFinite(circuit.activeSeconds) && circuit.activeSeconds > 0
        ? circuit.activeSeconds / 60
        : 0;
    return mins * 1.15;
  }

  let workingSets = 0;
  let rpeSum = 0;
  let rpeCount = 0;
  for (const ex of workout.exercises ?? []) {
    if (!Array.isArray(ex.sets)) continue;
    for (const set of ex.sets) {
      if (set.type === "warmup") continue;
      workingSets += 1;
      if (typeof set.rpe === "number" && Number.isFinite(set.rpe)) {
        rpeSum += set.rpe;
        rpeCount += 1;
      }
    }
  }
  if (workingSets === 0) return 0;

  const avgRpe = rpeCount > 0 ? rpeSum / rpeCount : null;
  const rpeFactor =
    avgRpe == null ? 1.0 : avgRpe >= 9 ? 1.2 : avgRpe <= 7 ? 0.85 : 1.0;
  return workingSets * LOAD_PER_WORKING_SET * rpeFactor;
}

export interface ComputeTrainingMonotonyInput {
  workouts: readonly Pick<Workout, "date" | "exercises">[];
  runs: readonly Pick<
    SavedRun,
    | "day"
    | "date"
    | "duration"
    | "distance"
    | "activityType"
    | "type"
    | "relativeEffort"
    | "isInvalid"
    | "savedAnyway"
  >[];
  /** Local "YYYY-MM-DD" anchor for the final day of the 7-day rolling window. */
  todayKey: string;
}

export function computeTrainingMonotony({
  workouts,
  runs,
  todayKey,
}: ComputeTrainingMonotonyInput): TrainingMonotonyResult {
  const anchor = parseLocalDate(todayKey);
  if (!anchor || Number.isNaN(anchor.getTime())) {
    return {
      status: "insufficient",
      monotony: 0,
      strain: 0,
      weeklyLoad: 0,
      activeDays: 0,
      hasLift: false,
      hasRun: false,
    };
  }

  const dayLoads = new Map<string, number>();
  for (let offset = 6; offset >= 0; offset -= 1) {
    dayLoads.set(localDateString(addLocalDays(anchor, -offset)), 0);
  }

  let hasLift = false;
  let hasRun = false;

  for (const workout of workouts) {
    if (!dayLoads.has(workout.date)) continue;
    const load = workoutLoadAU(workout);
    if (load > 0) {
      hasLift = true;
      dayLoads.set(workout.date, (dayLoads.get(workout.date) ?? 0) + load);
    }
  }

  for (const run of runs) {
    const key = run.day || run.date || "";
    if (!dayLoads.has(key)) continue;
    const load = runLoadAU(run);
    if (load > 0) {
      hasRun = true;
      dayLoads.set(key, (dayLoads.get(key) ?? 0) + load);
    }
  }

  const loads = [...dayLoads.values()];
  const activeDays = loads.filter((v) => v > 0).length;
  const weeklyLoad = loads.reduce((sum, v) => sum + v, 0);

  if (activeDays < MONOTONY_MIN_ACTIVE_DAYS || weeklyLoad <= 0) {
    return {
      status: "insufficient",
      monotony: 0,
      strain: 0,
      weeklyLoad: Math.round(weeklyLoad),
      activeDays,
      hasLift,
      hasRun,
    };
  }

  const mean = weeklyLoad / 7;
  const variance = loads.reduce((sum, v) => sum + (v - mean) ** 2, 0) / 7;
  const sd = Math.sqrt(variance);
  const rawMonotony = sd < 1e-6 ? 10 : Math.min(10, mean / sd);
  const monotony = Math.round(rawMonotony * 100) / 100;
  const strain = Math.round(weeklyLoad * rawMonotony);

  const status: TrainingMonotonyStatus =
    monotony > 2.0 ? "high" : monotony >= 1.5 ? "moderate" : "varied";

  return {
    status,
    monotony,
    strain,
    weeklyLoad: Math.round(weeklyLoad),
    activeDays,
    hasLift,
    hasRun,
  };
}
