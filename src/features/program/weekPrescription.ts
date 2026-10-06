import {
  VALID_RACE_DISTANCE,
  type Experience,
  type ProgramState,
  type RaceDistance,
  type RunPlan,
  type WeeklyPrescription,
} from "./programTypes";
import { getPhaseForWeek, isRunStepBackWeek } from "./runPlanTiming";

/**
 * Where a week sits in the training cycle, apart from the generator
 * (`programEngine.ts`) so the surfaces that only read it (Home's session
 * line, the performance signals, Train's end-of-cycle badge) don't load
 * the plan builder with them.
 */

/**
 * The cycle position of a week: every 4th week is a lighter one. That is
 * the whole periodisation: no intensity ramp and no volume modifier ride
 * on it, because the sources don't support one: Schoenfeld p.193
 * (a systematic review of 12 studies finds no clear benefit to periodising
 * for hypertrophy; it is established for strength), p.194 (linear and
 * undulating come out equivalent across a meta-analysis and 8 primary
 * studies), Helms p.79 ("asking 'which type of periodization is the best?'
 * is the wrong question"). Computed on demand and never stored:
 * `advanceWeek` keeps only the `currentPhase` it derives.
 */
export function generateWeekPrescription(week: number): WeeklyPrescription {
  return { week, deload: week % LIGHTER_WEEK_EVERY === 0 };
}

/** The calendar's lighter week comes every 4th trained week (Lift4 (9)). */
export const LIGHTER_WEEK_EVERY = 4;

/**
 * A cycle ends on its lighter week: finishing that week finishes a 4-week
 * cycle (the `programme_complete` badge). Read from
 * `generateWeekPrescription`, so it can't drift from the schedule.
 */
export function isCycleEndWeek(week: number): boolean {
  return week > 0 && generateWeekPrescription(week).deload;
}

/**
 * Whether the calendar gives this plan lighter weeks (Lift4 (9)): an
 * intermediate or advanced lifter on three or more lift days. A beginner,
 * an unknown level (a beginner's) and a plan of one or two days get none;
 * anyone can still take one from Train.
 */
export function lighterWeeksScheduled(
  experience: Experience | undefined,
  liftDays: number
): boolean {
  return (
    (experience === "intermediate" || experience === "advanced") &&
    liftDays >= 3
  );
}

/**
 * The weeks of a return after a break (Lift4 (11)): the first, with one set
 * fewer, and the one after. No calendar lighter week comes in either.
 */
export const EASING_BACK_WEEKS = 2;

/** Whether this is the first week back after easing back in, which has its
 *  set fewer on every lift. */
export function firstWeekBack(
  state: Pick<ProgramState, "easingBack">
): boolean {
  return (state.easingBack?.weeksLeft ?? 0) >= EASING_BACK_WEEKS;
}

/**
 * Whether the person can take a lighter week now (Lift4 (9)): one at a
 * time, so not while this week is one or is the first week back after a
 * break, and never two in a row, so not when the week last trained was
 * one. Lighter weeks count trained weeks, as the calendar's do, so a week
 * with no session in between changes nothing. The server's command checks
 * the same (`applyDeloadWeekCommand`).
 */
export function lighterWeekAllowed(
  state: Pick<ProgramState, "currentPhase" | "weekHistory" | "easingBack">
): boolean {
  return (
    state.currentPhase !== "deload" &&
    !firstWeekBack(state) &&
    state.weekHistory?.at(-1)?.lighter !== true
  );
}

/** A week of a race block: where the run plan stands in it. */
export interface RaceBlockWeek {
  /** 0-based, as the run plan counts (`runPlan.currentWeek`). */
  weekIndex: number;
  totalWeeks: number;
  distance: RaceDistance;
}

/**
 * The week of the race block a plan's lighter weeks follow (Lift4 (9)): the
 * run plan's current week, while a race plan with its weeks counted runs.
 * Null without one, and in the recovery after the race, which has no block
 * left to follow.
 */
export function raceBlockWeek(
  runPlan: RunPlan | null | undefined
): RaceBlockWeek | null {
  if (!runPlan || runPlan.mode !== "race_prep") return null;
  if (runPlan.phase === "recovery") return null;
  const distance = VALID_RACE_DISTANCE.find(
    (d) => d === runPlan.raceGoal?.distance
  );
  const { currentWeek, totalWeeks } = runPlan;
  if (
    !distance ||
    typeof currentWeek !== "number" ||
    typeof totalWeeks !== "number" ||
    !Number.isInteger(currentWeek) ||
    currentWeek < 0 ||
    currentWeek >= totalWeeks
  ) {
    return null;
  }
  return { weekIndex: currentWeek, totalWeeks, distance };
}

/**
 * The race's weeks for the lifting (Lift4 (10)): a build week whose leg
 * lifts are trimmed (`build`, on a yes at race setup), the last two weeks
 * before the race (`taper`, lighter whatever the run plan's taper length),
 * race week (`race`, one short session with nothing heavy for the legs),
 * and the week after (`after`, light). The last three are the race's final
 * weeks: they replace the calendar lighter week, and its count starts again
 * after them.
 */
export type RaceLiftWeek = "build" | "taper" | "race" | "after";

/**
 * Which of the race's final weeks the week rolled into is, if any: from
 * where the run plan stands in it (`raceBlockWeek`), and which one the week
 * left was. The week after the race comes from the second, because logging
 * the race puts the run plan into its recovery, which has no block week, as
 * soon as the race is saved.
 */
export function raceLiftWeek(
  next: RaceBlockWeek | null | undefined,
  weekLeft: RaceLiftWeek | undefined
): Exclude<RaceLiftWeek, "build"> | null {
  if (next) {
    const toRace = next.totalWeeks - 1 - next.weekIndex;
    if (toRace === 0) return "race";
    if (toRace <= 2) return "taper";
  }
  return weekLeft === "race" ? "after" : null;
}

/** Whether a week of the race block is one of the run plan's build weeks,
 *  where a yes at race setup trims the leg lifts (Lift4 (10)). */
export function isRaceBuildWeek(
  week: RaceBlockWeek | null | undefined
): boolean {
  return (
    !!week &&
    getPhaseForWeek(week.weekIndex, week.totalWeeks, week.distance) === "build"
  );
}

/**
 * Whether the calendar makes a week a lighter one, before the rules on who
 * gets them and one at a time (Lift4 (9)): with a race plan, the run plan's
 * step-back weeks, so the lifting eases off when the running does; otherwise
 * every 4th trained week.
 */
export function calendarLighterWeek(
  weekNumber: number,
  race: RaceBlockWeek | null
): boolean {
  return race
    ? isRunStepBackWeek(race.weekIndex, race.totalWeeks, race.distance)
    : generateWeekPrescription(weekNumber).deload;
}
