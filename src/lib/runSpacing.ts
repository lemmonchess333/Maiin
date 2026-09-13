import {
  HARD_RUN_TYPES,
  type ScheduledRunDay,
} from "@/features/program/programTypes";
import { addLocalDays, localDateString, parseLocalDate } from "./dateHelpers";
import { RUN_TEMPLATES, isScheduledRaceRunDay } from "./workoutTemplates";

/** The effective session can be easier than its original template. Race
 * identity remains authoritative even on legacy overridden race rows. */
export function isDemandingScheduledRun(run: ScheduledRunDay): boolean {
  if (run.status === "skipped" || run.status === "race_no_show") return false;
  if (isScheduledRaceRunDay(run)) return true;
  const effective = RUN_TEMPLATES.find(
    (template) => template.id === run.userOverride
  );
  return HARD_RUN_TYPES.has(effective?.type ?? run.type);
}

/** Actual neighbouring dates, not cyclic weekday indices. This also works
 * with carried rows from adjacent weeks and through daylight-saving changes. */
export function adjacentDemandingRuns(
  source: ScheduledRunDay,
  runDays: readonly ScheduledRunDay[],
  date = source.date
): ScheduledRunDay[] {
  if (!date || !isDemandingScheduledRun(source)) return [];
  const parsed = parseLocalDate(date);
  if (!Number.isFinite(parsed.getTime())) return [];
  const neighbours = new Set([
    localDateString(addLocalDays(parsed, -1)),
    localDateString(addLocalDays(parsed, 1)),
  ]);
  return runDays
    .filter(
      (run) =>
        run !== source &&
        (!source.id || run.id !== source.id) &&
        !!run.date &&
        neighbours.has(run.date) &&
        isDemandingScheduledRun(run)
    )
    .sort((a, b) => a.date!.localeCompare(b.date!));
}

/** A stale row from another week cannot occupy this calendar date. Undated
 * legacy rows retain their within-week weekday fallback. */
export function runOccupiesDate(
  run: ScheduledRunDay,
  date: string,
  dayIndex: number,
  weekKey: string
): boolean {
  return run.date
    ? run.date === date
    : (!run.weekKey || run.weekKey === weekKey) && run.dayIndex === dayIndex;
}
