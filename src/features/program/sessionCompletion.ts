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
import { WELCOME_BACK_DAYS } from "./liftLayoff";
import { blockWeekOf, isProgressionHeld } from "./trainingBlock";
import { parseLocalDate } from "@/lib/dateHelpers";

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

/** The day of the plan's last session before this one, by the dates its
 *  lifts' records carry, or null for a plan with none yet. An old draft's
 *  lift is read from before its provisional progression, which may already
 *  carry this session's record. */
function lastSessionDate(
  state: ProgramState,
  completionId: string
): string | null {
  let last: string | null = null;
  for (const day of state.workouts)
    for (const ex of day.exercises) {
      const before =
        ex.sessionProgression?.id === completionId
          ? ex.sessionProgression.baseline
          : ex;
      // "YYYY-MM-DD" compares in date order. Every record is read, not the
      // last: a late save can append one dated before the one ahead of it.
      for (const record of before.performanceHistory ?? [])
        if (last === null || record.date > last) last = record.date;
    }
  return last;
}

/**
 * Whether this session is a return, after which the miss counts start again
 * (Lift4 (7); "after a return" in the lifting handoff's lighter-week
 * precedence table): two weeks or more after the plan's last session, the
 * Welcome back sheet's two weeks (`WELCOME_BACK_DAYS`). It counts the
 * plan's own sessions, not all lifting, because a miss count is the plan
 * lift's: weeks of other training still come between two misses. "Ease
 * back in" resets the counts as it lowers the plan; "Keep my old weights",
 * or closing the sheet, writes nothing, so the first session back does it.
 */
function isReturn(state: ProgramState, session: SessionProgression): boolean {
  const last = lastSessionDate(state, session.completionId);
  if (last === null) return false;
  const days = Math.round(
    (parseLocalDate(session.date).getTime() - parseLocalDate(last).getTime()) /
      86_400_000
  );
  // A date that doesn't parse gives NaN, which is no return.
  return days >= WELCOME_BACK_DAYS;
}

function withoutMisses<T extends Pick<ProgramExercise, "consecutiveFailures">>(
  ex: T
): T {
  return ex.consecutiveFailures ? { ...ex, consecutiveFailures: 0 } : ex;
}

/** Called only within the transaction that creates this session's workout. */
export function applySessionProgression(
  before: ProgramState,
  dayIndex: number,
  session: SessionProgression
): ProgramState {
  const returning = isReturn(before, session);
  const state: ProgramState = returning
    ? {
        ...before,
        workouts: before.workouts.map((day) => ({
          ...day,
          exercises: day.exercises.map(withoutMisses),
        })),
      }
    : before;
  // The session's own copy of each lift starts again too, so the check
  // below that the plan hasn't moved since it started compares like with
  // like.
  const fresh = <T extends Pick<ProgramExercise, "consecutiveFailures">>(
    ex: T
  ): T => (returning ? withoutMisses(ex) : ex);
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
                ? fresh(stored.sessionProgression!.baseline)
                : withoutSessionProgression(stored);
              const expected = fresh(
                withoutSessionProgression(
                  session.prescription.progressionBaseline[inputIndex]
                )
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
                next = applySessionSets(
                  start,
                  read,
                  settings.smallPlates,
                  session.afterHardRun && loadsTheLegs(start) ? 0.5 : 1
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
