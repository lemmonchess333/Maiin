/**
 * The client half of the programme command boundary's WorkoutDayPrecondition.
 *
 * ── Why this module exists ───────────────────────────────────────────────
 *
 * It should have existed from the first migrated writer, and its absence
 * shipped a regression. Every workout-day command kind (`skipWorkoutDay`,
 * `setNextWorkout`, `logExercise`, `completeWorkoutDay`, the exercise
 * mutations) requires THREE precondition fields — `dayIndex`,
 * `expectedWeekNumber`, `expectedDaySignature` — and the server rejects the
 * command outright if any is missing. There was no client-side way to build
 * them, so the writers migrated in P6 sent a bare `dayIndex` and were rejected
 * every single time: the client rolled back, refetched, and the user's action
 * silently did nothing.
 *
 * Both test suites were green throughout. The client suite mocked the sender
 * (proving what was SENT), the functions suite hand-built commands (proving
 * what was ACCEPTED), and nothing joined them. The join now lives in
 * `useProgramWriters.test.ts`, whose mock runs the real validator.
 *
 * ── Why ONE function that returns all three ──────────────────────────────
 *
 * A bare `workoutDaySignature` export would have let the next writer send two
 * of the three fields and rediscover the same bug. The precondition is a unit:
 * it identifies a day AND asserts what the client believed about it. Returning
 * it whole is the difference between a helper and a guard rail.
 */

import type { ProgramState, WorkoutDay } from "./programTypes";

/** The three fields every workout-day command must carry. */
export interface WorkoutDayPrecondition {
  dayIndex: number;
  expectedWeekNumber: number;
  expectedDaySignature: string;
}

/**
 * Mirror of `workoutDaySignature` in functions/lib/programCommands.js — the
 * day's name joined with its exercise instance ids. Pinned against the server
 * copy by `programCommands.cross.test.ts`.
 *
 * The signature is what makes the command safe against a stale client: the
 * server recomputes it from ITS copy of the day and refuses the command if
 * they differ, so an edit aimed at a day whose exercises have since changed
 * fails loudly instead of applying to the wrong slots.
 */
export function workoutDaySignature(day: WorkoutDay | undefined): string {
  const exercises = day && Array.isArray(day.exercises) ? day.exercises : [];
  return [day?.dayName, ...exercises.map((ex) => ex?.instanceId)].join("|");
}

/**
 * Build the precondition for a day. Returns null when the day does not exist,
 * which callers should treat as "don't send" — a command naming a
 * non-existent day can only be rejected.
 */
export function workoutDayPrecondition(
  state: Pick<ProgramState, "weekNumber" | "workouts">,
  dayIndex: number
): WorkoutDayPrecondition | null {
  const day = state.workouts?.[dayIndex];
  if (!day) return null;
  return {
    dayIndex,
    expectedWeekNumber: state.weekNumber,
    expectedDaySignature: workoutDaySignature(day),
  };
}
