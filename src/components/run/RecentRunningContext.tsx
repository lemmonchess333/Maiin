import { useRunningStats } from "@/hooks/useRunningStats";
import { recentRunningContext } from "@/lib/recentRunningContext";
import Button from "@/components/ui/Button";

export default function RecentRunningContext({
  onUse,
}: {
  onUse?: (context: ReturnType<typeof recentRunningContext>) => void;
} = {}) {
  const { runs, loading, failed, refresh } = useRunningStats(28);
  const context = recentRunningContext(runs, new Date());
  return (
    /* The house disclosure's +/− (PurposeDisclosure). A flex summary loses
       the browser's own triangle, so with no marker of its own "Recent
       running" read as a heading with nothing under it. */
    <details className="group text-xs text-muted-foreground">
      <summary className="min-h-11 cursor-pointer flex items-center gap-2 rounded-lg text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 list-none before:content-['+'] group-open:before:content-['−']">
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
            {onUse && (
              <Button variant="outline" onClick={() => onUse(context)}>
                Use these numbers in my draft
              </Button>
            )}
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
