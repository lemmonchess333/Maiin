/**
 * What Tropos predicted for a goal race, kept so the race can be judged
 * against it: a log of the prediction while the plan runs, a copy of it on
 * the race run when the race is saved, and the comparison the run summary
 * shows ("Tropos predicted 3:52:10. You ran 3:48:31, 3:39 faster.").
 *
 * The prediction is the one the plan trains to: Riegel off the runner's
 * confirmed benchmark (`predictedRaceTimesFromFitness`), the time the race
 * week's pacing card calls "What your recent running implies" and the race
 * session's target pace. An unconfirmed derived benchmark is measurement
 * only (RUN-EV-08), so it predicts nothing here. Nothing in this module
 * changes how a prediction is made; it records and compares.
 *
 * The log (`users/{uid}/programState/racePrediction`) holds one goal race:
 * its first prediction, each change to it (a pace update, first paces after
 * a time trial), and the prediction going into race week. Its weeks are
 * worked out from the dates, so a plan whose week has not rolled over yet
 * still counts right. A new goal race starts a new log.
 *
 * A run is the goal race by the server's rule for "was this race run"
 * (`functions/lib/raceDayCompletion.js`, `isStrictRaceRun`, the one that
 * starts the recovery weeks): saved on the race's date, valid, and at least
 * 95% of the race distance, however it was started. `racePrediction.cross.
 * test.ts` holds the two to one answer, and holds the operator report
 * (`functions/scripts/report-race-predictions.js`) to the shape written
 * here.
 *
 * Pure: callers pass the day, the time and the stores.
 */
import { differenceInCalendarDays } from "date-fns";
import {
  localWeekKey,
  parseLocalDate,
  wholeWeeksBetween,
} from "@/lib/dateHelpers";
import { finishTimeLabel } from "@/lib/runLabels";
import {
  paceTableFromFitness,
  predictedRaceTimesFromFitness,
  type RaceDistanceKey,
  type RunFitnessInput,
} from "@/lib/runPaces";

/** The log's document id under `users/{uid}/programState`. */
export const RACE_PREDICTION_LOG_DOC = "racePrediction";

/** Why a prediction was recorded: the first one for this race, a change
 *  to it, or the one in force going into race week. */
export type RacePredictionReason = "first" | "changed" | "race-week";

export interface RacePredictionSnapshot {
  /** When it was recorded, an ISO time. */
  at: string;
  reason: RacePredictionReason;
  /** The predicted finish time for the race distance, whole seconds. */
  predictedS: number;
  /** The VDOT it came from, to one decimal. */
  vdot: number;
  /** How the benchmark was set (`runFitness.source`), null when unknown. */
  source: string | null;
  /** Weeks of the plan done when it was recorded: 0 in its first week (and
   *  a lead-in before it), the plan's weeks less one in race week. Null for
   *  a plan with no length. */
  weeksDone: number | null;
  /** The plan's weeks, race week included, null when unknown. */
  planWeeks: number | null;
  /** Calendar days from the day it was recorded to race day. */
  daysToRace: number;
}

export interface RacePredictionLog {
  v: 1;
  distance: RaceDistanceKey;
  /** The race's local "YYYY-MM-DD". */
  targetDate: string;
  snapshots: RacePredictionSnapshot[];
}

/** What the goal race's run keeps (`racePrediction` on the run document):
 *  the race, and the predictions recorded before it started. Empty
 *  `predictions` is a goal race Tropos had no prediction for. */
export interface GoalRaceRecord {
  v: 1;
  distance: RaceDistanceKey;
  targetDate: string;
  /** A race entered, or the distance run on the runner's own (Run9). */
  entry: "race" | "own";
  /** The goal time the runner typed, whole seconds, or null. */
  goalTimeS: number | null;
  predictions: RacePredictionSnapshot[];
}

/** The goal race as the stores hold it (`resolveRunPlan(...).raceGoal`). */
export interface GoalRace {
  distance: string;
  targetDate: string;
  entry?: "race" | "own";
  targetTimeS?: number;
}

/** The race distances in metres, as the server's race-day rule holds them
 *  (`PLANNED_RACE_DISTANCE_METERS`), the half's to the whole metre. */
const GOAL_RACE_METRES: Record<RaceDistanceKey, number> = {
  "5k": 5000,
  "10k": 10000,
  half: 21097,
  marathon: 42195,
};

/** The share of the race distance a run must cover to be the race: the
 *  server's `RACE_STRICT_DISTANCE_RATIO`. */
export const GOAL_RACE_DISTANCE_RATIO = 0.95;

/** Race week, for the log: the seven days before race day. */
const RACE_WEEK_DAYS = 7;

/** The most snapshots a log keeps: the first and the latest. A Tropos
 *  heuristic: a 20-week block with a pace update every week is under it. */
export const MAX_RACE_PREDICTIONS = 40;

function isRaceDistance(value: unknown): value is RaceDistanceKey {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(GOAL_RACE_METRES, value)
  );
}

/** The runner's benchmark as the profile holds it: the pace engine's input
 *  and how it was set. */
export type GoalRaceFitness = RunFitnessInput & { source?: string | null };

/**
 * The prediction for a race distance from the runner's confirmed benchmark,
 * or null with none. An unconfirmed derived benchmark predicts nothing.
 */
function goalRacePrediction(
  fitness: GoalRaceFitness | null | undefined,
  distance: RaceDistanceKey
): { predictedS: number; vdot: number; source: string | null } | null {
  if (!fitness || fitness.pendingConfirmation) return null;
  const predictedS = predictedRaceTimesFromFitness(fitness)?.[distance];
  const vdot = paceTableFromFitness(fitness)?.vdot;
  if (!predictedS || !(predictedS > 0) || !vdot || !(vdot > 0)) return null;
  return {
    predictedS: Math.round(predictedS),
    vdot,
    source: typeof fitness.source === "string" ? fitness.source : null,
  };
}

/** Weeks of the plan done on `todayKey`: the plan's last week is race week,
 *  so it is its weeks less one less the whole weeks from this week to race
 *  week. 0 before the plan's first week starts (a lead-in). */
function weeksDoneOn(
  planWeeks: number | null,
  todayKey: string,
  targetDate: string
): number | null {
  if (planWeeks == null || !Number.isInteger(planWeeks) || planWeeks <= 0)
    return null;
  const weeksToRaceWeek = wholeWeeksBetween(
    localWeekKey(parseLocalDate(todayKey)),
    localWeekKey(parseLocalDate(targetDate))
  );
  return Math.min(planWeeks - 1, Math.max(0, planWeeks - 1 - weeksToRaceWeek));
}

/**
 * The log to write on `todayKey`, or null for nothing to record.
 *
 * Records, before race day only: the first prediction for this race (a new
 * log, replacing one for another race), a prediction that changed, and the
 * prediction in race week, once. Race day and after record nothing, so new
 * paces taken from the race itself never count as a prediction of it.
 */
export function nextRacePredictionLog(args: {
  log: RacePredictionLog | null;
  goal: GoalRace | null | undefined;
  runFitness: GoalRaceFitness | null | undefined;
  /** `runPlan.totalWeeks`. */
  planWeeks: number | null | undefined;
  todayKey: string;
  now: Date;
}): RacePredictionLog | null {
  const { log, goal, todayKey, now } = args;
  if (!goal || !isRaceDistance(goal.distance) || !goal.targetDate) return null;
  const daysToRace = differenceInCalendarDays(
    parseLocalDate(goal.targetDate),
    parseLocalDate(todayKey)
  );
  if (!Number.isFinite(daysToRace) || daysToRace < 1) return null;
  const prediction = goalRacePrediction(args.runFitness, goal.distance);
  if (!prediction) return null;

  const sameRace =
    log !== null &&
    log.distance === goal.distance &&
    log.targetDate === goal.targetDate;
  const kept = sameRace ? log.snapshots : [];
  const last = kept.at(-1);
  const inRaceWeek = daysToRace <= RACE_WEEK_DAYS;
  let reason: RacePredictionReason;
  if (!last) reason = "first";
  else if (inRaceWeek && !kept.some((s) => s.daysToRace <= RACE_WEEK_DAYS))
    reason = "race-week";
  else if (last.predictedS !== prediction.predictedS) reason = "changed";
  else return null;

  const planWeeks =
    typeof args.planWeeks === "number" && Number.isInteger(args.planWeeks)
      ? args.planWeeks
      : null;
  const snapshot: RacePredictionSnapshot = {
    at: now.toISOString(),
    reason,
    predictedS: prediction.predictedS,
    vdot: prediction.vdot,
    source: prediction.source,
    weeksDone: weeksDoneOn(planWeeks, todayKey, goal.targetDate),
    planWeeks: planWeeks != null && planWeeks > 0 ? planWeeks : null,
    daysToRace,
  };
  const all = [...kept, snapshot];
  const snapshots =
    all.length > MAX_RACE_PREDICTIONS
      ? [all[0], ...all.slice(-(MAX_RACE_PREDICTIONS - 1))]
      : all;
  return {
    v: 1,
    distance: goal.distance,
    targetDate: goal.targetDate,
    snapshots,
  };
}

/** What a run says about itself that decides whether it was the goal race.
 *  A saved run document carries all of it. */
export interface GoalRaceRunFacts {
  /** The local day the run belongs to (`runDay`). */
  date?: string | null;
  /** Metres. */
  distance?: number | null;
  isInvalid?: boolean | null;
  savedAnyway?: boolean | null;
}

/**
 * Whether a run was the goal race: on its date, valid, and at least 95% of
 * its distance, as the server decides it when it starts the recovery weeks.
 * How the run was started does not matter: a runner who taps Start run on
 * the start line ran the race.
 */
export function isGoalRaceRun(
  run: GoalRaceRunFacts,
  goal: GoalRace | null | undefined
): boolean {
  if (!goal || !isRaceDistance(goal.distance)) return false;
  if (!run.date || run.date !== goal.targetDate) return false;
  if (run.isInvalid === true || run.savedAnyway === true) return false;
  if (typeof run.distance !== "number" || !Number.isFinite(run.distance))
    return false;
  return (
    run.distance / GOAL_RACE_METRES[goal.distance] >= GOAL_RACE_DISTANCE_RATIO
  );
}

/**
 * The record a goal race's run keeps: the race, and the log's predictions
 * for it recorded before the run started (`startedAtMs`; none known keeps
 * them all). A log for another race, or none, gives a record with no
 * predictions.
 */
export function goalRaceRecord(
  log: RacePredictionLog | null,
  goal: GoalRace,
  startedAtMs?: number | null
): GoalRaceRecord | null {
  if (!isRaceDistance(goal.distance)) return null;
  const before =
    typeof startedAtMs === "number" && Number.isFinite(startedAtMs)
      ? startedAtMs
      : Number.POSITIVE_INFINITY;
  const predictions =
    log && log.distance === goal.distance && log.targetDate === goal.targetDate
      ? log.snapshots.filter((s) => Date.parse(s.at) < before)
      : [];
  return {
    v: 1,
    distance: goal.distance,
    targetDate: goal.targetDate,
    entry: goal.entry === "own" ? "own" : "race",
    goalTimeS:
      typeof goal.targetTimeS === "number" && goal.targetTimeS > 0
        ? Math.round(goal.targetTimeS)
        : null,
    predictions,
  };
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseSnapshot(value: unknown): RacePredictionSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const s = value as Record<string, unknown>;
  const predictedS = finiteOrNull(s.predictedS);
  const daysToRace = finiteOrNull(s.daysToRace);
  if (
    typeof s.at !== "string" ||
    !Number.isFinite(Date.parse(s.at)) ||
    (s.reason !== "first" &&
      s.reason !== "changed" &&
      s.reason !== "race-week") ||
    predictedS === null ||
    predictedS <= 0 ||
    daysToRace === null
  )
    return null;
  return {
    at: s.at,
    reason: s.reason,
    predictedS,
    vdot: finiteOrNull(s.vdot) ?? 0,
    source: typeof s.source === "string" ? s.source : null,
    weeksDone: finiteOrNull(s.weeksDone),
    planWeeks: finiteOrNull(s.planWeeks),
    daysToRace,
  };
}

function parseSnapshots(value: unknown): RacePredictionSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((s) => {
    const parsed = parseSnapshot(s);
    return parsed ? [parsed] : [];
  });
}

/** The log as stored, or null for none or a shape this build can't read. */
export function parseRacePredictionLog(
  data: unknown
): RacePredictionLog | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.v !== 1 || !isRaceDistance(d.distance)) return null;
  if (typeof d.targetDate !== "string") return null;
  return {
    v: 1,
    distance: d.distance,
    targetDate: d.targetDate,
    snapshots: parseSnapshots(d.snapshots),
  };
}

/** A run's `racePrediction` as stored, or null. */
export function parseGoalRaceRecord(data: unknown): GoalRaceRecord | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.v !== 1 || !isRaceDistance(d.distance)) return null;
  if (typeof d.targetDate !== "string") return null;
  const goal = finiteOrNull(d.goalTimeS);
  return {
    v: 1,
    distance: d.distance,
    targetDate: d.targetDate,
    entry: d.entry === "own" ? "own" : "race",
    goalTimeS: goal !== null && goal > 0 ? goal : null,
    predictions: parseSnapshots(d.predictions),
  };
}

/** How the race went against the last prediction before it, and the first
 *  prediction where it was different. */
export interface RacePredictionResult {
  predictedS: number;
  actualS: number;
  /** Seconds the runner took over the prediction: negative when faster. */
  gapS: number;
  /** The first prediction, when it differed from the last. */
  first: {
    predictedS: number;
    weeksDone: number | null;
    planWeeks: number | null;
  } | null;
}

/**
 * The comparison for a goal race run in `actualS` seconds (the run's
 * recorded time), or null when there was no prediction to compare with.
 */
export function racePredictionResult(
  record: GoalRaceRecord | null | undefined,
  actualS: number | null | undefined
): RacePredictionResult | null {
  const last = record?.predictions.at(-1);
  if (!record || !last) return null;
  if (typeof actualS !== "number" || !Number.isFinite(actualS) || actualS <= 0)
    return null;
  const ran = Math.round(actualS);
  const predicted = Math.round(last.predictedS);
  const firstSnapshot = record.predictions[0];
  return {
    predictedS: predicted,
    actualS: ran,
    gapS: ran - predicted,
    first:
      firstSnapshot !== last &&
      Math.round(firstSnapshot.predictedS) !== predicted
        ? {
            predictedS: Math.round(firstSnapshot.predictedS),
            weeksDone: firstSnapshot.weeksDone,
            planWeeks: firstSnapshot.planWeeks,
          }
        : null,
  };
}

/** The comparison's words, in parts so the times can be set as figures:
 *  "Tropos predicted {predicted}. You ran {ran}, {gap} faster." */
export interface RacePredictionWords {
  predicted: string;
  ran: string;
  /** The gap as a finish time ("3:39"), null when to the second. */
  gap: string | null;
  /** "faster", "slower", or "to the second". */
  verdict: "faster" | "slower" | "to the second";
  /** "First predicted {time} in week 1 of 18.", in parts, or null. */
  first: { time: string; when: string } | null;
}

export function racePredictionWords(
  result: RacePredictionResult
): RacePredictionWords {
  const verdict =
    result.gapS < 0 ? "faster" : result.gapS > 0 ? "slower" : "to the second";
  const first = result.first;
  const when =
    first && first.weeksDone !== null && first.planWeeks !== null
      ? ` in week ${first.weeksDone + 1} of ${first.planWeeks}`
      : "";
  return {
    predicted: finishTimeLabel(result.predictedS),
    ran: finishTimeLabel(result.actualS),
    gap: result.gapS === 0 ? null : finishTimeLabel(Math.abs(result.gapS)),
    verdict,
    first: first ? { time: finishTimeLabel(first.predictedS), when } : null,
  };
}
