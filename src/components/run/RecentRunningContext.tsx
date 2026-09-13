import { useRunningStats } from "@/hooks/useRunningStats";
import { recentRunningContext } from "@/lib/recentRunningContext";
import Button from "@/components/ui/Button";

export default function RecentRunningContext() {
  const { runs, loading, failed, refresh } = useRunningStats(28);
  const context = recentRunningContext(runs, new Date());
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="min-h-11 cursor-pointer flex items-center text-sm text-foreground">
        Recent running
      </summary>
      <div className="space-y-2 leading-relaxed pb-2">
        {loading ? (
          <p>Loading your recent runs…</p>
        ) : failed ? (
          <>
            <p>
              Your recent running could not be loaded. It has not been treated
              as zero training.
            </p>
            <Button variant="outline" onClick={refresh}>
              Try again
            </Button>
          </>
        ) : context.count === 0 ? (
          <p>
            No eligible runs are recorded here in the last four weeks. That does
            not tell us how much you have run elsewhere.
          </p>
        ) : (
          <>
            <p>
              Recorded in the last four weeks:{" "}
              <span className="font-mono tabular-nums">{context.count}</span>{" "}
              runs across{" "}
              <span className="font-mono tabular-nums">
                {context.activeWeeks}
              </span>{" "}
              weeks.
            </p>
            <p>
              Average:{" "}
              <span className="font-mono tabular-nums">
                {Math.round(context.averageWeeklyMinutes)}
              </span>{" "}
              min per week. Longest session:{" "}
              <span className="font-mono tabular-nums">
                {Math.round(context.longestMinutes)}
              </span>{" "}
              min.
            </p>
          </>
        )}
        <p>
          This includes eligible outdoor, treadmill and manually logged runs.
          Activity outside Tropos may be missing. Use it to review your
          available time and plan settings; it does not change your training
          automatically.
        </p>
      </div>
    </details>
  );
}
