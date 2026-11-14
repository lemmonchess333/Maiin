import type { Experience, ProgramState } from "@/features/program/programTypes";
import { getRacePhaseLabel } from "@/features/program/runPlanTiming";
import { blockWeekOf, focusLabel } from "@/features/program/trainingBlock";
import {
  lighterWeeksScheduled,
  raceBlockWeek,
  type RaceBlockWeek,
} from "@/features/program/weekPrescription";
import { racePlanWeek } from "@/lib/racePlanWeek";
import type { PlanWeekFacts } from "@/lib/postMoments";

type ProgrammeContext = Partial<
  Pick<
    ProgramState,
    | "weekNumber"
    | "currentPhase"
    | "primaryGoal"
    | "trainingBlock"
    | "workouts"
    | "runPlan"
    | "raceWeek"
  >
> & {
  /** A week from the history, named by its own number: where it sat in a
   *  cycle, a block or a race block isn't kept. */
  archived?: boolean;
};

function cycleWeek(week: number | undefined): number | null {
  return week !== undefined && Number.isInteger(week) && week > 0
    ? ((week - 1) % 4) + 1
    : null;
}

/**
 * The race block's week, for Train to count and name the lifting week by,
 * while the run side counts the plan's week too (`racePlanWeek`): up to
 * and on race day. The run plan's counter stays on race week after it, so
 * past race day the block would read "Week 15 of 15" for as long as the
 * race waits for its ending. Then, as in the recovery, the lifting plan
 * counts its own weeks. Display only: the rollover reads the block itself.
 */
function raceBlockOnDisplay(
  state: ProgrammeContext,
  today: string
): RaceBlockWeek | null {
  const runPlan = state.runPlan;
  const week = racePlanWeek({
    raceGoal: runPlan?.raceGoal,
    runPlan,
    todayKey: today,
  });
  return week?.kind === "plan" ? raceBlockWeek(runPlan) : null;
}

/**
 * A lifting plan's week counter outside a training block: the race block's
 * ("Week 6 of 16") while a race plan places the lighter weeks (Lift4 (9))
 * and race day is still to come, the cycle's ("Week 3 of 4") where the
 * calendar brings one every 4th week (`lighterWeeksScheduled`), and the
 * plan's own ("Week 7") otherwise, with no cycle to count. Null for a week
 * number the engine never writes.
 */
export function liftWeekCounter(
  state: ProgrammeContext,
  /** Local "YYYY-MM-DD": the race block counts only up to race day. */
  today: string,
  /** The person's level (`profile.experience`). */
  experience?: Experience
): string | null {
  const cycle = cycleWeek(state.weekNumber);
  if (cycle === null) return null;
  if (state.archived) return `Week ${state.weekNumber}`;
  const race = raceBlockOnDisplay(state, today);
  if (race) return `Week ${race.weekIndex + 1} of ${race.totalWeeks}`;
  return lighterWeeksScheduled(experience, state.workouts?.length ?? 0)
    ? `Week ${cycle} of 4`
    : `Week ${state.weekNumber}`;
}

/**
 * The week of a lifting plan with a set length, as Train counts it: a
 * training block's ("Week 2 of 8"), else, while a race plan places the
 * lighter weeks, the race block's ("Week 6 of 16"). `ends` is true for a
 * block, whose last week ends the plan; the lifting carries on past race
 * week. Null for a plan with no length to count against: the 4-week cycle
 * starts again, and a plain counter ("Week 7") has no end. A post's "Week 4
 * of 12 done" reads it (Soc15).
 */
export function liftPlanWeek(
  state: ProgrammeContext | null | undefined,
  /** Local "YYYY-MM-DD": the day the lift counts on. */
  today: string
): { week: number; weeks: number; ends: boolean } | null {
  if (!state || state.archived) return null;
  const block = state.trainingBlock;
  const blockWeek = block ? blockWeekOf(block, today) : null;
  if (block && blockWeek !== null)
    return { week: blockWeek, weeks: block.durationWeeks, ends: true };
  const race = raceBlockOnDisplay(state, today);
  return race
    ? { week: race.weekIndex + 1, weeks: race.totalWeeks, ends: false }
    : null;
}

/** Every lift the week plans is done or skipped. */
function weekPlanDone(state: ProgrammeContext): boolean {
  const days = state.workouts ?? [];
  return days.length > 0 && days.every((day) => day.completed || day.skipped);
}

/**
 * What a lift saved into the plan did to its week, for the post: the
 * plan's set-length week (`liftPlanWeek`) and whether the lift was the
 * week's last planned session still to do. `before` is the plan the lift
 * was saved against, `after` the plan with its day marked done. Null for a
 * plan with no length.
 */
export function liftPlanFacts(
  before: ProgrammeContext,
  after: ProgrammeContext,
  today: string
): PlanWeekFacts | null {
  const week = liftPlanWeek(before, today);
  return week
    ? { ...week, weekDone: !weekPlanDone(before) && weekPlanDone(after) }
    : null;
}

/**
 * Train's week label for a lifting plan: the counter (above, or a training
 * block's "Week 2 of 8"), then what the week is. With a race plan a week
 * takes the run plan's phase name (Base, Build, Taper, Race; Lift4 (3)),
 * the week after the race is "Recovery", and a lighter week outside the
 * taper and race week reads as one; otherwise the focus, in Settings'
 * names (`focusLabel`), so one setting has one name on Train whether or
 * not a block runs. Block dates never replace the engine's week counter.
 */
export function liftWeekLabel(
  state: ProgrammeContext | null | undefined,
  today: string,
  /** The person's level (`profile.experience`). */
  experience?: Experience
): string | null {
  if (!state) return null;
  const lighter = state.currentPhase === "deload";
  const block = state.archived ? undefined : state.trainingBlock;
  const week = block ? blockWeekOf(block, today) : null;
  if (block && week !== null) {
    return `Week ${week} of ${block.durationWeeks} · ${lighter ? "Lighter week" : focusLabel(block.focus)}`;
  }
  const counter = liftWeekCounter(state, today, experience);
  if (counter === null) return null;
  const race = state.archived ? null : raceBlockOnDisplay(state, today);
  // Race week, once race day is behind it, is still race week for the
  // lifting: the block no longer names it, the week's own mark does.
  const phase = race
    ? getRacePhaseLabel(
        race.weekIndex,
        race.totalWeeks,
        race.distance,
        race.shortBase
      )
    : !state.archived && state.raceWeek === "race"
      ? "Race"
      : null;
  const what =
    !state.archived && state.raceWeek === "after"
      ? "Recovery"
      : lighter && phase !== "Taper" && phase !== "Race"
        ? "Lighter week"
        : (phase ?? focusLabel(state.primaryGoal ?? "general"));
  return `${counter} · ${what}`;
}
