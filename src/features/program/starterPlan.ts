import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
  weekPosition,
} from "@/lib/dateHelpers";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import {
  RUN_WALK_TEMPLATE_IDS,
  STARTER_NONSTOP_TEMPLATE_IDS,
} from "@/lib/workoutTemplates";

/**
 * The starter goal (Run9's reopening): a new runner's plan to 30 minutes
 * without stopping, a week at each stage. Run20's run-walk ladder gives the
 * first six, ending on 20 minutes non-stop; then a week each of 20, 25 and
 * 30 minutes non-stop. It ends where NHS Couch to 5K ends, and like it can
 * take longer than nine weeks: a stage moves on only once its week was done,
 * so the end has no date.
 *
 * What a week moving on does with the stage is here, as pure functions of
 * the stage and the days the runner's saved runs fall on. Placing a week's
 * runs is `scheduleStarterWeek` in `runScheduler.ts`.
 */
export const STARTER_STAGE_TEMPLATE_IDS = [
  ...RUN_WALK_TEMPLATE_IDS,
  ...STARTER_NONSTOP_TEMPLATE_IDS,
] as const;

/** Stages in the starter goal: nine, so about nine weeks. */
export const STARTER_STAGES = STARTER_STAGE_TEMPLATE_IDS.length;

/**
 * Saved runs in a week that make it done, the stage then moving on. Two of
 * three planned is enough; with two a week, both. Any saved run counts, one
 * outside the plan included: the runner ran.
 */
export const STARTER_RUNS_FOR_A_DONE_WEEK = 2;

/** The most runs a starter week plans: two or three, three by default. */
export const STARTER_MOST_RUNS_A_WEEK = 3;

/**
 * Weeks in a row without a run after which the stage steps back one. A
 * shorter gap holds it: the week repeats until it is done.
 */
export const STARTER_STEP_BACK_EMPTY_WEEKS = 3;

/** A stage held to the ladder, 1 to `STARTER_STAGES`. */
export function clampStarterStage(stage: number): number {
  if (!Number.isFinite(stage)) return 1;
  return Math.min(STARTER_STAGES, Math.max(1, Math.trunc(stage)));
}

/** The session every run in a stage's week takes. */
export function starterTemplateId(stage: number): string {
  return STARTER_STAGE_TEMPLATE_IDS[clampStarterStage(stage) - 1];
}

/** The week key `weeks` weeks after `weekKey` (before it when negative). */
function weekKeyAfter(weekKey: string, weeks: number): string {
  return localWeekKey(addLocalDays(parseLocalDate(weekKey), weeks * 7));
}

/** How many of the run days fall in the week starting `weekKey`. */
export function runsInWeek(
  runDays: readonly string[],
  weekKey: string
): number {
  const end = localDateString(addLocalDays(parseLocalDate(weekKey), 7));
  return runDays.filter((day) => day >= weekKey && day < end).length;
}

/** Whether the week starting `weekKey` was done (`STARTER_RUNS_FOR_A_DONE_WEEK`). */
export function starterWeekDone(
  runDays: readonly string[],
  weekKey: string
): boolean {
  return runsInWeek(runDays, weekKey) >= STARTER_RUNS_FOR_A_DONE_WEEK;
}

/**
 * The weeks in a row with no run, ending with the week starting `weekKey`:
 * 0 when that week has one. Counted no further than one past the step-back
 * gap, which is as far as anything asks.
 */
export function emptyWeeksEndingWith(
  runDays: readonly string[],
  weekKey: string
): number {
  let empty = 0;
  while (
    empty <= STARTER_STEP_BACK_EMPTY_WEEKS &&
    runsInWeek(runDays, weekKeyAfter(weekKey, -empty)) === 0
  ) {
    empty++;
  }
  return empty;
}

/** Where the starter stands once the week left behind is weighed. */
export type StarterStep =
  { finished: false; stage: number } | { finished: true; stage: number };

/**
 * The stage for the week after the one starting `weekLeft`, given the days
 * the runner's saved runs fall on. A done week moves the stage on, and the
 * last stage's done week finishes the goal. A week not done repeats the
 * stage, except that the week completing a gap of
 * `STARTER_STEP_BACK_EMPTY_WEEKS` with no run steps it back one: once for a
 * gap, however long it grows, and never below the first.
 *
 * `runDays` null means the runs could not be read: the stage holds, rather
 * than be weighed against a week that looks empty and isn't.
 *
 * The days are the most recent saved runs (`fetchRecentLayoff`'s window).
 * A week weighed is never older than the weeks since the plan last moved,
 * so the window holds it unless more runs were saved since than it reads.
 */
export function nextStarterStage(
  stage: number,
  weekLeft: string,
  runDays: readonly string[] | null
): StarterStep {
  const current = clampStarterStage(stage);
  if (!runDays) return { finished: false, stage: current };
  if (starterWeekDone(runDays, weekLeft)) {
    return current >= STARTER_STAGES
      ? { finished: true, stage: current }
      : { finished: false, stage: current + 1 };
  }
  if (
    emptyWeeksEndingWith(runDays, weekLeft) === STARTER_STEP_BACK_EMPTY_WEEKS
  ) {
    return { finished: false, stage: Math.max(1, current - 1) };
  }
  return { finished: false, stage: current };
}

/**
 * The weekdays a starter week plans its runs on: the schedule's run days
 * (a run day, or a day of both), as a race plan's are, up to
 * `STARTER_MOST_RUNS_A_WEEK`. With more run days than that, the ones with
 * the most rest between them, the week taken round from Sunday to Monday;
 * then the most without a lift; then the earliest in the week.
 */
export function starterRunSlots(
  weekSchedule: readonly ScheduleDay[]
): number[] {
  const slots = weekSchedule
    .filter((d) => d.type === "run" || d.type === "both")
    .map((d) => d.day)
    .filter((day, i, all) => all.indexOf(day) === i)
    .sort((a, b) => weekPosition(a) - weekPosition(b));
  if (slots.length <= STARTER_MOST_RUNS_A_WEEK) return slots;
  const runOnly = new Set(
    weekSchedule.filter((d) => d.type === "run").map((d) => d.day)
  );
  const smallestGap = (pick: number[]): number => {
    const at = pick.map(weekPosition);
    return Math.min(
      ...at.map((p, i) => (i + 1 < at.length ? at[i + 1] - p : at[0] + 7 - p))
    );
  };
  const withoutLift = (pick: number[]) =>
    pick.filter((d) => runOnly.has(d)).length;
  // Every three, in week order, so the first of equals is the earliest.
  const picks: number[][] = [];
  for (let i = 0; i < slots.length; i++)
    for (let j = i + 1; j < slots.length; j++)
      for (let k = j + 1; k < slots.length; k++)
        picks.push([slots[i], slots[j], slots[k]]);
  return picks.reduce((best, pick) => {
    const gap = smallestGap(pick) - smallestGap(best);
    return gap > 0 || (gap === 0 && withoutLift(pick) > withoutLift(best))
      ? pick
      : best;
  });
}

/**
 * The day a new runner's first weeks end (`newRunnerUntil`), for a starter
 * at `stage` in the week starting `weekKey`. A race plan made from here
 * builds from where the starter reached rather than from the calendar:
 * Run20 counts run-walk weeks back from this day and then adds five minutes
 * a week, so the stage's week lines up with Run20's week of the same
 * running: the first six with the ladder's six, the seventh (20 minutes
 * again) with the ladder's last, the eighth with 25 minutes and the ninth
 * with 30. For a finished starter, `weekKey` is the week it finished, and
 * the weeks after it build on from 30 minutes.
 */
export function starterNewRunnerUntil(stage: number, weekKey: string): string {
  const at = clampStarterStage(stage);
  const ladder = RUN_WALK_TEMPLATE_IDS.length;
  // Weeks from this one to the day Run20's first weeks end: one for the
  // ladder's last week, none for the first week after it.
  const weeksToEnd = at <= ladder ? ladder + 1 - at : ladder + 2 - at;
  return weekKeyAfter(weekKey, weeksToEnd);
}
