import { normalizeExercise, type ProgramExercise } from "./programTypes";
import { repUnitForExerciseId } from "./repUnits";
import type { SavedRoutineExercise } from "@/lib/savedRoutines";

/**
 * A saved-routine exercise, projected into the `ProgramExercise` shape the
 * session runner and the workout-doc writer both consume.
 *
 * Lifted out of `src/pages/Routine.tsx`, where it was module-private and
 * therefore unreachable from any test — which is how it went the whole
 * feature's life without one, and how the `repUnit` gap below survived.
 */
export function exerciseFromRoutine(ex: SavedRoutineExercise): ProgramExercise {
  /* The saved routine snapshot only carries `setCount / targetReps /
     targetWeightKg` per exercise. Fill the rest of ProgramExercise's
     surface with safe defaults — the UI uses these for progression
     hints which don't apply to a one-off routine run, and for the
     workout-doc write which only consumes name / exerciseId / sets /
     reps / weight in practice. movementCategory is inferred from
     the exercise name via normalizeExercise → inferMovementCategory;
     the saved category flows into the workout doc and is read by
     analytics + MuscleHeatMap, so getting it right matters. */
  const exerciseId =
    ex.exerciseId || `routine-${ex.name.toLowerCase().replace(/\s+/g, "-")}`;
  return normalizeExercise({
    name: ex.name,
    exerciseId,
    /* Derived, not carried: a saved routine snapshot has no `repUnit`
       field, and `normalizeExercise` only keeps what it is handed — so
       every routine exercise arrived unitless. `WorkoutSession` renders
       the entry column heading ("Seconds" vs "Reps") and the previous-
       performance label from this exact value, so a routine containing a
       plank prescribed "3 × 10" — ten REPS of a hold. That is the same
       bug `repUnitsCatalogue.test.ts` describes catching for
       `replaceExercise`, reached through a different door. It also fed
       `isSetEligibleForStrengthPr`, so a hold could set a weight×reps
       "PR".

       The synthesised fallback id above is never a catalog id, so an
       exercise saved without one stays unitless — unchanged, and the
       honest answer when the movement cannot be identified. */
    repUnit: repUnitForExerciseId(exerciseId),
    sets: Math.max(1, ex.setCount || 1),
    reps: Math.max(1, ex.targetReps || 8),
    weight: ex.targetWeightKg || 0,
    lastAttemptedWeight: ex.targetWeightKg || 0,
    lastSuccessfulWeight: ex.targetWeightKg || 0,
  });
}
