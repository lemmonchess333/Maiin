import { sameStoredValue } from "./stateTransition";
import {
  DEFAULT_PROGRAM_SETTINGS,
  type ProgramExercise,
  type ProgramState,
} from "./programTypes";
import type { LoggedSet } from "./workoutSetRecord";
import {
  afterLoweredLine,
  applySessionSets,
  liftedLoad,
  PERFORMANCE_HISTORY_CAP,
} from "./programEngine";
import { readSessionSets, recordedReps } from "./sessionSets";
import { keptSwap, type SessionSwap } from "./sessionSwap";
import { loadsTheLegs } from "./easierToday";
import { blockWeekOf, isProgressionHeld } from "./trainingBlock";

/** The session owns these facts even if the plan changes while it is open. */
export interface SessionPrescription {
  dayName?: string;
  exercises: ProgramExercise[];
  progressionBaseline: ProgramExercise[];
  /** Lift4 (11): exercises swapped in for today, and whether Finish kept
   *  each in the plan (`sessionSwap.ts`). */
  swaps?: SessionSwap[];
}

export interface SessionProgression {
  completionId: string;
  date: string;
  prescription: SessionPrescription;
  setLogs: LoggedSet[][];
  sessionVariant?: "express45" | "express30" | "easier_today" | "time_budget";
  /** Lift4 (14): a long or hard run fell in the 24 hours before the
   *  session, so a leg miss counts half (Lift4 (7)). */
  afterHardRun?: boolean;
}

export function withoutSessionProgression(
  exercise: ProgramExercise
): ProgramExercise {
  const { sessionProgression: _previous, ...baseline } = exercise;
  return baseline;
}

/** A planned exercise as this session sets it out: at the weight and reps
 *  its progression started from, should an older draft have moved it. */
export function sessionExercise(
  ex: ProgramExercise,
  completionId: string
): ProgramExercise {
  const baseline = withoutSessionProgression(
    ex.sessionProgression?.id === completionId
      ? ex.sessionProgression.baseline
      : ex
  );
  return {
    ...withoutSessionProgression(ex),
    weight: baseline.weight,
    reps: baseline.reps,
  };
}

/**
 * What a session sets out to do, fixed as it starts (the workout screen
 * holds it from there): the day's lifts as `sessionExercise` sets them out,
 * and the baseline its progression is judged against. The baseline is
 * Train's `progressionBaseline` for a lift where Train passes one (matched
 * by instance id), else the lift as planned, with any older draft's
 * provisional progression undone.
 */
export function sessionPrescription(
  day: { dayName: string; exercises: ProgramExercise[] },
  completionId: string,
  progressionBaseline?: ProgramExercise[]
): SessionPrescription {
  const baseline = (ex: ProgramExercise) =>
    withoutSessionProgression(
      ex.sessionProgression?.id === completionId
        ? ex.sessionProgression.baseline
        : ex
    );
  return structuredClone({
    dayName: day.dayName,
    exercises: day.exercises.map((ex) => sessionExercise(ex, completionId)),
    progressionBaseline: day.exercises.map((ex) =>
      baseline(
        progressionBaseline?.find(
          (candidate) => candidate.instanceId === ex.instanceId
        ) ?? ex
      )
    ),
  });
}

/**
 * What a finished session hands the plan, from what the workout screen
 * saved: nothing without a prescription (a day marked done with no session
 * behind it moves no lift). `date` is the session's own day
 * (`liftSessionDay` of its start, Lift3).
 */
export function toSessionProgression(session: {
  completionId: string;
  date: string;
  prescription?: SessionPrescription;
  setLogs: LoggedSet[][];
  sessionVariant?: SessionProgression["sessionVariant"];
  afterHardRun?: boolean;
}): SessionProgression | undefined {
  if (!session.prescription) return undefined;
  return {
    completionId: session.completionId,
    date: session.date,
    prescription: session.prescription,
    setLogs: session.setLogs,
    sessionVariant: session.sessionVariant,
    ...(session.afterHardRun ? { afterHardRun: true } : {}),
  };
}

/** Called only within the transaction that creates this session's workout. */
export function applySessionProgression(
  state: ProgramState,
  dayIndex: number,
  session: SessionProgression
): ProgramState {
  const settings = state.settings ?? DEFAULT_PROGRAM_SETTINGS;
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
              // A swapped exercise's sets say nothing about the lift it
              // stood in for (Lift4 (11)): unless Finish kept it, the lift
              // stays as it was.
              const swap = session.prescription.swaps?.find(
                (entry) => entry.index === inputIndex
              );
              if (swap && swap.keep !== true) return stored;
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
              // A lowered lift's line is this session's alone (Lift4). A
              // kept swap takes the lift's place, and today's sets are its
              // first session.
              const start = swap
                ? keptSwap(baseline, session.prescription.exercises[inputIndex])
                : afterLoweredLine(baseline);
              // Lift4: every working set counts, and a set not done is just
              // not done, so a session cut short counts like any other.
              const read = readSessionSets(
                session.setLogs[inputIndex] ?? [],
                baseline.sets
              );
              if (!read) return swap ? start : legacy ? baseline : stored;
              // An easier session's weights are lighter by design, and a
              // lighter week's sessions are easy by design: either can move
              // a weight up, never down, and says nothing else (Lift4 (8)).
              if (
                session.sessionVariant === "easier_today" ||
                state.currentPhase === "deload"
              ) {
                const lifted = liftedLoad(start.exerciseId, read.weight);
                if (lifted !== null && lifted > start.weight)
                  return {
                    ...start,
                    weight: lifted,
                    lastAttemptedWeight: lifted,
                  };
                return legacy || swap ? start : afterLoweredLine(stored);
              }
              const reps = recordedReps(read);

              let next: ProgramExercise;
              if (!held && settings.autoProgression) {
                // A leg miss within a day after a long or hard run counts
                // half (Lift4 (7)): the run explains some of it.
                // A late/offline save belongs to the session's original
                // local date, which the record is stamped with.
                next = applySessionSets(
                  start,
                  read,
                  settings.smallPlates,
                  session.afterHardRun && loadsTheLegs(start) ? 0.5 : 1,
                  session.date
                );
              } else {
                // A held week keeps the prescription and records the
                // session. With auto-progression off there is no step and no
                // success or failure accounting, but the plan still carries
                // the load lifted (`liftedLoad`): following the person's own
                // load is not auto-progression.
                const lifted = held
                  ? null
                  : liftedLoad(start.exerciseId, read.weight);
                next = {
                  ...start,
                  ...(lifted === null ? {} : { weight: lifted }),
                  lastAttemptedWeight: read.weight,
                  lastPerformance: {
                    sets: start.sets,
                    reps,
                    weight: read.weight,
                    completed: reps >= start.reps,
                  },
                  ...(held
                    ? {
                        performanceHistory: [
                          ...(start.performanceHistory ?? []),
                          {
                            date: session.date,
                            weight: read.weight,
                            repsCompleted: reps,
                            repsTarget: start.reps,
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
