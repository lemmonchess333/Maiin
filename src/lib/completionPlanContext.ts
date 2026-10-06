import type { Experience, ProgramState } from "@/features/program/programTypes";
import { nextUpIndex } from "@/features/program/nextUpCursor";
import { blockWeekOf, focusLabel } from "@/features/program/trainingBlock";
import { liftDayLine } from "@/lib/liftDayLabel";
import { liftWeekCounter } from "@/lib/liftWeekLabel";

/** Lift sessions are rotation-ordered, not date-bound (ADR-0002). */
export function liftCompletionContext(
  state: ProgramState,
  completedIndex: number,
  today: string,
  /** The person's level, for the counter Train's week row shows
   *  (`liftWeekCounter`). */
  experience?: Experience
) {
  const block = state.trainingBlock;
  const blockWeek = block ? blockWeekOf(block, today) : null;
  const week =
    block && blockWeek !== null
      ? `Week ${blockWeek} of ${block.durationWeeks} · ${focusLabel(block.focus)}`
      : (liftWeekCounter(state, experience) ?? `Week ${state.weekNumber}`);
  const done = state.workouts.filter(
    (day, index) => day.completed || index === completedIndex
  ).length;
  // Passing over the session just finished: the plan may not show it done.
  const next = state.workouts[nextUpIndex(state, completedIndex)];
  return {
    progress: `${week} · ${done} of ${state.workouts.length} planned lifts complete`,
    next: next
      ? `Next: ${liftDayLine(next.dayName)}`
      : "All planned lifts complete — review your week on Train",
  };
}
