/**
 * Pgm8 R1 (owner-delegated): the runs a fitness benchmark may be
 * derived from. Efforts only: a race or a time trial, a tempo's work
 * segments, and since Run24 (4) an interval session's repeats; never an
 * easy, long, recovery, run-walk or free run.
 *
 * Before this, the best of a runner's first easy runs was read as a race (the
 * simulator's F17): 6.7–9.7 VDOT under the runner, and the run summary, which
 * reads a pending benchmark at once, then told them to slow down on most of
 * their easy and long runs. An easy run only shows the runner can go at least
 * that fast, so it bounds fitness from one side.
 *
 * What a run was is read from the run as it was saved:
 * - `activityType` is what was run. A planned session switched to another
 *   type at the start keeps the plan's template id (`savedRuns.ts`), so the
 *   template can't say; the type can.
 * - A race is a run started as one: the plan's race, or "Race" in the run
 *   chooser ("Race effort"), which is how a time trial or a parkrun is
 *   recorded (the app has no time-trial session). It is read whole.
 * - A tempo is read by its work segments (`workPortion`), its
 *   blocks without the warm-up and
 *   cool-down. One that recorded none, started from the chooser with no
 *   structure or resumed after the app closed, can't say which part was the
 *   tempo, so it sets nothing. Nor does a goal-pace tempo: its blocks were
 *   run at the race goal the plan pinned (A2), not at the runner's threshold.
 *   `vdotFromTempoPace` reads the work as threshold pace.
 * - Every effort is first an outdoor GPS run with valid figures
 *   (`isPaceEligible`): a typed treadmill distance never sets a benchmark.
 *
 * The benchmark the app derives (`useRunFitnessAutoDerive`), Pace Insight
 * (`usePaceInsight`) and the simulator all read efforts here, so they can't
 * drift apart.
 */
import type { BenchmarkEffort } from "./runPaces";
import { isPaceEligible } from "./runStatsEligibility";
import { isTimeTrialTemplateId } from "./workoutTemplates";

/** The shortest race read as a benchmark, metres: the 2 km floor the derive
 *  has always had. Under it, a race-equivalent VDOT means little. */
const MIN_RACE_METERS = 2000;

/** The least work a tempo must have covered to be read, seconds: half the
 *  20-minute block of the plan's shortest tempo. A Tropos heuristic: a block
 *  cut well short can be run faster than threshold, and would read as more
 *  fitness than the runner has. */
const MIN_TEMPO_WORK_SECONDS = 600;

/** The least repeat work an interval session must have covered to be read,
 *  seconds (Run24 (4)): the plan's shortest session, 8 x 400 m, at about
 *  90 seconds a repeat. A Tropos heuristic, as the tempo's is. */
const MIN_INTERVAL_WORK_SECONDS = 720;

/** What a saved run says about itself that decides whether it was an
 *  effort. A `SavedRun` carries all of it. */
export interface EffortRun {
  id?: string;
  /** Metres. */
  distance: number;
  /** Seconds. */
  duration: number;
  /** Seconds a kilometre. */
  avgPace: number;
  activityType?: string;
  /** "treadmill" for a run on one (Pgm8): its distance was typed, not
   *  measured, so it is never an effort (`isPaceEligible`). */
  place?: string | null;
  isInvalid?: boolean;
  savedAnyway?: boolean;
  completedAt?: Date | null;
  workPortion?: { seconds: number; meters: number } | null;
  workPacePinned?: boolean;
  /** What was run, as the saved run names it: a time trial is read by its
   *  work as a race (Run24 (4)). */
  templateId?: string;
}

/** The effort a run was, or null when it was none. */
export function benchmarkEffortOf(run: EffortRun): BenchmarkEffort | null {
  if (!isPaceEligible(run)) return null;
  const source = {
    ...(run.id ? { id: run.id } : {}),
    ...(run.completedAt ? { completedAt: run.completedAt } : {}),
  };
  // Run24 (4), deep dive D4: the plan's time trial, read by its one work
  // segment as a race over that distance; the warm-up and cool-down around
  // it are not the effort.
  if (isTimeTrialTemplateId(run.templateId)) {
    const work = run.workPortion;
    if (!work || !(work.meters >= MIN_RACE_METERS) || !(work.seconds > 0))
      return null;
    return {
      kind: "race",
      distanceM: work.meters,
      timeS: work.seconds,
      ...source,
    };
  }
  if (run.activityType === "race") {
    if (!(run.distance >= MIN_RACE_METERS) || !(run.duration > 0)) return null;
    return {
      kind: "race",
      distanceM: run.distance,
      timeS: run.duration,
      ...source,
    };
  }
  if (run.activityType === "tempo" && !run.workPacePinned) {
    const work = run.workPortion;
    if (
      !work ||
      !(work.seconds >= MIN_TEMPO_WORK_SECONDS) ||
      !(work.meters > 0)
    )
      return null;
    return {
      kind: "tempo",
      distanceM: work.meters,
      timeS: work.seconds,
      ...source,
    };
  }
  // Run24 (4), deep dive D4: an interval session by its repeats, read as
  // repeats at interval pace (`vdotFromIntervalPace`).
  if (run.activityType === "intervals" && !run.workPacePinned) {
    const work = run.workPortion;
    if (
      !work ||
      !(work.seconds >= MIN_INTERVAL_WORK_SECONDS) ||
      !(work.meters > 0)
    )
      return null;
    return {
      kind: "intervals",
      distanceM: work.meters,
      timeS: work.seconds,
      ...source,
    };
  }
  return null;
}

/** The efforts among `runs`, in their order. */
export function benchmarkEfforts(
  runs: readonly EffortRun[]
): BenchmarkEffort[] {
  const efforts: BenchmarkEffort[] = [];
  for (const run of runs) {
    const effort = benchmarkEffortOf(run);
    if (effort) efforts.push(effort);
  }
  return efforts;
}
