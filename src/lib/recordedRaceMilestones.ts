import { localDateString, parseLocalDate } from "./dateHelpers";
import { raceSeconds } from "./runElapsed";
import { isVolumeEligible, type RunRecord } from "./runStatsEligibility";

/** Recorded race effort, never inferred from a planned race or recovery marker. */
export interface MilestoneRace {
  id: string;
  date: string;
  distanceMetres: number;
  durationSeconds: number;
}

/** Reuse the run documents already fetched for History's lifetime totals.
 *  A race's time is its elapsed time where the run has one (Run28 call 4
 *  and its STATUS), else its duration. */
export function recordedRaceMilestones(
  runs: readonly (RunRecord & { elapsedSeconds?: number })[]
): MilestoneRace[] {
  return runs.flatMap((run) => {
    // `completedRaces` contains recovery-effect dedupe IDs, not results.
    // A planned race attached to an easy/manual effort is not a race result.
    if (
      run.activityType !== "race" ||
      !run.id ||
      !run.date ||
      !/^\d{4}-\d{2}-\d{2}$/.test(run.date) ||
      localDateString(parseLocalDate(run.date)) !== run.date ||
      !isVolumeEligible(run) ||
      !Number.isFinite(run.distance) ||
      !Number.isFinite(run.duration)
    )
      return [];
    return [
      {
        id: run.id,
        date: run.date,
        distanceMetres: run.distance!,
        durationSeconds: raceSeconds(run.duration!, run.elapsedSeconds),
      },
    ];
  });
}
