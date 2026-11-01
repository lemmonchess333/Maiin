import type { RunningBaseline } from "./runningBaseline";

/* The run plan editor's starting points, beside the plan's own module
   rather than in it, so the scheduler's chunk doesn't carry them. */

/** A starting point to answer from, in the run plan editor: no running
 *  given yet. Left blank, it is no starting point. */
export function blankRunningStart(
  experience: Exclude<RunningBaseline["experience"], "new">,
  today: string
): RunningBaseline {
  return {
    version: 1,
    experience,
    weeklyMinutes: 0,
    longestRunMinutes: 0,
    confirmedAt: today,
    source: "self_reported",
  };
}

/**
 * A starting point from the runs recorded in the last four weeks
 * (`recentRunningContext`), or null with none. The weekly minutes are the
 * four weeks' average, at least the longest run: a week that held the
 * longest run held at least that much, and someone who ran once in four
 * weeks still ran that run. Both are whole minutes, at least the ten the
 * shortest timed run takes.
 */
export function baselineFromRecentRunning(
  context: {
    count: number;
    averageWeeklyMinutes: number;
    longestMinutes: number;
  },
  confirmedAt: string,
  experience: Exclude<RunningBaseline["experience"], "new">
): RunningBaseline | null {
  if (context.count <= 0 || !(context.longestMinutes > 0)) return null;
  const longest = Math.min(
    300,
    Math.max(10, Math.round(context.longestMinutes))
  );
  const weekly = Math.min(
    1200,
    Math.max(longest, Math.round(context.averageWeeklyMinutes))
  );
  return {
    version: 1,
    experience,
    weeklyMinutes: weekly,
    longestRunMinutes: longest,
    confirmedAt,
    source: "recorded",
  };
}
