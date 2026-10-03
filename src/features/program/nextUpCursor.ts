import type { ProgramState } from "./programTypes";

/**
 * The next-up cursor (ADR-0002): which of the week's workouts comes next.
 *
 * Lifts are split-ordered, so this is the programme's order, not the
 * calendar: the first workout neither done nor skipped, unless the person
 * chose another with "Make this next" (`nextWorkoutOverride`) and that one
 * is still to do. A chosen workout that has since been done or skipped, or
 * an override that names no workout, falls back to the order.
 *
 * Train's "Up next", Home's today card, its rest-day first workout,
 * tomorrow's line and the finish screen's "Next:" all read this, so they
 * name the same session.
 *
 * `passing` is a workout to pass over: the one just finished, while the
 * plan may not show it done yet, or today's, when naming tomorrow's.
 *
 * Returns the workout's index, or -1 when none is left to do.
 */
export function nextUpIndex(
  programme:
    | Pick<ProgramState, "workouts" | "nextWorkoutOverride">
    | null
    | undefined,
  passing?: number | null
): number {
  if (!programme?.workouts?.length) return -1;
  const { workouts, nextWorkoutOverride: chosen } = programme;
  const toDo = (index: number) => {
    const day = workouts[index];
    return !!day && !day.completed && !day.skipped && index !== passing;
  };
  if (typeof chosen === "number" && toDo(chosen)) return chosen;
  return workouts.findIndex((_, index) => toDo(index));
}
