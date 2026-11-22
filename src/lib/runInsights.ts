/**
 * What a runner's runs say beyond their total: how fast each kind of run
 * is going, and the quickest stretches inside them.
 *
 * The Running page led with one average pace across every run in the
 * range. An easy 8 km, a tempo and a race averaged together describe no
 * run anyone did, and a fitter month can show a slower average simply for
 * having more easy runs in it. Split by kind, the same numbers answer the
 * questions a runner has: is my easy pace coming down, is my tempo where
 * it was?
 *
 * The fastest kilometres are each run's own time over the distance
 * (`runEffortSeconds`): the best effort it saved at the finish, else, for
 * a run saved before those were kept, its fastest whole kilometres in a
 * row from its splits. So they are real stretches of running inside one
 * run, and the same figures the finish screen celebrates and Bests lists
 * (App1 Q15). A treadmill or manual run times none.
 */
import { isPaceEligible, isVolumeEligible } from "./runStatsEligibility";
import { runEffortSeconds, type EffortRun } from "./runEfforts";
import { FASTEST_EFFORT_METERS } from "./postMoments";
import { runEvidenceDate } from "./runExecutionEvidence";
import { T2_DELTA_MIN_POINTS } from "./dataConfidence";
import { usualBinAmount, type SummaryBin } from "./periodSummary";

/** The kinds pace is compared within. Intervals are not one: a whole
 *  session's average includes the recoveries between the reps. */
export type RunKind = "easy" | "long" | "tempo" | "race" | "other";

export const RUN_KIND_ORDER: readonly RunKind[] = [
  "easy",
  "long",
  "tempo",
  "race",
  "other",
];

/** The fewest runs of a kind, in each of the two ranges, that make a
 *  comparison between them worth showing: the page's shared rule for a
 *  change on the period before (`dataConfidence` T2). A kind's own pace
 *  is a plain figure and shows from its first run. */
export const MIN_RUNS_TO_COMPARE = T2_DELTA_MIN_POINTS;

export interface InsightRun {
  id: string;
  /** Metres. */
  distance: number;
  /** Seconds. */
  duration: number;
  /** Seconds per kilometre. */
  avgPace: number;
  activityType: string;
  /** "treadmill" for a run on one (Pgm8): kept out of the paces, which are
   *  outdoor GPS only (`isPaceEligible`), whatever its type. */
  place?: string | null;
  completedAt: Date;
  date?: string;
  isInvalid?: boolean;
  savedAnyway?: boolean;
  kmSplitSeconds?: EffortRun["kmSplitSeconds"];
  bestEfforts?: EffortRun["bestEfforts"];
}

export function runKindOf(activityType: string): RunKind | "intervals" | null {
  switch (activityType) {
    case "easy":
      return "easy";
    case "long":
    case "longrun":
      return "long";
    case "tempo":
      return "tempo";
    case "race":
      return "race";
    case "intervals":
      return "intervals";
    case "freerun":
    case "guided":
      return "other";
    default:
      return null;
  }
}

export interface PaceByKindRow {
  kind: RunKind;
  runs: number;
  /** Metres run in the kind, in the range. */
  distanceM: number;
  /** Seconds per kilometre, weighted by distance. */
  paceSecPerKm: number;
  /** The same over the range before, when both ranges held enough runs
   *  of the kind to compare. */
  previousPaceSecPerKm: number | null;
}

interface Window {
  sinceKey: string;
  todayKey: string;
}

function within(run: InsightRun, { sinceKey, todayKey }: Window): boolean {
  const key = runEvidenceDate(run);
  return key >= sinceKey && key <= todayKey;
}

/** Distance-weighted: a 20 km long run counts twenty times a 1 km jog. */
function weightedPace(runs: readonly InsightRun[]): number {
  let km = 0;
  let seconds = 0;
  for (const run of runs) {
    km += run.distance / 1000;
    seconds += run.avgPace * (run.distance / 1000);
  }
  return km > 0 ? Math.round(seconds / km) : 0;
}

/**
 * Each kind's pace in the range, against the range before it (`prevSinceKey`
 * up to the day before `sinceKey`). `intervalsLeftOut` counts the interval
 * sessions in the range, so the card can say why they are not listed.
 */
export function paceByRunKind(
  runs: readonly InsightRun[],
  {
    sinceKey,
    prevSinceKey,
    todayKey,
  }: { sinceKey: string; prevSinceKey: string; todayKey: string }
): { rows: PaceByKindRow[]; intervalsLeftOut: number } {
  const eligible = runs.filter((r) => isPaceEligible(r));
  const current = eligible.filter((r) => within(r, { sinceKey, todayKey }));
  const previous = eligible.filter((r) => {
    const key = runEvidenceDate(r);
    return key >= prevSinceKey && key < sinceKey;
  });

  const rows: PaceByKindRow[] = [];
  for (const kind of RUN_KIND_ORDER) {
    const now = current.filter((r) => runKindOf(r.activityType) === kind);
    if (now.length === 0) continue;
    const before = previous.filter((r) => runKindOf(r.activityType) === kind);
    const comparable =
      now.length >= MIN_RUNS_TO_COMPARE && before.length >= MIN_RUNS_TO_COMPARE;
    rows.push({
      kind,
      runs: now.length,
      distanceM: now.reduce((sum, r) => sum + r.distance, 0),
      paceSecPerKm: weightedPace(now),
      previousPaceSecPerKm: comparable ? weightedPace(before) : null,
    });
  }
  return {
    rows,
    intervalsLeftOut: current.filter(
      (r) => runKindOf(r.activityType) === "intervals"
    ).length,
  };
}

/** The distances best efforts are kept for, in kilometres: the ones a
 *  run's post can call the fastest yet. */
export const BEST_EFFORT_KM = FASTEST_EFFORT_METERS.map((m) => m / 1000);

export interface Effort {
  seconds: number;
  runId: string;
  /** Local "YYYY-MM-DD" of the run. */
  date: string;
}

export interface BestEffortRow {
  km: number;
  /** The fastest in the range, if a run in it went this far. */
  inRange: Effort | null;
  /** The fastest ever. */
  allTime: Effort;
}

/**
 * For each distance a run has timed, the fastest in the range and the
 * fastest ever. A tie keeps the run that set it first, as the lift
 * records do.
 */
export function bestEfforts(
  runs: readonly InsightRun[],
  window: Window
): BestEffortRow[] {
  const eligible = runs
    .filter((r) => isPaceEligible(r) && runEvidenceDate(r) <= window.todayKey)
    .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
  const rows: BestEffortRow[] = [];
  for (const km of BEST_EFFORT_KM) {
    let allTime: Effort | null = null;
    let inRange: Effort | null = null;
    for (const run of eligible) {
      const seconds = runEffortSeconds(run, km * 1000);
      if (seconds === null) continue;
      const effort = { seconds, runId: run.id, date: runEvidenceDate(run) };
      if (!allTime || seconds < allTime.seconds) allTime = effort;
      if (within(run, window) && (!inRange || seconds < inRange.seconds)) {
        inRange = effort;
      }
    }
    if (allTime) rows.push({ km, inRange, allTime });
  }
  return rows;
}

/** The longest run in the range that counts toward distance. */
export function longestRunIn(
  runs: readonly InsightRun[],
  window: Window
): { distanceM: number; runId: string; date: string } | null {
  let longest: InsightRun | null = null;
  for (const run of runs) {
    if (!isVolumeEligible(run) || !within(run, window)) continue;
    if (!longest || run.distance > longest.distance) longest = run;
  }
  return longest
    ? {
        distanceM: longest.distance,
        runId: longest.id,
        date: runEvidenceDate(longest),
      }
    : null;
}

export interface RunningPageInsight {
  pace: { rows: PaceByKindRow[]; intervalsLeftOut: number };
  efforts: BestEffortRow[];
  longest: { distanceM: number; runId: string; date: string } | null;
  /** Seconds on the move in the range. */
  seconds: number;
  /** Metres in the range's usual week (or month), or null. */
  averageM: number | null;
}

/**
 * Everything the Running page reads from a user's runs, in one place.
 *
 * `allRuns` is the one-shot read of every run; `windowRuns` the live
 * listener on the range, replacing that date span from the older read.
 * This includes additions and edits without resurrecting deleted runs. Anything that says "ever", or needs the
 * user's first run, waits for `allRunsKnown`: until then the window's
 * runs are all there is, and best efforts built from them would call the
 * range's best the best ever (a 56:56 long-run 10K, "New best", with a
 * 48:48 10K race a month before it). A failed read leaves those out
 * rather than wrong.
 */
export function runningPageInsight({
  windowRuns,
  allRuns,
  allRunsKnown,
  sinceKey,
  prevSinceKey,
  todayKey,
  bins,
}: {
  windowRuns: readonly InsightRun[];
  allRuns: readonly InsightRun[];
  allRunsKnown: boolean;
  sinceKey: string;
  prevSinceKey: string;
  todayKey: string;
  bins: readonly SummaryBin[];
}): RunningPageInsight {
  // The live window is the current list for this span, not a patch. Keeping
  // absent IDs from the older read would bring deleted runs back into totals
  // and records even after the distance chart has removed them.
  const byId = new Map(
    allRuns.filter((r) => runEvidenceDate(r) < sinceKey).map((r) => [r.id, r])
  );
  for (const r of windowRuns) byId.set(r.id, r);
  const runs = [...byId.values()];
  let firstRunKey: string | null = null;
  let seconds = 0;
  for (const r of runs) {
    if (!isVolumeEligible(r)) continue;
    const key = runEvidenceDate(r);
    if (!firstRunKey || key < firstRunKey) firstRunKey = key;
    if (key >= sinceKey && key <= todayKey) seconds += r.duration;
  }
  const span = { sinceKey, todayKey };
  return {
    pace: paceByRunKind(runs, { sinceKey, prevSinceKey, todayKey }),
    efforts: allRunsKnown ? bestEfforts(runs, span) : [],
    longest: longestRunIn(runs, span),
    seconds,
    averageM: allRunsKnown
      ? usualBinAmount(bins, (b) => b.distanceM, {
          sinceKey,
          firstSessionKey: firstRunKey,
        })
      : null,
  };
}
