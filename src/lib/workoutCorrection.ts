import {
  doc,
  runTransaction,
  Timestamp,
  type Firestore,
} from "firebase/firestore";
import type { Workout, WorkoutExercise } from "@/hooks/useWorkouts";
import { workoutTonnageKg } from "@/hooks/useWorkouts";
import { estimateLiftBurn, selectLiftMET } from "./workoutBurn";
import { stripUndefined } from "./firestoreGuards";
import { validateSet } from "./setValidation";
import { sameStoredValue } from "@/features/program/stateTransition";
import { applySessionProgression } from "@/features/program/sessionCompletion";
import type { ProgramState } from "@/features/program/programTypes";
import { workoutCompletionDayIdentity } from "./workoutCompletion";

export interface WorkoutEdits {
  durationMinutes: number;
  exercises: { sets: { weightKg: number; reps: number }[] }[];
}

/** Only performed facts can change; identity, date and prescription stay intact. */
export function correctedWorkout(
  workout: Workout,
  edits: WorkoutEdits
): Workout {
  if (
    !Number.isFinite(edits.durationMinutes) ||
    edits.durationMinutes < 0 ||
    edits.durationMinutes > 1440
  )
    throw new Error("Duration must be between 0 and 1,440 minutes.");
  if (edits.exercises.length !== workout.exercises.length)
    throw new Error("Reload this workout before editing it.");
  const exercises: WorkoutExercise[] = workout.exercises.map(
    (exercise, index) => {
      const incoming = edits.exercises[index].sets;
      if (incoming.length !== exercise.sets.length)
        throw new Error("Reload this workout before editing it.");
      return {
        ...exercise,
        sets: exercise.sets.map((set, j) => {
          const edit = incoming[j];
          const result = validateSet({
            weight: edit.weightKg,
            reps: exercise.repUnit === "seconds" ? 1 : edit.reps,
          });
          if (!result.ok) throw new Error(result.message);
          if (
            exercise.repUnit === "seconds" &&
            (!Number.isInteger(edit.reps) || edit.reps < 1 || edit.reps > 86400)
          )
            throw new Error(
              "Set duration must be between 1 and 86,400 seconds."
            );
          return {
            ...set,
            weightKg: result.normalized.weight,
            reps: edit.reps,
          };
        }),
      };
    }
  );
  const oldVolume = workoutTonnageKg(workout);
  const volume = workoutTonnageKg({ exercises });
  const oldMinutes =
    workout.durationMinutes ||
    workout.exercises.reduce((n, ex) => n + ex.sets.length * 3, 0);
  const burnContext = workout.burnContext ?? {
    // Older sessions did not retain their burn inputs. Preserve their estimate's
    // implied bodyweight rather than substituting today's profile weight.
    bodyweightKg:
      oldMinutes > 0 && Number.isFinite(workout.totalCalories)
        ? (workout.totalCalories * 60) /
          (oldMinutes * selectLiftMET(oldVolume, oldMinutes))
        : 0,
    inferred: true,
  };
  return {
    ...workout,
    exercises,
    durationMinutes: edits.durationMinutes,
    burnContext,
    totalCalories: estimateLiftBurn({
      durationMinutes: edits.durationMinutes,
      tonnageKg: volume,
      bodyweightKg: burnContext.bodyweightKg,
      completedSetCount: exercises.reduce((n, ex) => n + ex.sets.length, 0),
    }),
  };
}

/** Revision check, corrected facts, safe latest-session progression and record-cache invalidation are one commit. Never queues over a
 * newer revision; a failed save leaves the editor's draft available. */
export async function correctSavedWorkout(
  db: Firestore,
  uid: string,
  id: string,
  expectedRevision: number,
  correctionId: string,
  edits: WorkoutEdits
): Promise<void> {
  const { auth } = await import("./firebase");
  const assertOwner = () => {
    if (auth.currentUser?.uid !== uid)
      throw new Error("Sign in again to edit this workout.");
  };
  assertOwner();
  const ref = doc(db, "users", uid, "workouts", id);
  const recordsRef = doc(db, "users", uid, "stats", "prMap");
  const programRef = doc(db, "users", uid, "programState", "current");
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    assertOwner();
    if (!snapshot.exists())
      throw new Error("This workout is no longer available.");
    const stored = snapshot.data() as Workout & {
      sourceVolumeAtFirstCorrection?: number;
    };
    if (stored.lastCorrectionId === correctionId) return;
    if ((stored.revision ?? 0) !== expectedRevision)
      throw new Error(
        "This workout changed elsewhere. Reopen it to review the latest version."
      );
    const next = correctedWorkout(stored, edits);
    const records = await transaction.get(recordsRef);
    const saved = stored.programmeCompletion;
    const program = saved ? await transaction.get(programRef) : null;
    assertOwner();
    if (
      saved?.context.progression &&
      program?.exists() &&
      !sameStoredValue(stored.exercises, next.exercises)
    ) {
      const state = program.data() as ProgramState;
      const context = saved.context;
      const original = saved.context.progression;
      const day = state.workouts[context.dayIndex];
      if (
        sameStoredValue(saved.policy, {
          goal: state.goal,
          settings: state.settings,
          trainingBlock: state.trainingBlock,
        }) &&
        state.weekNumber === context.weekNumber &&
        state.trainingBlock?.id === context.trainingBlockId &&
        workoutCompletionDayIdentity(day) === context.dayIdentity &&
        day.completedWorkoutId === id
      ) {
        const eligible = new Set(
          saved.committedExercises
            .filter((ex) =>
              sameStoredValue(
                ex,
                day.exercises.find(
                  (current) => current.instanceId === ex.instanceId
                )
              )
            )
            .map((ex) => ex.instanceId)
        );
        const progression = {
          ...original,
          setLogs: original.setLogs.map((logs, index) => {
            let cursor = 0;
            const actual = next.exercises[index].sets.filter(
              (set) => set.type !== "warmup"
            );
            return logs.map((log) => {
              if (!log.completed || log.type === "warmup") return log;
              const set = actual[cursor++];
              return set
                ? { ...log, weight: set.weightKg, reps: set.reps }
                : log;
            });
          }),
        };
        const replay = {
          ...state,
          workouts: state.workouts.map((row, i) =>
            i !== context.dayIndex
              ? row
              : {
                  ...row,
                  exercises: row.exercises.map((ex) =>
                    eligible.has(ex.instanceId)
                      ? progression.prescription.progressionBaseline.find(
                          (base) => base.instanceId === ex.instanceId
                        )!
                      : ex
                  ),
                }
          ),
        };
        const evaluated = applySessionProgression(
          replay,
          context.dayIndex,
          progression
        );
        const revised = {
          ...evaluated,
          workouts: evaluated.workouts.map((row, i) =>
            i !== context.dayIndex
              ? row
              : {
                  ...row,
                  exercises: row.exercises.map((ex, j) =>
                    eligible.has(ex.instanceId) ? ex : day.exercises[j]
                  ),
                }
          ),
        };
        if (eligible.size)
          transaction.set(
            programRef,
            stripUndefined({ ...revised, updatedAt: Date.now() })
          );
        next.programmeCompletion = {
          ...saved,
          context: { ...context, progression },
          committedExercises: revised.workouts[
            context.dayIndex
          ].exercises.filter((ex) => eligible.has(ex.instanceId)),
        };
      }
    }
    const totalVolume = workoutTonnageKg(next);
    transaction.set(
      ref,
      stripUndefined({
        ...next,
        totalVolume,
        revision: expectedRevision + 1,
        lastCorrectionId: correctionId,
        correctedAt: Timestamp.now(),
        sourceVolumeAtFirstCorrection:
          stored.sourceVolumeAtFirstCorrection ?? workoutTonnageKg(stored),
      })
    );
    transaction.set(
      recordsRef,
      { revision: (records.data()?.revision ?? 0) + 1, invalidated: true },
      { merge: true }
    );
  });
}
