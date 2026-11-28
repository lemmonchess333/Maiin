/**
 * Unified Hybrid Training Load — Fitness / Fatigue / Form (Banister 1975
 * impulse-response EWMA combining lifting + running).
 *
 * Uses the exact same daily arbitrary load units (`runLoadAU`, `workoutLoadAU`)
 * as 7-day Foster monotony (`trainingMonotony.ts`) so the two load surfaces
 * never disagree.
 *
 * - Fitness (CTL): 42-day warmup-normalized EWMA of combined daily load
 * - Fatigue (ATL): 7-day warmup-normalized EWMA of combined daily load
 * - Form (TSB):    Fitness − Fatigue (positive = fresh, mild negative = building)
 *
 * Pure module: no React, no Firestore, no clock reads.
 */
import { addLocalDays, localDateString, parseLocalDate } from "./dateHelpers";
import { runLoadAU, workoutLoadAU } from "./trainingMonotony";
import type { Workout } from "./savedWorkouts";
import type { SavedRun } from "./savedRuns";
import type { ProgramState } from "@/features/program/programTypes";

const CTL_TIME_CONSTANT_DAYS = 42;
const ATL_TIME_CONSTANT_DAYS = 7;
const HYBRID_LOAD_WINDOW_DAYS = 84;
const HYBRID_LOAD_SERIES_DAYS = 42;
const HYBRID_LOAD_MIN_ACTIVE_DAYS = 5;
const HYBRID_LOAD_MIN_SPAN_DAYS = 14;
const HYBRID_PROJECTION_HORIZON_DAYS = 14;
const HYBRID_RACE_PROJECTION_MAX_DAYS = 21;

export type HybridFormStatus =
  "insufficient" | "fresh" | "optimal" | "building" | "overreaching";

export interface HybridLoadPoint {
  date: string;
  liftLoad: number;
  runLoad: number;
  fitness: number;
  fatigue: number;
  form: number;
  projected?: boolean;
}

export interface HybridRaceProjection {
  date: string;
  fitness: number;
  fatigue: number;
  form: number;
  status: Exclude<HybridFormStatus, "insufficient">;
}

export interface HybridTrainingLoadResult {
  status: HybridFormStatus;
  /** 42-day warmup-normalized EWMA combined daily load (Fitness / CTL), 1 decimal. */
  fitness: number;
  /** 7-day warmup-normalized EWMA combined daily load (Fatigue / ATL), 1 decimal. */
  fatigue: number;
  /** Fitness − Fatigue (Form / TSB), 1 decimal. */
  form: number;
  /** Change in Fitness over the last 14 days, 1 decimal. */
  fitnessDelta14d: number;
  /** Active training days in the last 42 days. */
  activeDays42d: number;
  hasLift: boolean;
  hasRun: boolean;
  /** Daily trailing history (up to 42 days) for PMC trajectory plotting. */
  series: HybridLoadPoint[];
  /** Projected upcoming days from planned schedule / race taper (empty if no plan). */
  projectedSeries: HybridLoadPoint[];
  /** Projected race-day readiness when an upcoming race sits within 21 days. */
  raceDayProjection: HybridRaceProjection | null;
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
    | "heartRate"
  >[];
  /** Local "YYYY-MM-DD" anchor for the final day of the EWMA series. */
  todayKey: string;
  /** Optional active programme state for projecting upcoming Fitness/Fatigue/Form. */
  programState?: ProgramState | null;
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
  series: [],
  projectedSeries: [],
  raceDayProjection: null,
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function classifyForm(form: number): Exclude<HybridFormStatus, "insufficient"> {
  if (form >= 5) return "fresh";
  if (form >= -10) return "optimal";
  if (form >= -25) return "building";
  return "overreaching";
}

function estimatePlannedRunAU(typeRaw: string, templateId?: string): number {
  const type = typeRaw.trim().toLowerCase();
  if (type === "race") return 0; // Race day morning readiness precedes the race itself.
  const id = (templateId ?? "").toLowerCase();
  const minMatch = id.match(/(\d+)\s*min/);
  const kmMatch = id.match(/(\d+(?:\.\d+)?)\s*k/);
  const estMinutes = minMatch
    ? Number(minMatch[1])
    : kmMatch
      ? Number(kmMatch[1]) * 6
      : type === "long"
        ? 70
        : type === "recovery"
          ? 25
          : type === "tempo" || type === "intervals" || type === "threshold"
            ? 42
            : 35;
  const intensity =
    type === "tempo" ||
    type === "intervals" ||
    type === "threshold" ||
    type === "speed" ||
    type === "vo2"
      ? 1.35
      : type === "recovery"
        ? 0.85
        : 1.0;
  return estMinutes * intensity;
}

function estimatePlannedLiftAU(
  workout: ProgramState["workouts"][number]
): number {
  let sets = 0;
  for (const ex of workout.exercises ?? []) {
    if (Number.isFinite(ex.sets) && ex.sets > 0) sets += ex.sets;
  }
  return sets > 0 ? sets * 2.25 : 35;
}

function taperFactorForDaysOut(daysUntilRace: number | null): number {
  if (daysUntilRace === null) return 1.0;
  if (daysUntilRace <= 0) return 0;
  if (daysUntilRace <= 2) return 0.25;
  if (daysUntilRace <= 7) return 0.5;
  if (daysUntilRace <= 14) return 0.75;
  return 1.0;
}

function buildUpcomingPlanLoads(
  programState: ProgramState | null | undefined,
  anchor: Date,
  todayKey: string
): {
  days: { date: string; liftLoad: number; runLoad: number }[];
  raceDateKey: string | null;
} {
  if (!programState) return { days: [], raceDateKey: null };

  const workouts = (programState.workouts ?? []).filter((w) => !w.skipped);
  const runDays = programState.runDays ?? [];
  if (workouts.length === 0 && runDays.length === 0) {
    return { days: [], raceDateKey: null };
  }

  const rawRaceDate = programState.runPlan?.raceGoal?.targetDate ?? null;
  let raceDateKey: string | null = null;
  let daysToRace: number | null = null;
  if (rawRaceDate && rawRaceDate > todayKey) {
    const parsedRace = parseLocalDate(rawRaceDate);
    if (parsedRace && !Number.isNaN(parsedRace.getTime())) {
      const diff = Math.round(
        (parsedRace.getTime() - anchor.getTime()) / (24 * 60 * 60 * 1000)
      );
      if (diff >= 1 && diff <= HYBRID_RACE_PROJECTION_MAX_DAYS) {
        raceDateKey = rawRaceDate;
        daysToRace = diff;
      }
    }
  }

  const horizon =
    daysToRace !== null
      ? Math.max(HYBRID_PROJECTION_HORIZON_DAYS, daysToRace)
      : HYBRID_PROJECTION_HORIZON_DAYS;

  // Map recurring weekly run load by weekday (0=Sun..6=Sat), plus explicit future dates.
  const runByWeekday = new Map<number, number>();
  const runByExactDate = new Map<string, number>();
  for (const rd of runDays) {
    const au = estimatePlannedRunAU(
      String(rd.type ?? "easy"),
      rd.userOverride || rd.templateId
    );
    if (rd.date && rd.date > todayKey) {
      runByExactDate.set(rd.date, (runByExactDate.get(rd.date) ?? 0) + au);
    }
    if (
      typeof rd.dayIndex === "number" &&
      rd.dayIndex >= 0 &&
      rd.dayIndex <= 6 &&
      String(rd.type ?? "").toLowerCase() !== "race"
    ) {
      runByWeekday.set(
        rd.dayIndex,
        Math.max(runByWeekday.get(rd.dayIndex) ?? 0, au)
      );
    }
  }

  // Spread weekly lifting load evenly across typical non-overlapping days.
  const avgLiftAU =
    workouts.length > 0
      ? workouts.reduce((sum, w) => sum + estimatePlannedLiftAU(w), 0) /
        workouts.length
      : 0;
  const liftsPerWeek = Math.min(6, workouts.length);
  const liftWeekdays = new Set<number>();
  if (liftsPerWeek > 0) {
    const templates: Record<number, number[]> = {
      1: [1],
      2: [1, 4],
      3: [1, 3, 5],
      4: [1, 2, 4, 5],
      5: [1, 2, 3, 5, 6],
      6: [1, 2, 3, 4, 5, 6],
    };
    for (const d of templates[liftsPerWeek] ?? [1, 3, 5]) {
      liftWeekdays.add(d);
    }
  }

  const days: { date: string; liftLoad: number; runLoad: number }[] = [];
  for (let offset = 1; offset <= horizon; offset += 1) {
    const dt = addLocalDays(anchor, offset);
    const key = localDateString(dt);
    const weekday = dt.getDay();
    const untilRace = daysToRace !== null ? daysToRace - offset : null;
    const taper = taperFactorForDaysOut(untilRace);
    const rawRun = runByExactDate.has(key)
      ? (runByExactDate.get(key) ?? 0)
      : (runByWeekday.get(weekday) ?? 0);
    const rawLift = liftWeekdays.has(weekday) ? avgLiftAU : 0;
    days.push({
      date: key,
      liftLoad: round1(rawLift * taper),
      runLoad: round1(rawRun * taper),
    });
  }

  return { days, raceDateKey };
}

export function computeHybridTrainingLoad({
  workouts,
  runs,
  todayKey,
  programState,
}: ComputeHybridTrainingLoadInput): HybridTrainingLoadResult {
  const anchor = parseLocalDate(todayKey);
  if (!anchor || Number.isNaN(anchor.getTime())) return EMPTY_RESULT;

  const dayKeys: string[] = [];
  const liftLoads = new Map<string, number>();
  const runLoads = new Map<string, number>();
  for (let offset = HYBRID_LOAD_WINDOW_DAYS - 1; offset >= 0; offset -= 1) {
    const key = localDateString(addLocalDays(anchor, -offset));
    dayKeys.push(key);
    liftLoads.set(key, 0);
    runLoads.set(key, 0);
  }

  let hasLift = false;
  let hasRun = false;

  for (const workout of workouts) {
    if (!liftLoads.has(workout.date)) continue;
    const load = workoutLoadAU(workout);
    if (load > 0) {
      hasLift = true;
      liftLoads.set(workout.date, (liftLoads.get(workout.date) ?? 0) + load);
    }
  }

  for (const run of runs) {
    const key = run.day || run.date || "";
    if (!runLoads.has(key)) continue;
    const load = runLoadAU(run);
    if (load > 0) {
      hasRun = true;
      runLoads.set(key, (runLoads.get(key) ?? 0) + load);
    }
  }

  const firstActiveIndex = dayKeys.findIndex(
    (k) => (liftLoads.get(k) ?? 0) + (runLoads.get(k) ?? 0) > 0
  );
  if (firstActiveIndex === -1) return EMPTY_RESULT;

  const spanDays = HYBRID_LOAD_WINDOW_DAYS - firstActiveIndex;
  const recent42Start = HYBRID_LOAD_WINDOW_DAYS - CTL_TIME_CONSTANT_DAYS;
  let activeDays42d = 0;
  for (let i = recent42Start; i < HYBRID_LOAD_WINDOW_DAYS; i += 1) {
    const k = dayKeys[i];
    if ((liftLoads.get(k) ?? 0) + (runLoads.get(k) ?? 0) > 0)
      activeDays42d += 1;
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
  const decayCtl = 1 - alphaCtl;
  const decayAtl = 1 - alphaAtl;

  let rawCtl = 0;
  let rawAtl = 0;
  let ctl = 0;
  let atl = 0;
  let ctl14dAgo = 0;
  const fourteenDaysAgoIndex = Math.max(
    firstActiveIndex,
    HYBRID_LOAD_WINDOW_DAYS - 1 - 14
  );
  const seriesStartIndex = Math.max(
    firstActiveIndex,
    HYBRID_LOAD_WINDOW_DAYS - HYBRID_LOAD_SERIES_DAYS
  );
  const series: HybridLoadPoint[] = [];

  // Warmup-normalized EWMA from the athlete's first logged day in the window:
  // dividing by (1 - (1 - alpha)^age) removes zero-init bias so steady new
  // athletes aren't falsely flagged as overreaching while CTL is warming up.
  for (let i = firstActiveIndex; i < HYBRID_LOAD_WINDOW_DAYS; i += 1) {
    const key = dayKeys[i];
    const liftLoad = liftLoads.get(key) ?? 0;
    const runLoad = runLoads.get(key) ?? 0;
    const load = liftLoad + runLoad;
    const age = i - firstActiveIndex + 1;
    rawCtl += (load - rawCtl) * alphaCtl;
    rawAtl += (load - rawAtl) * alphaAtl;
    ctl = rawCtl / (1 - Math.pow(decayCtl, age));
    atl = rawAtl / (1 - Math.pow(decayAtl, age));
    if (i === fourteenDaysAgoIndex) {
      ctl14dAgo = ctl;
    }
    if (i >= seriesStartIndex) {
      series.push({
        date: key,
        liftLoad: round1(liftLoad),
        runLoad: round1(runLoad),
        fitness: round1(ctl),
        fatigue: round1(atl),
        form: round1(ctl - atl),
      });
    }
  }

  const fitness = round1(ctl);
  const fatigue = round1(atl);
  const form = round1(ctl - atl);
  const fitnessDelta14d = round1(ctl - ctl14dAgo);
  const status = classifyForm(form);

  // Project planned workouts & runs (including race taper) forward from today.
  const upcoming = buildUpcomingPlanLoads(programState, anchor, todayKey);
  const projectedSeries: HybridLoadPoint[] = [];
  let raceDayProjection: HybridRaceProjection | null = null;
  let projRawCtl = rawCtl;
  let projRawAtl = rawAtl;
  let projAge = HYBRID_LOAD_WINDOW_DAYS - firstActiveIndex;

  for (const day of upcoming.days) {
    const load = day.liftLoad + day.runLoad;
    projAge += 1;
    projRawCtl += (load - projRawCtl) * alphaCtl;
    projRawAtl += (load - projRawAtl) * alphaAtl;
    const projCtl = projRawCtl / (1 - Math.pow(decayCtl, projAge));
    const projAtl = projRawAtl / (1 - Math.pow(decayAtl, projAge));
    const point: HybridLoadPoint = {
      date: day.date,
      liftLoad: day.liftLoad,
      runLoad: day.runLoad,
      fitness: round1(projCtl),
      fatigue: round1(projAtl),
      form: round1(projCtl - projAtl),
      projected: true,
    };
    projectedSeries.push(point);
    if (upcoming.raceDateKey && day.date === upcoming.raceDateKey) {
      raceDayProjection = {
        date: day.date,
        fitness: point.fitness,
        fatigue: point.fatigue,
        form: point.form,
        status: classifyForm(point.form),
      };
    }
  }

  return {
    status,
    fitness,
    fatigue,
    form,
    fitnessDelta14d,
    activeDays42d,
    hasLift,
    hasRun,
    series,
    projectedSeries,
    raceDayProjection,
  };
}
