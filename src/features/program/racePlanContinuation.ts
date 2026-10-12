import type {
  ManualCompletion,
  RunPlan,
  ScheduledRunDay,
} from "./programTypes";
import { getScheduledRunStatus } from "@/lib/scheduledRunStatus";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";

/** Availability and tuning edits do not start a new block for the same race. */
export function continuingRacePlan(
  existing: RunPlan | null | undefined,
  goal: { distance: string; targetDate: string }
): RunPlan | undefined {
  return existing?.mode === "race_prep" &&
    existing.raceGoal?.distance === goal.distance &&
    existing.raceGoal.targetDate === goal.targetDate
    ? existing
    : undefined;
}

export function continuedBlockWeeks(
  remainingWeeks: number,
  plan: RunPlan | undefined
): number {
  return typeof plan?.totalWeeks === "number" &&
    Number.isFinite(plan.totalWeeks)
    ? Math.max(remainingWeeks, plan.totalWeeks)
    : remainingWeeks;
}

/** Keep the actual sessions the runner has already resolved or explicitly
 * changed. A moved session reserves its original slot as well as its date,
 * so rebuilding cannot quietly add its old slot back as extra training. */
export function preserveEditedRunDays(
  previous: readonly ScheduledRunDay[],
  generated: readonly ScheduledRunDay[],
  manualCompletions: Record<string, ManualCompletion> | undefined,
  today: string
): ScheduledRunDay[] {
  const retained = previous.filter(
    (run) =>
      getScheduledRunStatus(run) !== "planned" ||
      run.userOverride ||
      run.movedFromDate ||
      (run.id && manualCompletions?.[run.id]) ||
      (run.date && run.date < today)
  );
  const reserved = new Set(
    retained.flatMap((run) => [run.date, run.movedFromDate]).filter(Boolean)
  );
  return [
    ...generated.filter((run) => !reserved.has(run.date)),
    ...retained,
  ].sort(
    (a, b) =>
      (a.date ?? "").localeCompare(b.date ?? "") || a.dayIndex - b.dayIndex
  );
}

/**
 * The run days a plan saves for the week it is made in (Run19): the
 * generated week from today on, over a continuing plan's kept days
 * (`preserveEditedRunDays`). A plan made mid-week plans no run before the
 * day it is made. The days already gone weren't planned, and dating a run
 * on one wrote history the person never had: a missed run on Home and
 * Train, and a week's count they were behind on from the start. The save
 * and the Settings preview both build the week here, so the preview shows
 * what is saved.
 */
export function planWeekFromToday(
  generated: readonly ScheduledRunDay[],
  today: string,
  kept?: {
    runDays: readonly ScheduledRunDay[];
    manualCompletions?: Record<string, ManualCompletion>;
  }
): ScheduledRunDay[] {
  const fromToday = generated.filter((run) => !run.date || run.date >= today);
  return kept
    ? preserveEditedRunDays(
        kept.runDays,
        fromToday,
        kept.manualCompletions,
        today
      )
    : fromToday;
}

/** Where a race plan's week is built from: the day its runs are planned
 *  from, and the Monday of its week. */
export interface RaceWeekStart {
  currentDate: string;
  weekStart: string;
}

/**
 * A race plan's week from today (Run19), built by `generate`, the
 * generator as the caller runs it: the plan as from `week`, its first week
 * cut to the days from `today` over any days `kept` (`planWeekFromToday`).
 *
 * When no run day is left in the week (a plan made on the Sunday after a
 * Saturday long run), the plan starts on next week's runs instead, as a
 * plan made that Monday has them. A week saved with no runs gave the
 * rollover, which moves a race plan on from its runs' week
 * (`weekRolloverAnchor`), nothing to move on from, and the plan never
 * planned a run again. The lifts are on a long first week meanwhile: the
 * rollover moves them with the runs, from the Monday after.
 */
export function raceWeekFromToday<P extends { weeks: ScheduledRunDay[][] }>(
  generate: (from: RaceWeekStart) => P,
  week: RaceWeekStart,
  today: string,
  kept?: {
    runDays: readonly ScheduledRunDay[];
    manualCompletions?: Record<string, ManualCompletion>;
  }
): { plan: P; runDays: ScheduledRunDay[]; weekStart: string } {
  const plan = generate(week);
  const generated = plan.weeks[0] ?? [];
  const runDays = planWeekFromToday(generated, today, kept);
  if (runDays.length > 0 || generated.length === 0)
    return { plan, runDays, weekStart: week.weekStart };
  const nextWeek = localDateString(
    addLocalDays(parseLocalDate(week.weekStart), 7)
  );
  const next = generate({ currentDate: nextWeek, weekStart: nextWeek });
  return { plan: next, runDays: next.weeks[0] ?? [], weekStart: nextWeek };
}

/**
 * A week rebuilt by a change to its layout (Run19): the days already gone
 * stay as they were, and the rebuilt week runs from today. Unlike the
 * plan's save (`planWeekFromToday`), nothing from today on is kept: the new
 * layout decides those days, and the person's swaps follow them by weekday.
 * A day from an earlier week isn't this week's.
 */
export function rebuiltWeekFromToday(
  previous: readonly ScheduledRunDay[],
  rebuilt: readonly ScheduledRunDay[],
  today: string,
  weekStart: string
): ScheduledRunDay[] {
  return [
    ...previous.filter(
      (run) => run.date && run.date >= weekStart && run.date < today
    ),
    ...rebuilt.filter((run) => !run.date || run.date >= today),
  ].sort(
    (a, b) =>
      (a.date ?? "").localeCompare(b.date ?? "") || a.dayIndex - b.dayIndex
  );
}
