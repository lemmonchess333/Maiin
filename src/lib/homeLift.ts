import type { WorkoutDay } from "@/features/program/programTypes";
import type { ResolvedLift } from "@/lib/trainingResolver";

/**
 * The lift Home's today card offers.
 *
 * Whether today is a lifting day comes from the week's schedule. Which
 * workout comes from the programme's order: the first one not yet done or
 * skipped, the one Train names "Up next" and starts. Lifts run in order
 * whatever the weekday (ADR-0002), so a calendar surface does not choose
 * the session. Picking it by weekday showed a new person who joined on a
 * Friday "Full Body Circuit D" while their plan and Train offered A, and
 * offered Monday's A again after A was done on Friday.
 *
 * A workout finished today stays on the card, done. When every workout
 * of the week is done or skipped, the weekday's own slot stands, which is
 * done or skipped too.
 */
export function resolveHomeLift({
  scheduled,
  workouts,
  sessionsToday,
}: {
  /** Today's lift as the week's schedule resolves it. */
  scheduled: ResolvedLift;
  /** The programme's workouts, in order. */
  workouts: readonly WorkoutDay[] | undefined;
  /** Ids of the sessions logged today. */
  sessionsToday: ReadonlySet<string>;
}): ResolvedLift {
  if (scheduled.index === null || !workouts?.length) return scheduled;

  const doneToday = workouts.findIndex(
    (w) =>
      w.completed &&
      !!w.completedWorkoutId &&
      sessionsToday.has(w.completedWorkoutId)
  );
  if (doneToday >= 0) return lift(doneToday, workouts[doneToday], "completed");

  const next = workouts.findIndex((w) => !w.completed && !w.skipped);
  if (next < 0) return scheduled;
  return lift(next, workouts[next], "planned");
}

function lift(
  index: number,
  workout: WorkoutDay,
  status: "planned" | "completed"
): ResolvedLift {
  return {
    index,
    workout,
    status,
    isTerminal: status === "completed",
    isStartable: status === "planned",
  };
}

/**
 * The workout a lift day tomorrow will offer: the next one after today's,
 * when today's is still to do, else the next one.
 */
export function nextLiftAfter(
  today: ResolvedLift,
  workouts: readonly WorkoutDay[] | undefined
): { index: number; workout: WorkoutDay } | null {
  if (!workouts?.length) return null;
  const skip = today.status === "planned" ? today.index : null;
  const index = workouts.findIndex(
    (w, i) => !w.completed && !w.skipped && i !== skip
  );
  return index >= 0 ? { index, workout: workouts[index] } : null;
}
