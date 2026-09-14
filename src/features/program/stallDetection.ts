import { isBodyweightExerciseId } from "@/lib/exercises";
import { isSetEligibleForProgression } from "./sessionSetPolicy";

/**
 * Programme's optional lifting-progress review. False positives matter:
 * its modal offers a manual calorie adjustment, which disables adaptive
 * calories. An uncalibrated zero load, a deliberate shorter session, or
 * progress in either reps or load cannot justify that prompt.
 *
 * Catalogue identity distinguishes real bodyweight zero from an uncalibrated
 * loaded exercise. Added load still counts as progress on weighted pull-ups.
 */

/** One logged set as persisted on a workout doc. */
export interface LoggedSet {
  weightKg?: number;
  reps?: number;
  type?: string;
  plannedReps?: number;
  plannedWeightKg?: number;
}

/** One logged exercise as persisted on a workout doc. */
export interface LoggedExercise {
  exerciseId?: string;
  exerciseName: string;
  sets?: LoggedSet[];
  plannedSetCount?: number;
}

export interface LoggedWorkout {
  exercises?: LoggedExercise[];
  sessionVariant?: string;
}

export interface StallCandidate {
  name: string;
  /** The catalogue id, so the caller never has to re-derive the class. */
  exerciseId: string;
}

export interface StallResult {
  name: string;
  /** A repeated working weight — 0 is valid for a bodyweight lift. */
  weight: number;
  isBodyweight: boolean;
}

/** How many consecutive identical sessions constitute a stall. */
export const STALL_SESSIONS = 3;

/**
 * Does this exercise's recent history show a stall worth surfacing?
 *
 * `history` is the user's recent workouts, newest first. Returns null unless
 * the lift's last `STALL_SESSIONS` occurrences contain comparable completed
 * working sets, with both load and reps unchanged. Known short/incomplete
 * sessions break the sequence; filtering them out would revive older advice.
 * Legacy records lacking target metadata retain their recorded working-set
 * comparison. They cannot establish why someone held a load.
 */
export function detectStall(
  exercise: StallCandidate,
  history: readonly LoggedWorkout[]
): StallResult | null {
  const sessions = history
    .flatMap((workout) => {
      const lift = (workout.exercises ?? []).find((entry) =>
        entry.exerciseId
          ? entry.exerciseId === exercise.exerciseId
          : entry.exerciseName === exercise.name
      );
      return lift ? [{ workout, lift }] : [];
    })
    .slice(0, STALL_SESSIONS);

  if (sessions.length < STALL_SESSIONS) return null;

  const workingSets = sessions.map(({ lift }) =>
    (lift.sets ?? []).filter((set) =>
      isSetEligibleForProgression(set.type ?? "working")
    )
  );
  if (
    sessions.some(({ workout, lift }, i) => {
      const sets = workingSets[i];
      return (
        (workout.sessionVariant != null && workout.sessionVariant !== "full") ||
        !sets.length ||
        sets.some(
          (set) =>
            !Number.isFinite(set.reps) ||
            (set.reps ?? 0) <= 0 ||
            !Number.isFinite(set.weightKg) ||
            (set.weightKg ?? -1) < 0
        ) ||
        (lift.plannedSetCount != null &&
          (!Number.isInteger(lift.plannedSetCount) ||
            lift.plannedSetCount <= 0 ||
            sets.length < lift.plannedSetCount))
      );
    })
  )
    return null;

  const isBodyweight = isBodyweightExerciseId(exercise.exerciseId);

  // Uncalibrated: a LOADED lift that has never carried load. Not a stall.
  if (
    !isBodyweight &&
    !workingSets.some((sets) => sets.some((s) => (s.weightKg ?? 0) > 0))
  ) {
    return null;
  }

  const series = workingSets.map((sets, i) =>
    JSON.stringify([
      sessions[i].lift.plannedSetCount ?? null,
      sets.map((set) => [
        set.weightKg,
        set.reps,
        set.plannedWeightKg ?? null,
        set.plannedReps ?? null,
      ]),
    ])
  );

  if (!series[0] || !series.every((s) => s === series[0])) return null;

  return {
    name: exercise.name,
    weight: workingSets[0][0].weightKg ?? 0,
    isBodyweight,
  };
}

/**
 * localStorage key for the 3-week "don't re-offer this stall" cooldown.
 *
 * Built in two places — `StallModal` writes it, `ProgramStallReview` reads it —
 * so it lives here rather than as a template literal at each end. It is also
 * uid-scoped, which it was not: exercise names are GLOBAL ("Bench Press"),
 * so on a shared device one account's cooldown suppressed the other's stall
 * prompt entirely. Same class as the offline + share queues in #820, and the
 * six dismissal sites `useDismissOnce` absorbed.
 */
export function stallCooldownKey(uid: string, exerciseName: string): string {
  return `${uid}:tropos_stall_${exerciseName}`;
}
