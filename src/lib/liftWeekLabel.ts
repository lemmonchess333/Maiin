import type { ProgramState } from "@/features/program/programTypes";
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
 * Train's week label for a lifting plan: "Week 2 of 8 · Get stronger" in a
 * training block, "Week 3 of 4 · Build muscle" in the plain cycle. The
 * focus takes Settings' names (`focusLabel`) in both, so one setting has
 * one name on Train whether or not a block runs. Block dates never replace
 * the engine's week counter.
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
  return `Week ${cycleWeek(state.weekNumber)} of 4 · ${state.currentPhase === "deload" ? "Deload" : focusLabel(state.primaryGoal ?? "general")}`;
}
