import { sameStoredValue } from "./stateTransition";
import type { ProgramExercise, ProgramState } from "./programTypes";
import type { LoggedSet } from "./workoutSetRecord";
import { applyProgression, PERFORMANCE_HISTORY_CAP } from "./programEngine";
import { progressionSetFor } from "./sessionSetPolicy";
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
              const logs = (session.setLogs[inputIndex] ?? []).filter(
                (set) => set.type !== "warmup"
              );
              const last = progressionSetFor(
                logs.map((set) => ({ ...set, type: set.type ?? "working" }))
              );
              if (
                session.sessionVariant === "easier_today" ||
                (session.sessionVariant === "time_budget" &&
                  logs.length < baseline.sets) ||
                !last ||
                !logs.every((set) => set.completed)
              )
                return legacy ? baseline : stored;

              let next: ProgramExercise;
              if (!held && settings.autoProgression) {
                next = applyProgression(
                  baseline,
                  last.reps,
                  last.weight,
                  state.goal,
                  settings.microloading,
                  last.rpe
                );
                // A late/offline save belongs to the session's original local date.
                next.performanceHistory = next.performanceHistory?.map(
                  (record, i, all) =>
                    i === all.length - 1
                      ? { ...record, date: session.date }
                      : record
                );
              } else {
                next = {
                  ...baseline,
                  lastAttemptedWeight: last.weight,
                  lastPerformance: {
                    sets: baseline.sets,
                    reps: last.reps,
                    weight: last.weight,
                    completed: last.reps >= baseline.reps,
                  },
                  ...(held
                    ? {
                        performanceHistory: [
                          ...(baseline.performanceHistory ?? []),
                          {
                            date: session.date,
                            weight: last.weight,
                            repsCompleted: last.reps,
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
