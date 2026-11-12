import type { ProgramExercise } from "./programTypes";

/**
 * A day of a plan someone has that runs well past the session length it was
 * fitted to (slice 4 of `docs/training-deep-dive-2026-11/build-plan.md`;
 * the deep dive's decision 5, taken as "ask"). Train says so under the day's
 * card and offers to rebuild the lift days for the length, or to keep the
 * day as it is.
 *
 * A re-fit of a plan someone has only cuts sets, never a lift (Lift4 (5)),
 * so a day the person filled with lifts can price at twice its length with
 * nothing on screen saying so: the owner's 12-lift Pull A priced at 93 to
 * 99 minutes against 45.
 */

/** How far past its length a day runs before Train says so: past a
 *  quarter, so a day a few minutes long never raises it. */
export const OUTGROWN_SHARE = 1.25;

/** Whether a day priced at `minutes` has outgrown `length`, the session
 *  length its plan is fitted to. A plan fitted to no length never has. */
export function hasOutgrown(
  minutes: number,
  length: number | null | undefined
): boolean {
  return (
    typeof length === "number" &&
    Number.isFinite(length) &&
    length > 0 &&
    minutes > length * OUTGROWN_SHARE
  );
}

/**
 * The day as it stands, for "Keep this day": its name, its lifts' slots
 * in order, and the length. Any change to one brings the notice back, so a
 * day kept long is not kept after it grows again or the length moves.
 */
export function outgrownDayKey(
  day: {
    dayName: string;
    exercises: ReadonlyArray<
      Pick<ProgramExercise, "instanceId" | "exerciseId">
    >;
  },
  length: number
): string {
  const slots = day.exercises.map((ex) => ex.instanceId ?? ex.exerciseId);
  return `${String(length)}|${day.dayName}|${slots.join(",")}`;
}
