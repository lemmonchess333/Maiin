/**
 * Analytics' figures for a range pill: its window, the range before it, the
 * days an account younger than the range has had, and which sessions and
 * runs each figure counts.
 *
 * Every window on the page comes from `historyRange`, so no figure picks
 * its own. "Last 30 days" is the same 30 dates for lift records and run
 * records, a run sits on the day it belongs to (`runEvidenceDate`), and
 * "New" is the same week for a lift and a run. History renders what these
 * functions return; they take sessions and a range, and read no clock but
 * the range's.
 */
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
  rollingWindowStart,
} from "./dateHelpers";
import { distanceLabel, paceMinSec } from "./runLabels";
import { paceUnitLabel, type DistanceUnit } from "./distanceUnits";
import { EXERCISES, getExerciseById } from "./exercises";
import { bestSetPerExercise, type LiftRecord } from "./liftRecords";
import {
  liftProgress,
  NEW_BEST_DAYS,
  type LiftProgressRow,
} from "./liftProgress";
import {
  performedWeeklyVolume,
  volumeWeekKeys,
  type MuscleWeekVolume,
} from "./performedVolume";
import {
  summaryBins,
  summaryFirstDayKey,
  summaryGranularity,
  usualBinAmount,
  type SummaryBin,
  type SummaryGranularity,
} from "./periodSummary";
import { runEvidenceDate } from "./runExecutionEvidence";
import {
  isAllTimeRecord,
  selectRunRecords,
  type RunRecordCandidate,
  type RunRecords,
} from "./runRecordSelection";
import {
  isIndoorPaceEligible,
  isPaceEligible,
  isVolumeEligible,
  type RunRecord,
} from "./runStatsEligibility";
import { workoutTonnageKg, type Workout } from "./savedWorkouts";
import { daysSinceStart, startDayKey } from "./startDay";
import { formatDayMonth } from "@/utils/formatters";

/** The PRs tab's "Recent bests" window, in days. */
export const RECENT_BEST_DAYS = 30;

export interface HistoryRange {
  /** The days the range pill names. */
  rangeDays: number;
  /** When the range was read. */
  now: Date;
  /** The range's first day, at local midnight. */
  since: Date;
  sinceKey: string;
  /** The first day of the range before it, which is as long. */
  prevSince: Date;
  prevSinceKey: string;
  todayKey: string;
  /** The account's first day, when it is known. */
  startKey: string | null;
  /** The account began inside the range: there is no range before it to
   *  compare with. */
  joinedInRange: boolean;
  /** The days the range covers for this account: the whole range, or the
   *  days since the account began when it is younger than the range. */
  accountDays: number;
  /** The first day of "Last 30 days". */
  recentSinceKey: string;
  /** The first day a best counts as new. */
  newSinceKey: string;
}

/**
 * The range a pill names, read at `now`. `createdAt` is the profile's, as
 * stored: until the server has stamped it, the account's age is unknown and
 * the range is the whole range.
 */
export function historyRange(
  rangeDays: number,
  { createdAt, now = new Date() }: { createdAt?: unknown; now?: Date } = {}
): HistoryRange {
  const since = rollingWindowStart(rangeDays, now);
  const prevSince = rollingWindowStart(rangeDays, addLocalDays(since, -1));
  const todayKey = localDateString(now);
  const startKey = startDayKey(createdAt);
  const age = daysSinceStart(startKey, todayKey);
  const joinedInRange = age !== null && age < rangeDays;
  return {
    rangeDays,
    now,
    since,
    sinceKey: localDateString(since),
    prevSince,
    prevSinceKey: localDateString(prevSince),
    todayKey,
    startKey,
    joinedInRange,
    // A creation stamp ahead of this device's clock is an account that
    // began today.
    accountDays: joinedInRange ? Math.max(1, age ?? 1) : rangeDays,
    recentSinceKey: localDateString(rollingWindowStart(RECENT_BEST_DAYS, now)),
    newSinceKey: localDateString(addLocalDays(now, -NEW_BEST_DAYS)),
  };
}

// ── Lifting ──────────────────────────────────────────────────────────────

type RangeWorkout = Pick<Workout, "date" | "exercises">;
type RangeExercise = Workout["exercises"][number];

export interface LiftFigures {
  liftCount: number;
  liftVolume: number;
  prevLiftCount: number;
  prevLiftVolume: number;
  /** Working sets per muscle group across the range. */
  muscleData: Record<string, number>;
  /** Each exercise's best set over every session. */
  lifetimePRs: LiftRecord[];
  /** Each exercise's best set in the last 30 days. */
  recentLiftPRs: LiftRecord[];
}

/**
 * A logged exercise's muscle group. The catalogue's, found by id and then
 * by name, over the category saved with the set: saved categories have
 * shipped wrong (every exercise as "Chest"), and the catalogue is the
 * taxonomy. A custom exercise has only its saved one.
 */
function muscleGroupOf(ex: RangeExercise): string {
  const known =
    (ex.exerciseId ? getExerciseById(ex.exerciseId) : undefined) ??
    EXERCISES.find((e) => e.name === ex.exerciseName);
  return known?.category || ex.category || "Other";
}

/** Sets that trained the muscle: warm-ups and sets with no reps do not. */
function workingSetCount(ex: RangeExercise): number {
  return (ex.sets ?? []).filter((s) => s.type !== "warmup" && s.reps > 0)
    .length;
}

export function liftFigures(
  workouts: readonly RangeWorkout[],
  range: HistoryRange
): LiftFigures {
  const { sinceKey, prevSinceKey } = range;
  let liftCount = 0;
  let liftVolume = 0;
  let prevLiftCount = 0;
  let prevLiftVolume = 0;
  const muscleData: Record<string, number> = {};
  for (const w of workouts) {
    if (w.date >= sinceKey) {
      liftCount += 1;
      liftVolume += workoutTonnageKg(w);
      for (const ex of w.exercises ?? []) {
        const sets = workingSetCount(ex);
        if (sets === 0) continue;
        const group = muscleGroupOf(ex);
        muscleData[group] = (muscleData[group] ?? 0) + sets;
      }
    } else if (w.date >= prevSinceKey) {
      prevLiftCount += 1;
      prevLiftVolume += workoutTonnageKg(w);
    }
  }
  return {
    liftCount,
    liftVolume,
    prevLiftCount,
    prevLiftVolume,
    muscleData,
    lifetimePRs: bestSetPerExercise(workouts, {
      newSinceKey: range.newSinceKey,
    }),
    // Given every session, not the window's: a window's best is new only
    // when it is also the all-time best.
    recentLiftPRs: bestSetPerExercise(workouts, {
      sinceKey: range.recentSinceKey,
      newSinceKey: range.newSinceKey,
    }),
  };
}

export interface LiftingPageFigures {
  /** Each main lift's progress over the range. */
  progress: LiftProgressRow[];
  /** Working sets in the range. */
  sets: number;
  /** The whole weeks the sets per muscle are averaged over. */
  muscleWeeks: number;
  /** Sets a week per muscle against the bands for the person's focus. */
  muscles: MuscleWeekVolume[];
  /** The usual week's kilograms, which the volume bars stand against. */
  averageKg: number | null;
}

/**
 * The Lifting page's reading of the range. `workouts` holds every session,
 * so a lift's best and the person's first session are both all-time.
 */
export function liftingPageFigures(
  workouts: readonly RangeWorkout[],
  range: HistoryRange,
  { primaryGoal, bins }: { primaryGoal?: string; bins: readonly SummaryBin[] }
): LiftingPageFigures {
  const { now: today, since, sinceKey } = range;
  let firstSessionKey: string | null = null;
  let sets = 0;
  for (const w of workouts) {
    if (!firstSessionKey || w.date < firstSessionKey) firstSessionKey = w.date;
    if (w.date < sinceKey) continue;
    for (const ex of w.exercises ?? []) sets += workingSetCount(ex);
  }
  const weekKeys = volumeWeekKeys({ since, today, firstSessionKey });
  return {
    progress: liftProgress(workouts, { sinceKey, today }),
    sets,
    muscleWeeks: weekKeys.length,
    muscles: performedWeeklyVolume(workouts, { weekKeys, primaryGoal }),
    averageKg: usualBinAmount(bins, (b) => b.volumeKg, {
      sinceKey,
      firstSessionKey,
    }),
  };
}

// ── Food ─────────────────────────────────────────────────────────────────

interface RangeMeal {
  date: string;
  totalCalories?: number;
  totalProtein?: number;
  totalCarbs?: number;
  totalFat?: number;
}

export interface NutritionFigures {
  avgCalories: number;
  avgProtein: number;
  avgCarbs: number;
  avgFat: number;
  prevAvgCalories: number;
  prevAvgProtein: number;
  prevAvgCarbs: number;
  prevAvgFat: number;
  daysLogged: number;
  prevDaysLogged: number;
  /** The days `daysLogged` is out of: "Logged 8 of 10 days". */
  days: number;
  /** `daysLogged` as a percentage of `days`. */
  adherence: number;
  showSparklines: boolean;
  showDelta: boolean;
  caloriesSparkline: number[];
  proteinSparkline: number[];
  carbsSparkline: number[];
  fatSparkline: number[];
}

type DayTotals = { cal: number; prot: number; carbs: number; fat: number };

function totalsByDate(meals: readonly RangeMeal[]): Record<string, DayTotals> {
  const byDate: Record<string, DayTotals> = {};
  for (const m of meals) {
    const day = (byDate[m.date] ??= { cal: 0, prot: 0, carbs: 0, fat: 0 });
    day.cal += m.totalCalories || 0;
    day.prot += m.totalProtein || 0;
    day.carbs += m.totalCarbs || 0;
    day.fat += m.totalFat || 0;
  }
  return byDate;
}

function average(days: readonly DayTotals[], key: keyof DayTotals): number {
  return days.length
    ? Math.round(days.reduce((s, d) => s + d[key], 0) / days.length)
    : 0;
}

/**
 * Daily food across the range: averages over the days logged, the same for
 * the range before, and how many of the range's days were logged.
 *
 * An account younger than the range is counted out of the days it has had,
 * not the whole range, as the overview counts it. A day logged before the
 * account began (a meal entered for the day before sign-up) is a day the
 * person counts, so the days start at whichever came first.
 */
export function nutritionFigures(
  meals: readonly RangeMeal[],
  range: HistoryRange
): NutritionFigures {
  /* The meal's own date at local midnight against the window's first day:
     the boundary date is in the window (`analyticsWindowAgreement`). */
  const inWindow = meals.filter(
    (m) => new Date(m.date + "T00:00:00") >= range.since
  );
  const inPrevious = meals.filter((m) => {
    const d = new Date(m.date + "T00:00:00");
    return d >= range.prevSince && d < range.since;
  });

  const byDate = totalsByDate(inWindow);
  const prevByDate = totalsByDate(inPrevious);
  const loggedDays = Object.values(byDate);
  const prevLoggedDays = Object.values(prevByDate);
  const sortedDates = Object.keys(byDate).sort((a, b) => a.localeCompare(b));

  const daysLogged = sortedDates.length;
  const prevDaysLogged = prevLoggedDays.length;
  const firstLogged = sortedDates[0];
  const days = Math.max(
    range.accountDays,
    firstLogged ? (daysSinceStart(firstLogged, range.todayKey) ?? 0) : 0
  );
  const adherence = daysLogged > 0 ? Math.round((daysLogged / days) * 100) : 0;

  return {
    avgCalories: average(loggedDays, "cal"),
    avgProtein: average(loggedDays, "prot"),
    avgCarbs: average(loggedDays, "carbs"),
    avgFat: average(loggedDays, "fat"),
    prevAvgCalories: average(prevLoggedDays, "cal"),
    prevAvgProtein: average(prevLoggedDays, "prot"),
    prevAvgCarbs: average(prevLoggedDays, "carbs"),
    prevAvgFat: average(prevLoggedDays, "fat"),
    daysLogged,
    prevDaysLogged,
    days,
    adherence,
    /* Logged days only, in order. A day with nothing logged is unknown
       intake, not zero, so it is not drawn; the lines show only once a
       week of days is logged and at least half the range, the point at
       which the days not logged could no longer turn the trend over. */
    showSparklines: daysLogged >= 7 && adherence >= 50,
    /* A change on the range before needs both ranges well sampled: a
       person who logs 17 of 30 days logs the days they cared to, which
       skews the mean. Below 60% in either, the change is mostly that. */
    showDelta:
      daysLogged >= 7 &&
      prevDaysLogged >= 7 &&
      daysLogged / days >= 0.6 &&
      prevDaysLogged / range.rangeDays >= 0.6,
    caloriesSparkline: sortedDates.map((d) => byDate[d].cal),
    proteinSparkline: sortedDates.map((d) => byDate[d].prot),
    carbsSparkline: sortedDates.map((d) => byDate[d].carbs),
    fatSparkline: sortedDates.map((d) => byDate[d].fat),
  };
}

// ── Running records ──────────────────────────────────────────────────────

type RecordRun = RunRecord & RunRecordCandidate & { id: string; date?: string };

/** A row on the PRs tab's running cards. */
export interface RunRecordRow {
  label: string;
  value: string;
  /** "13 Sept": the day the run belongs to. */
  date: string;
  /** A record set in the last week that is also a personal best. */
  isNew: boolean;
  /** The run that holds the record, which the row opens. */
  runId?: string;
}

export interface RunRecordRows {
  /** Outdoor records over every run. */
  lifetime: RunRecordRow[];
  /** Outdoor records over the last 30 days. */
  recent30d: RunRecordRow[];
  /** Treadmill and manual records over every run: a typed distance is
   *  not a measured one, so they are kept apart. */
  indoor: RunRecordRow[];
  /** An outdoor run in the last 30 days. */
  hasAnyRecent: boolean;
  /** An indoor run holds a record. */
  hasAnyIndoor: boolean;
}

function recordRows<R extends RecordRun>(
  records: RunRecords<R>,
  {
    includeLongest,
    allTime,
    newSinceKey,
    unit,
  }: {
    includeLongest: boolean;
    /** The records over every run, for a narrower pool. */
    allTime?: RunRecords<R>;
    newSinceKey: string;
    unit: DistanceUnit;
  }
): RunRecordRow[] {
  /* New is gold, and gold means a personal best: a narrower pool's record
     says New only when the same run holds it over every run. */
  const isNew = (run: R, kind: keyof RunRecords<R>) =>
    runEvidenceDate(run) >= newSinceKey &&
    (!allTime || isAllTimeRecord(allTime, kind, run));
  const day = (run: R) => formatDayMonth(parseLocalDate(runEvidenceDate(run)));
  const { bestPace, bestSustainedPace, longest } = records;

  /* Neither pace row is a race result, and the labels do not claim one:
     both read `avgPace`, the average over a whole run, from a pool with a
     distance floor. The value carries its unit, because a bare "5:32" is
     ambiguous between per-kilometre and per-mile wherever it sits. A true
     fastest kilometre is a different figure, from the splits, and is the
     Running page's. */
  const rows: RunRecordRow[] = [
    {
      label: "Best pace",
      value: bestPace
        ? `${paceMinSec(bestPace.avgPace, unit)} ${paceUnitLabel(unit)}`
        : "--",
      date: bestPace ? day(bestPace) : "",
      isNew: bestPace ? isNew(bestPace, "bestPace") : false,
      ...(bestPace ? { runId: bestPace.id } : {}),
    },
  ];
  /* Only when a different run holds it (`selectRunRecords`): a short blast
     at 5:32 and a 10 km at 5:58 are two facts, the same run twice is one. */
  if (bestSustainedPace) {
    rows.push({
      label: "Best pace · 5K+",
      value: `${paceMinSec(bestSustainedPace.avgPace, unit)} ${paceUnitLabel(unit)}`,
      date: day(bestSustainedPace),
      isNew: isNew(bestSustainedPace, "bestSustainedPace"),
      runId: bestSustainedPace.id,
    });
  }
  if (includeLongest) {
    rows.push({
      label: "Longest run",
      value: longest ? distanceLabel(longest.distance, unit) : "--",
      date: longest ? day(longest) : "",
      isNew: longest ? isNew(longest, "longest") : false,
      ...(longest ? { runId: longest.id } : {}),
    });
  }
  return rows;
}

/**
 * The PRs tab's running records from every run (`allRuns` is the read of
 * the whole collection, not the range's): outdoor records all-time and for
 * the last 30 days, and indoor records apart. Each pool takes its runs by
 * the eligibility rules in `runStatsEligibility`.
 */
export function runRecordRows<R extends RecordRun>(
  allRuns: readonly R[],
  range: Pick<HistoryRange, "recentSinceKey" | "newSinceKey">,
  unit: DistanceUnit
): RunRecordRows {
  const outdoor = allRuns.filter((r) => isPaceEligible(r));
  const recent = outdoor.filter(
    (r) => runEvidenceDate(r) >= range.recentSinceKey
  );
  const allTime = selectRunRecords(outdoor, { includeLongest: true });
  const indoor = selectRunRecords(
    allRuns.filter((r) => isIndoorPaceEligible(r)),
    { includeLongest: false }
  );
  const shared = { newSinceKey: range.newSinceKey, unit };
  return {
    lifetime: recordRows(allTime, { ...shared, includeLongest: true }),
    recent30d: recordRows(selectRunRecords(recent, { includeLongest: true }), {
      ...shared,
      includeLongest: true,
      allTime,
    }),
    indoor: recordRows(indoor, { ...shared, includeLongest: false }),
    hasAnyRecent: recent.length > 0,
    hasAnyIndoor: indoor.bestPace !== null,
  };
}

// ── The overview's period summary ────────────────────────────────────────

type SummaryRunInput = RunRecord & { completedAt: Date; date?: string };

export interface PeriodSummaryFigures {
  granularity: SummaryGranularity;
  bins: SummaryBin[];
  /** Runs in the range before, or null while the read of every run is
   *  pending or failed: an unknown is not a range with no runs. */
  prevRunCount: number | null;
  prevRunM: number | null;
}

/**
 * The overview's bars, and the runs of the range before for its changes.
 *
 * Each bar is the whole week or month it names, so the first one takes its
 * days from before the window too (`summaryFirstDayKey`); given only the
 * window's sessions it would hold part of a week under the week's name.
 * `workouts` holds every session. Inside the window the bars count the
 * window's run read, as the figures above them do, and the first bar's
 * earlier days take theirs from the read of every run. A run is placed on
 * the day it belongs to, in the bars and in the range before alike.
 */
export function periodSummaryFigures({
  range,
  workouts,
  windowRuns,
  allRuns,
  allRunsKnown,
}: {
  range: HistoryRange;
  workouts: readonly RangeWorkout[];
  /** The window's runs (`useRunningStats`). */
  windowRuns: readonly SummaryRunInput[];
  /** Every run (`useLifetimeRunStats`). */
  allRuns: readonly SummaryRunInput[];
  /** The read of every run has settled without failing. */
  allRunsKnown: boolean;
}): PeriodSummaryFigures {
  const { since, sinceKey, prevSinceKey } = range;
  const granularity = summaryGranularity(range.rangeDays);
  const firstDayKey = summaryFirstDayKey(since, granularity);
  const binRuns = [
    ...allRuns.filter((r) => runEvidenceDate(r) < sinceKey),
    ...windowRuns.filter((r) => runEvidenceDate(r) >= sinceKey),
  ];
  const bins = summaryBins({
    since,
    today: range.now,
    lifts: workouts
      .filter((w) => w.date >= firstDayKey)
      .map((w) => ({ date: w.date, volumeKg: workoutTonnageKg(w) })),
    runs: binRuns
      .filter((r) => isVolumeEligible(r))
      .map((r) => ({ date: runEvidenceDate(r), distanceM: r.distance ?? 0 }))
      .filter((r) => r.date >= firstDayKey),
    granularity,
  });
  const previousRuns = allRunsKnown
    ? allRuns.filter((r) => {
        const day = runEvidenceDate(r);
        return isVolumeEligible(r) && day >= prevSinceKey && day < sinceKey;
      })
    : null;
  return {
    granularity,
    bins,
    prevRunCount: previousRuns ? previousRuns.length : null,
    prevRunM: previousRuns
      ? previousRuns.reduce((sum, r) => sum + (r.distance ?? 0), 0)
      : null,
  };
}
