import type { Experience, ProgramState } from "@/features/program/programTypes";
import { getRacePhaseLabel } from "@/features/program/runPlanTiming";
import { blockWeekOf, focusLabel } from "@/features/program/trainingBlock";
import {
  lighterWeeksScheduled,
  raceBlockWeek,
} from "@/features/program/weekPrescription";

type ProgrammeContext = Partial<
  Pick<
    ProgramState,
    | "weekNumber"
    | "currentPhase"
    | "primaryGoal"
    | "trainingBlock"
    | "workouts"
    | "runPlan"
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
 * A lifting plan's week counter outside a training block: the race block's
 * ("Week 6 of 16") while a race plan places the lighter weeks (Lift4 (9)),
 * the cycle's ("Week 3 of 4") where the calendar brings one every 4th week
 * (`lighterWeeksScheduled`), and the plan's own ("Week 7") otherwise, with
 * no cycle to count. Null for a week number the engine never writes.
 */
export function liftWeekCounter(
  state: ProgrammeContext,
  /** The person's level (`profile.experience`). */
  experience?: Experience
): string | null {
  const cycle = cycleWeek(state.weekNumber);
  if (cycle === null) return null;
  if (state.archived) return `Week ${state.weekNumber}`;
  const race = raceBlockWeek(state.runPlan);
  if (race) return `Week ${race.weekIndex + 1} of ${race.totalWeeks}`;
  return lighterWeeksScheduled(experience, state.workouts?.length ?? 0)
    ? `Week ${cycle} of 4`
    : `Week ${state.weekNumber}`;
}

/**
 * Train's week label for a lifting plan: the counter (above, or a training
 * block's "Week 2 of 8"), then what the week is. A lighter week reads as
 * one; with a race plan a week takes the run plan's phase name (Base,
 * Build, Taper, Race; Lift4 (3)); otherwise the focus, in Settings' names
 * (`focusLabel`), so one setting has one name on Train whether or not a
 * block runs. Block dates never replace the engine's week counter.
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
  const counter = liftWeekCounter(state, experience);
  if (counter === null) return null;
  const race = state.archived ? null : raceBlockWeek(state.runPlan);
  const what = lighter
    ? "Lighter week"
    : race
      ? getRacePhaseLabel(race.weekIndex, race.totalWeeks, race.distance)
      : focusLabel(state.primaryGoal ?? "general");
  return `${counter} · ${what}`;
}
