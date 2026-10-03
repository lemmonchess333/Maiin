import type { ProgramState } from "@/features/program/programTypes";
import { primaryGoalLabel } from "@/features/program/programEngine";
import { blockWeekOf, focusLabel } from "@/features/program/trainingBlock";

type ProgrammeContext = Partial<
  Pick<
    ProgramState,
    "weekNumber" | "currentPhase" | "primaryGoal" | "trainingBlock"
  >
>;

function cycleWeek(week: number | undefined): number | null {
  return week !== undefined && Number.isInteger(week) && week > 0
    ? ((week - 1) % 4) + 1
    : null;
}

/**
 * Train's week label for a lifting plan: "Week 2 of 8 · Strength" in a
 * training block, "Week 3 of 4 · Hypertrophy" in the plain cycle. One
 * display vocabulary; block dates never replace the engine's week counter.
 */
export function liftWeekLabel(
  state: ProgrammeContext | null | undefined,
  today: string
): string | null {
  if (!state) return null;
  const block = state.trainingBlock;
  const week = block ? blockWeekOf(block, today) : null;
  if (block && week !== null) {
    return `Week ${week} of ${block.durationWeeks} · ${focusLabel(block.focus)}`;
  }
  if (cycleWeek(state.weekNumber) === null) return null;
  return `Week ${cycleWeek(state.weekNumber)} of 4 · ${state.currentPhase === "deload" ? "Deload" : primaryGoalLabel(state.primaryGoal)}`;
}
