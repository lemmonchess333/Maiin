import type { Experience, ProgramState } from "@/features/program/programTypes";
import { blockWeekOf, focusLabel } from "@/features/program/trainingBlock";
import { lighterWeeksScheduled } from "@/features/program/weekPrescription";

type ProgrammeContext = Partial<
  Pick<
    ProgramState,
    "weekNumber" | "currentPhase" | "primaryGoal" | "trainingBlock" | "workouts"
  >
>;

function cycleWeek(week: number | undefined): number | null {
  return week !== undefined && Number.isInteger(week) && week > 0
    ? ((week - 1) % 4) + 1
    : null;
}

/**
 * Train's week label for a lifting plan: "Week 2 of 8 · Get stronger" in a
 * training block, "Week 3 of 4 · Build muscle" in a plan the calendar gives
 * lighter weeks (`lighterWeeksScheduled`), and "Week 7 · Build muscle"
 * otherwise, since such a plan has no cycle to count. A lighter week reads
 * as one. The focus takes Settings' names (`focusLabel`) everywhere, so one
 * setting has one name on Train whether or not a block runs. Block dates
 * never replace the engine's week counter.
 */
export function liftWeekLabel(
  state: ProgrammeContext | null | undefined,
  today: string,
  /** The person's level (`profile.experience`). */
  experience?: Experience
): string | null {
  if (!state) return null;
  const block = state.trainingBlock;
  const week = block ? blockWeekOf(block, today) : null;
  if (block && week !== null) {
    return `Week ${week} of ${block.durationWeeks} · ${focusLabel(block.focus)}`;
  }
  const cycle = cycleWeek(state.weekNumber);
  if (cycle === null) return null;
  const counter = lighterWeeksScheduled(experience, state.workouts?.length ?? 0)
    ? `Week ${cycle} of 4`
    : `Week ${state.weekNumber}`;
  const what =
    state.currentPhase === "deload"
      ? "Lighter week"
      : focusLabel(state.primaryGoal ?? "general");
  return `${counter} · ${what}`;
}
