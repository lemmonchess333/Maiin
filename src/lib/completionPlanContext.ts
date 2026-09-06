import type { ProgramState } from "@/features/program/programTypes";
import { blockWeekOf, focusLabel } from "@/features/program/trainingBlock";

/** Lift sessions are rotation-ordered, not date-bound (ADR-0002). */
export function liftCompletionContext(
  state: ProgramState,
  completedIndex: number,
  today: string
) {
  const block = state.trainingBlock;
  const blockWeek = block ? blockWeekOf(block, today) : null;
  const week =
    block && blockWeek !== null
      ? `Week ${blockWeek} of ${block.durationWeeks} · ${focusLabel(block.focus)}`
      : `Week ${((state.weekNumber - 1) % 4) + 1} of 4`;
  const done = state.workouts.filter(
    (day, index) => day.completed || index === completedIndex
  ).length;
  const available = state.workouts
    .map((day, index) => ({ day, index }))
    .filter(
      ({ day, index }) =>
        index !== completedIndex && !day.completed && !day.skipped
    );
  const next =
    available.find(({ index }) => index === state.nextWorkoutOverride) ??
    available[0];
  return {
    progress: `${week} · ${done} of ${state.workouts.length} planned lifts complete`,
    next: next
      ? `Next: ${next.day.dayName}`
      : "All planned lifts complete — review your week on Program",
  };
}
