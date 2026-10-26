import type { ProgramState } from "@/features/program/programTypes";
import { nextUpIndex } from "@/features/program/nextUpCursor";
import { liftDayNameIn } from "@/lib/liftDayLabel";

/** The line under Done on the finish screen: which lift comes next. The
 *  week's count is the "Your week so far" card under it, so it is not
 *  said twice. Lift sessions are rotation-ordered, not date-bound
 *  (ADR-0002). */
export function liftCompletionContext(
  state: ProgramState,
  completedIndex: number
) {
  // Passing over the session just finished: the plan may not show it done.
  const nextIndex = nextUpIndex(state, completedIndex);
  const next = state.workouts[nextIndex];
  return {
    next: next
      ? `Next: ${liftDayNameIn(
          state.workouts.map((w) => w.dayName),
          nextIndex,
          next.dayName
        )}`
      : "All planned lifts complete. Review your week on Train.",
  };
}
