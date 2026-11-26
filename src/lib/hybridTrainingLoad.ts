/**
 * Unified Hybrid Training Load — Fitness / Fatigue / Form (Banister 1975
 * impulse-response EWMA combining lifting + running, competitive roadmap P1 #6).
 *
 * Uses the exact same daily arbitrary load units (`runLoadAU`, `workoutLoadAU`)
 * as 7-day Foster monotony (`trainingMonotony.ts`) so the two load surfaces
 * never disagree.
 *
 * - Fitness (CTL): 42-day exponential moving average of combined daily load
 * - Fatigue (ATL): 7-day exponential moving average of combined daily load
 * - Form (TSB):    Fitness − Fatigue (positive = fresh, mild negative = building)
 *
 * Pure module: no React, no Firestore, no clock reads.
 */
import { addLocalDays, localDateString, parseLocalDate } from "./dateHelpers";
import { runLoadAU, workoutLoadAU } from "./trainingMonotony";
import type { Workout } from "./savedWorkouts";
import type { SavedRun } from "./savedRuns";

export const CTL_TIME_CONSTANT_DAYS = 42;
export const ATL_TIME_CONSTANT_DAYS = 7;
export const HYBRID_LOAD_WINDOW_DAYS = 84;
export const HYBRID_LOAD_MIN_ACTIVE_DAYS = 5;
export const HYBRID_LOAD_MIN_SPAN_DAYS = 14;

export type HybridFormStatus =
  "insufficient" | "fresh" | "optimal" | "building" | "overreaching";

export interface HybridTrainingLoadResult {
  status: HybridFormStatus;
  /** 42-day EWMA combined daily load (Fitness / CTL), 1 decimal. */
  fitness: number;
  /** 7-day EWMA combined daily load (Fatigue / ATL), 1 decimal. */
  fatigue: number;
  /** Fitness − Fatigue (Form / TSB), 1 decimal. */
  form: number;
  /** Change in Fitness over the last 14 days, 1 decimal. */
  fitnessDelta14d: number;
  /** Active training days in the last 42 days. */
  activeDays42d: number;
  hasLift: boolean;
  hasRun: boolean;
}

export interface ComputeHybridTrainingLoadInput {
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
  /** Local "YYYY-MM-DD" anchor for the final day of the EWMA series. */
  todayKey: string;
}

const EMPTY_RESULT: HybridTrainingLoadResult = {
  status: "insufficient",
  fitness: 0,
  fatigue: 0,
  form: 0,
  fitnessDelta14d: 0,
  activeDays42d: 0,
  hasLift: false,
  hasRun: false,
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computeHybridTrainingLoad({
  workouts,
  runs,
  todayKey,
}: ComputeHybridTrainingLoadInput): HybridTrainingLoadResult {
  const anchor = parseLocalDate(todayKey);
  if (!anchor || Number.isNaN(anchor.getTime())) return EMPTY_RESULT;

  const dayKeys: string[] = [];
  const dayLoads = new Map<string, number>();
  for (let offset = HYBRID_LOAD_WINDOW_DAYS - 1; offset >= 0; offset -= 1) {
    const key = localDateString(addLocalDays(anchor, -offset));
    dayKeys.push(key);
    dayLoads.set(key, 0);
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

  const firstActiveIndex = dayKeys.findIndex((k) => (dayLoads.get(k) ?? 0) > 0);
  if (firstActiveIndex === -1) return EMPTY_RESULT;

  const spanDays = HYBRID_LOAD_WINDOW_DAYS - firstActiveIndex;
  const recent42Start = HYBRID_LOAD_WINDOW_DAYS - CTL_TIME_CONSTANT_DAYS;
  let activeDays42d = 0;
  for (let i = recent42Start; i < HYBRID_LOAD_WINDOW_DAYS; i += 1) {
    if ((dayLoads.get(dayKeys[i]) ?? 0) > 0) activeDays42d += 1;
  }

  if (
    activeDays42d < HYBRID_LOAD_MIN_ACTIVE_DAYS ||
    spanDays < HYBRID_LOAD_MIN_SPAN_DAYS
  ) {
    return {
      ...EMPTY_RESULT,
      activeDays42d,
      hasLift,
      hasRun,
    };
  }

  const alphaCtl = 1 - Math.exp(-1 / CTL_TIME_CONSTANT_DAYS);
  const alphaAtl = 1 - Math.exp(-1 / ATL_TIME_CONSTANT_DAYS);

  let ctl = 0;
  let atl = 0;
  let ctl14dAgo = 0;
  const fourteenDaysAgoIndex = HYBRID_LOAD_WINDOW_DAYS - 1 - 14;

  for (let i = 0; i < HYBRID_LOAD_WINDOW_DAYS; i += 1) {
    const load = dayLoads.get(dayKeys[i]) ?? 0;
    ctl += (load - ctl) * alphaCtl;
    atl += (load - atl) * alphaAtl;
    if (i === fourteenDaysAgoIndex) {
      ctl14dAgo = ctl;
    }
  }

  const fitness = round1(ctl);
  const fatigue = round1(atl);
  const form = round1(ctl - atl);
  const fitnessDelta14d = round1(ctl - ctl14dAgo);

  const status: HybridFormStatus =
    form >= 5
      ? "fresh"
      : form >= -10
        ? "optimal"
        : form >= -25
          ? "building"
          : "overreaching";

  return {
    status,
    fitness,
    fatigue,
    form,
    fitnessDelta14d,
    activeDays42d,
    hasLift,
    hasRun,
  };
}
