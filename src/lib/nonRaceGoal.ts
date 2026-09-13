import { localDateString, localWeekKey } from "./dateHelpers";
import { isVolumeEligible, type RunRecord } from "./runStatsEligibility";
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

export function nonRaceGoalProgress(
  goal: NonRaceGoal,
  runs: readonly GoalRun[],
  now: Date
) {
  const start = localWeekKey(now);
  const seen = new Set<string>();
  const eligible = runs.filter((run) => {
    if (
      seen.has(run.id) ||
      !isVolumeEligible(run) ||
      !Number.isFinite(run.completedAt.getTime()) ||
      run.completedAt > now ||
      !Number.isFinite(run.duration) ||
      run.duration <= 0 ||
      runEvidenceDate(run) < start ||
      runEvidenceDate(run) > localDateString(now)
    )
      return false;
    seen.add(run.id);
    return true;
  });
  const current =
    goal.kind === "runs"
      ? eligible.length
      : Math.floor(eligible.reduce((sum, run) => sum + run.duration / 60, 0));
  return { current, target: goal.target, complete: current >= goal.target };
}
