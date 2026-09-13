import { addLocalDays, localDateString, parseLocalDate } from "./dateHelpers";
import { isVolumeEligible } from "./runStatsEligibility";
import type { RunSummaryItem } from "@/hooks/useRunningStats";
import { runEvidenceDate } from "./runExecutionEvidence";

/** Four rolling local seven-day windows, including today. This is recorded
 * workload, not a fitness score or a prescription of a safe increase. */
export function recentRunningContext(
  runs: readonly RunSummaryItem[],
  now: Date
) {
  const today = localDateString(now);
  const starts = [0, 1, 2, 3].map((index) =>
    localDateString(addLocalDays(parseLocalDate(today), -(index * 7 + 6)))
  );
  const seen = new Set<string>();
  const eligible = runs.filter((run) => {
    if (
      seen.has(run.id) ||
      !isVolumeEligible(run) ||
      !Number.isFinite(run.distance) ||
      !Number.isFinite(run.duration) ||
      !Number.isFinite(run.completedAt.getTime()) ||
      run.completedAt > now
    )
      return false;
    const date = runEvidenceDate(run);
    if (date < starts[3] || date > today) return false;
    seen.add(run.id);
    return true;
  });
  const windows = starts.map((start, index) => {
    const end =
      index === 0
        ? today
        : localDateString(addLocalDays(parseLocalDate(starts[index - 1]), -1));
    return eligible.filter((run) => {
      const date = runEvidenceDate(run);
      return date >= start && date <= end;
    });
  });
  return {
    count: eligible.length,
    activeWeeks: windows.filter((week) => week.length > 0).length,
    averageWeeklyMinutes:
      eligible.reduce((sum, run) => sum + run.duration / 60, 0) / 4,
    longestMinutes: Math.max(0, ...eligible.map((run) => run.duration / 60)),
    latestDate: eligible.map(runEvidenceDate).sort().at(-1) ?? null,
  };
}
