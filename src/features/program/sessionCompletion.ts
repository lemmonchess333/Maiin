import { sameStoredValue } from "./stateTransition";
import type { ProgramExercise, ProgramState } from "./programTypes";
import type { LoggedSet } from "./workoutSetRecord";
import {
  applySessionSets,
  liftedLoad,
  PERFORMANCE_HISTORY_CAP,
} from "./programEngine";
import { readSessionSets, recordedReps } from "./sessionSets";
import { blockWeekOf } from "./trainingBlock";
import { isProgressionHeld } from "./represcribe";

/** The session owns these facts even if the plan changes while it is open. */
export interface SessionPrescription {
  dayName?: string;
  exercises: ProgramExercise[];
  progressionBaseline: ProgramExercise[];
}

export interface SessionProgression {
  completionId: string;
  date: string;
  prescription: SessionPrescription;
  setLogs: LoggedSet[][];
  sessionVariant?: "express45" | "express30" | "easier_today" | "time_budget";
}

export function withoutSessionProgression(
  exercise: ProgramExercise
): ProgramExercise {
  const { sessionProgression: _previous, ...baseline } = exercise;
  return baseline;
}

/** Called only within the transaction that creates this session's workout. */
export function applySessionProgression(
  state: ProgramState,
  dayIndex: number,
  session: SessionProgression
): ProgramState {
  const settings = state.settings ?? {
    autoProgression: true,
    microloading: true,
  };
  const held = isProgressionHeld(
    state.trainingBlock,
    state.trainingBlock ? blockWeekOf(state.trainingBlock, session.date) : null
  );
  return {
    ...state,
    workouts: state.workouts.map((day, index) =>
      index !== dayIndex
        ? day
        : {
            ...day,
            exercises: day.exercises.map((stored) => {
              const inputIndex =
                session.prescription.progressionBaseline.findIndex(
                  (ex) => !!ex.instanceId && ex.instanceId === stored.instanceId
                );
              if (inputIndex < 0) return stored;
              // Old drafts may already have applied an incremental progression. Undo
              // that provisional result before evaluating their final completed work.
              const legacy =
                stored.sessionProgression?.id === session.completionId;
              const baseline = legacy
                ? stored.sessionProgression!.baseline
                : withoutSessionProgression(stored);
              const expected = withoutSessionProgression(
                session.prescription.progressionBaseline[inputIndex]
              );
              if (!legacy && !sameStoredValue(baseline, expected))
                return stored;
              // Lift4: every working set counts, and a set not done is just
              // not done, so a session cut short counts like any other.
              const read = readSessionSets(
                session.setLogs[inputIndex] ?? [],
                baseline.sets
              );
              if (!read) return legacy ? baseline : stored;
              // An easier session's weights are lighter by design: it can
              // move a weight up, never down, and says nothing else.
              if (session.sessionVariant === "easier_today") {
                const lifted = liftedLoad(baseline.exerciseId, read.weight);
                return lifted !== null && lifted > baseline.weight
                  ? { ...baseline, weight: lifted, lastAttemptedWeight: lifted }
                  : legacy
                    ? baseline
                    : stored;
              }
              const reps = recordedReps(read);

              let next: ProgramExercise;
              if (!held && settings.autoProgression) {
                next = applySessionSets(
                  baseline,
                  read,
                  state.goal,
                  settings.microloading
                );
                // A late/offline save belongs to the session's original local date.
                next.performanceHistory = next.performanceHistory?.map(
                  (record, i, all) =>
                    i === all.length - 1
                      ? { ...record, date: session.date }
                      : record
                );
              } else {
                // A held week keeps the prescription and records the
                // session. With auto-progression off there is no step and no
                // success or failure accounting, but the plan still carries
                // the load lifted (`liftedLoad`): following the person's own
                // load is not auto-progression.
                const lifted = held
                  ? null
                  : liftedLoad(baseline.exerciseId, read.weight);
                next = {
                  ...baseline,
                  ...(lifted === null ? {} : { weight: lifted }),
                  lastAttemptedWeight: read.weight,
                  lastPerformance: {
                    sets: baseline.sets,
                    reps,
                    weight: read.weight,
                    completed: reps >= baseline.reps,
                  },
                  ...(held
                    ? {
                        performanceHistory: [
                          ...(baseline.performanceHistory ?? []),
                          {
                            date: session.date,
                            weight: read.weight,
                            repsCompleted: reps,
                            repsTarget: baseline.reps,
                          },
                        ].slice(-PERFORMANCE_HISTORY_CAP),
                      }
                    : {}),
                };
              }
              return next;
            }),
          }
    ),
  };
}
