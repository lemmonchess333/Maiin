import { useLocalDateKey } from "@/hooks/useLocalDateKey";
import { Link } from "react-router-dom";
import type { RunSummaryItem } from "@/hooks/useRunningStats";
import {
  isNonRaceGoal,
  nonRaceGoalProgress,
  type NonRaceGoal,
} from "@/lib/nonRaceGoal";

export default function NonRaceGoalProgress({
  goal,
  runs,
  loading,
  failed,
}: {
  goal: NonRaceGoal | null | undefined;
  runs: RunSummaryItem[];
  loading: boolean;
  failed: boolean;
}) {
  useLocalDateKey();
  if (!isNonRaceGoal(goal)) return null;
  const progress = nonRaceGoalProgress(goal, runs, new Date());
  return (
    <div className="ds-card p-3 space-y-2" aria-label="Weekly running goal">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">This week’s goal</p>
        <Link
          to="/settings/run-plan"
          className="min-h-11 inline-flex items-center text-sm text-running-strong"
        >
          Edit goal
        </Link>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading your runs…</p>
      ) : failed ? (
        <p className="text-sm text-muted-foreground">
          Progress is unavailable. Your saved goal is unchanged.
        </p>
      ) : (
        <>
          <p className="text-sm">
            <span className="font-mono tabular-nums">
              {progress.current} / {progress.target}
            </span>{" "}
            {goal.kind === "runs" ? "runs" : "min"}
          </p>
          <progress
            aria-label="Weekly running goal progress"
            className="w-full h-2 accent-running"
            max={progress.target}
            value={Math.min(progress.current, progress.target)}
          />
          <p className="text-xs text-muted-foreground">
            {progress.complete
              ? "Goal reached for this week."
              : "Your logged runs count, including treadmill and manual entries."}
          </p>
        </>
      )}
    </div>
  );
}
