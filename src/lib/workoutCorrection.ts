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
import { invalidateLiftRecords } from "./liftRecordsStore";
import { validateSet } from "./setValidation";
import { formatLoad, type LiftUnit } from "./liftLoad";
import { sameStoredValue } from "@/features/program/stateTransition";
import { applySessionProgression } from "@/features/program/sessionCompletion";
import type { ProgramState } from "@/features/program/programTypes";
import {
  sessionStillInPlan,
  storeSessionProgression,
} from "./workoutCompletion";

export interface WorkoutEdits {
  durationMinutes: number;
  exercises: { sets: { weightKg: number; reps: number }[] }[];
}

/** What a correction asks before it saves (Lift16). */
export interface CorrectionQuestion {
  title: string;
  message: string;
  confirmLabel: string;
}

/**
 * The first weight this correction changes to more than twice what its set
 * was planned at (or logged at, when that was more), as the question to ask
 * before saving: the plan follows a corrected session as it follows a
 * finished one, so a typo here moves next week's weight too. The weights
 * are kg; `unit` is the one the question speaks (Lift18).
 */
export function correctionToConfirm(
  workout: Workout,
  edits: WorkoutEdits,
  unit: LiftUnit = "kg"
): CorrectionQuestion | undefined {
  for (const [i, exercise] of workout.exercises.entries())
    for (const [j, set] of exercise.sets.entries()) {
      const weight = edits.exercises[i]?.sets[j]?.weightKg;
      if (weight === undefined || weight === set.weightKg) continue;
      const planned = set.plannedWeightKg ?? 0;
      const from = Math.max(planned, set.weightKg);
      if (!(from > 0 && weight > 2 * from)) continue;
      return {
        title: `${formatLoad(weight, unit)}?`,
        message:
          from === planned
            ? `This set was planned at ${formatLoad(planned, unit)}.`
            : `It was logged at ${formatLoad(set.weightKg, unit)}.`,
        confirmLabel: `Save ${formatLoad(weight, unit)}`,
      };
    }
  return undefined;
}

/** Only performed facts can change; identity, date and prescription stay intact. */
export function correctedWorkout(
  workout: Workout,
  edits: WorkoutEdits,
  unit: LiftUnit = "kg"
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
            unit,
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
  edits: WorkoutEdits,
  /** The unit a refusal speaks; `edits` are kg either way. */
  unit: LiftUnit = "kg"
): Promise<void> {
  const { auth } = await import("./firebase");
  const assertOwner = () => {
    if (auth.currentUser?.uid !== uid)
      throw new Error("Sign in again to edit this workout.");
  };
  assertOwner();
  const ref = doc(db, "users", uid, "workouts", id);
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
    const next = correctedWorkout(stored, edits, unit);
    const saved = stored.programmeCompletion;
    const program = saved ? await transaction.get(programRef) : null;
    assertOwner();
    const state = program?.exists() ? (program.data() as ProgramState) : null;
    const current =
      saved && state && !sameStoredValue(stored.exercises, next.exercises)
        ? sessionStillInPlan(state, saved, id)
        : null;
    if (saved && state && current) {
      const context = saved.context;
      const { day, original, eligible } = current;
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
            return set ? { ...log, weight: set.weightKg, reps: set.reps } : log;
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
        context: {
          ...context,
          progression: storeSessionProgression(progression),
        },
        committedExercises: revised.workouts[context.dayIndex].exercises.filter(
          (ex) => eligible.has(ex.instanceId)
        ),
      };
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
    invalidateLiftRecords(transaction, uid);
  });
}
