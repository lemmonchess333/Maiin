import { localDateString, localWeekKey } from "./dateHelpers";
import type { RunRecord } from "./runStatsEligibility";
import { weekRunsThatCount } from "./trainingWeek";
import { runEvidenceDate } from "./runExecutionEvidence";

export type NonRaceGoal = { kind: "runs" | "minutes"; target: number };

/** The goal reads run facts without depending on an authenticated data hook. */
export interface GoalRun extends RunRecord {
  id: string;
  completedAt: Date;
  duration: number;
}

export function isNonRaceGoal(value: unknown): value is NonRaceGoal {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as NonRaceGoal;
  return (
    Number.isInteger(v.target) &&
    (v.kind === "runs"
      ? v.target >= 1 && v.target <= 7
      : v.kind === "minutes" && v.target >= 10 && v.target <= 1200)
  );
}

/**
 * This week's runs against a weekly goal: the runs that count, Monday to
 * Sunday, as every week counts them (`weekRunsThatCount`, trainingWeek.ts),
 * each on the day it began. A run is read once however often it is
 * listed, and one not yet finished, or with no finite time, is not read.
 */
export function nonRaceGoalProgress(
  goal: NonRaceGoal,
  runs: readonly GoalRun[],
  now: Date
) {
  const today = localDateString(now);
  const finished = runs.filter(
    (run) =>
      Number.isFinite(run.completedAt.getTime()) &&
      run.completedAt <= now &&
      Number.isFinite(run.duration) &&
      run.duration > 0
  );
  const seen = new Set<string>();
  const counted = weekRunsThatCount(
    localWeekKey(now),
    finished.map((run) => ({ ...run, day: runEvidenceDate(run) }))
  ).filter((run) => {
    if (run.day > today || seen.has(run.id)) return false;
    seen.add(run.id);
    return true;
  });
  const current =
    goal.kind === "runs"
      ? counted.length
      : Math.floor(counted.reduce((sum, run) => sum + run.duration / 60, 0));
  return { current, target: goal.target, complete: current >= goal.target };
}
