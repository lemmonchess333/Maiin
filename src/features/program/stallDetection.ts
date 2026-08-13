import { isBodyweightExerciseId } from "@/lib/exercises";

/**
 * The post-session "plateau detected" predicate.
 *
 * Extracted from `WorkoutSession.tsx` on 2026-08-04 because it was wrong in a
 * way nothing could catch: it lived inline in a component with no test file,
 * and it fired on the UNCALIBRATED sentinel. A lift that has never been given
 * a working weight logs `0` for every set, the old comparison joined those
 * into `"0,0,0"`, and a string equal to itself three times over is a textbook
 * stall — so a brand-new overhead press announced a 3-session plateau.
 *
 * That was not cosmetic. The modal it opens offers "+150 cal", and accepting
 * writes `customCalorieTarget` — the MANUAL-OVERRIDE flag that switches
 * adaptive TDEE off (`adaptiveTarget.ts` `isAdaptiveActive`,
 * `adaptiveStatus.ts`). A false positive therefore cost the user a Pro feature
 * silently, on the strength of a plateau that never happened.
 *
 * The discriminator is the exercise CLASS, taken from the catalogue id — never
 * from the load, because the load is exactly what is ambiguous:
 *
 *   bodyweight            0 kg IS the real load. Weight can never be the
 *                         signal; progress lives in the REP series.
 *   loaded, never loaded  0 kg is the uncalibrated sentinel. There is nothing
 *                         to plateau at yet. Both progression engines already
 *                         reach this conclusion (`programEngine.ts`'s
 *                         `isUncalibrated` early-return and its server mirror
 *                         in `functions/lib/progressionEngine.js`); this
 *                         detector was the only one that did not.
 *   loaded, calibrated    compare the weight series — the original behaviour.
 */

/** One logged set as persisted on a workout doc. */
export interface LoggedSet {
  weightKg?: number;
  reps?: number;
}

/** One logged exercise as persisted on a workout doc. */
export interface LoggedExercise {
  exerciseName: string;
  sets?: LoggedSet[];
}

export interface LoggedWorkout {
  exercises?: LoggedExercise[];
}

export interface StallCandidate {
  name: string;
  /** The catalogue id, so the caller never has to re-derive the class. */
  exerciseId: string;
}

export interface StallResult {
  name: string;
  /** Last logged working weight — 0 for a bodyweight lift, where it is real. */
  weight: number;
  isBodyweight: boolean;
}

/** How many consecutive identical sessions constitute a stall. */
export const STALL_SESSIONS = 3;

/**
 * Does this exercise's recent history show a stall worth surfacing?
 *
 * `history` is the user's recent workouts, newest first. Returns null unless
 * the lift has at least `STALL_SESSIONS` logged sessions AND the series that
 * can actually carry progress for its class held constant across them.
 */
export function detectStall(
  exercise: StallCandidate,
  history: readonly LoggedWorkout[]
): StallResult | null {
  const setsFor = (w: LoggedWorkout): LoggedSet[] =>
    (w.exercises ?? []).find((e) => e.exerciseName === exercise.name)?.sets ??
    [];

  const sessions = history
    .filter((w) =>
      (w.exercises ?? []).some((e) => e.exerciseName === exercise.name)
    )
    .slice(0, STALL_SESSIONS);

  if (sessions.length < STALL_SESSIONS) return null;

  const isBodyweight = isBodyweightExerciseId(exercise.exerciseId);

  // Uncalibrated: a LOADED lift that has never carried load. Not a stall.
  if (
    !isBodyweight &&
    !sessions.some((w) => setsFor(w).some((s) => (s.weightKg ?? 0) > 0))
  ) {
    return null;
  }

  // A session with no logged sets yields "" — treated as no signal rather
  // than as a match, so three empty sessions can't read as a stall either.
  const series = sessions.map((w) =>
    setsFor(w)
      .map((s) => (isBodyweight ? s.reps : s.weightKg))
      .join(",")
  );

  if (!series[0] || !series.every((s) => s === series[0])) return null;

  return {
    name: exercise.name,
    weight: setsFor(sessions[0])[0]?.weightKg ?? 0,
    isBodyweight,
  };
}

/**
 * localStorage key for the 3-week "don't re-offer this stall" cooldown.
 *
 * Built in two places — `StallModal` writes it, `WorkoutSession` reads it —
 * so it lives here rather than as a template literal at each end. It is also
 * uid-scoped, which it was not: exercise names are GLOBAL ("Bench Press"),
 * so on a shared device one account's cooldown suppressed the other's stall
 * prompt entirely. Same class as the offline + share queues in #820, and the
 * six dismissal sites `useDismissOnce` absorbed.
 */
export function stallCooldownKey(uid: string, exerciseName: string): string {
  return `${uid}:tropos_stall_${exerciseName}`;
}
