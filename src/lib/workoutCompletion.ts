import { doc, runTransaction, type Firestore } from "firebase/firestore";
import { stripUndefined } from "./firestoreGuards";
import type { SessionProgression } from "@/features/program/sessionCompletion";
import type { ProgramState, WorkoutDay } from "@/features/program/programTypes";
import { sameStoredValue } from "@/features/program/stateTransition";

export interface SavedProgrammeCompletion {
  context: Omit<ProgrammeCompletionContext, "progression"> & {
    progression?: StoredSessionProgression;
  };
  policy: Pick<ProgramState, "goal" | "settings" | "trainingBlock">;
  committedExercises: ProgramState["workouts"][number]["exercises"];
}

type StoredSessionProgression = Omit<SessionProgression, "setLogs"> & {
  // Map wrappers avoid Firestore's forbidden array-of-arrays shape. The
  // array alternative reads pre-release/local fixtures without losing work.
  setLogs: (
    | { sets: SessionProgression["setLogs"][number] }
    | SessionProgression["setLogs"][number]
  )[];
};

export function storeSessionProgression(
  progression: SessionProgression
): StoredSessionProgression {
  return {
    ...progression,
    setLogs: progression.setLogs.map((sets) => ({ sets })),
  };
}

export function restoreSessionProgression(
  progression: StoredSessionProgression
): SessionProgression {
  return {
    ...progression,
    setLogs: progression.setLogs.map((row) =>
      Array.isArray(row) ? row : row.sets
    ),
  };
}

export interface ProgrammeCompletionContext {
  weekNumber: number;
  dayIndex: number;
  dayIdentity: string;
  trainingBlockId?: string;
  progression?: SessionProgression;
}

/**
 * Where a saved session's progression still stands in the plan: the plan's
 * policy, week, block and day are the ones it was saved against, the day is
 * still the one it marked done, and `eligible` holds the lifts it stepped
 * that nothing has changed since. Null when the plan has moved on. A
 * correction replays the eligible lifts, and a delete puts them back.
 */
export function sessionStillInPlan(
  state: ProgramState,
  saved: SavedProgrammeCompletion,
  workoutId: string
): {
  day: WorkoutDay;
  original: SessionProgression;
  eligible: ReadonlySet<string | undefined>;
} | null {
  const { context } = saved;
  if (!context.progression) return null;
  const day = state.workouts[context.dayIndex];
  if (
    !sameStoredValue(saved.policy, {
      goal: state.goal,
      settings: state.settings,
      trainingBlock: state.trainingBlock,
    }) ||
    state.weekNumber !== context.weekNumber ||
    state.trainingBlock?.id !== context.trainingBlockId ||
    workoutCompletionDayIdentity(day) !== context.dayIdentity ||
    day.completedWorkoutId !== workoutId
  )
    return null;
  const eligible = new Set(
    saved.committedExercises
      .filter((ex) =>
        sameStoredValue(
          ex,
          day.exercises.find((current) => current.instanceId === ex.instanceId)
        )
      )
      .map((ex) => ex.instanceId)
  );
  return {
    day,
    original: restoreSessionProgression(context.progression),
    eligible,
  };
}

/**
 * The plan as it was before a deleted session (Lift4 (14)), when nothing has
 * moved on since: the lifts it stepped go back to the weights and reps they
 * had, and its day is no longer done. Null when the plan has moved on, which
 * leaves the plan as it is.
 */
export function planWithoutSession(
  state: ProgramState,
  saved: SavedProgrammeCompletion,
  workoutId: string
): ProgramState | null {
  const current = sessionStillInPlan(state, saved, workoutId);
  if (!current) return null;
  const baseline = current.original.prescription.progressionBaseline;
  return {
    ...state,
    workouts: state.workouts.map((row, index) => {
      if (index !== saved.context.dayIndex) return row;
      const { completedWorkoutId: _done, ...rest } = row;
      return {
        ...rest,
        completed: false,
        exercises: row.exercises.map((ex) =>
          current.eligible.has(ex.instanceId)
            ? (baseline.find((base) => base.instanceId === ex.instanceId) ?? ex)
            : ex
        ),
      };
    }),
  };
}

/**
 * The plan with a day marked done by the session saved as `workoutId`: done
 * and not skipped, and no longer the session chosen to come next. The save's
 * transaction and the app's copy before the save lands both mark it here,
 * each after the session's progression (`applySessionProgression`), which
 * changes only the day's lifts. Deleting the session undoes the day
 * (`planWithoutSession`).
 */
export function markDayDone(
  state: ProgramState,
  dayIndex: number,
  workoutId: string
): ProgramState {
  const next: ProgramState = {
    ...state,
    workouts: state.workouts.map((row, index) =>
      index === dayIndex
        ? {
            ...row,
            completed: true,
            skipped: false,
            completedWorkoutId: workoutId,
          }
        : row
    ),
  };
  if (next.nextWorkoutOverride === dayIndex) delete next.nextWorkoutOverride;
  return next;
}

export function workoutCompletionDayIdentity(day: unknown): string | null {
  if (!day || typeof day !== "object") return null;
  const value = day as {
    dayName?: unknown;
    dayType?: unknown;
    exercises?: unknown;
  };
  if (
    typeof value.dayName !== "string" ||
    typeof value.dayType !== "string" ||
    !Array.isArray(value.exercises)
  )
    return null;
  const ids = value.exercises.map((exercise) => exercise?.instanceId);
  if (!ids.length || ids.some((id) => typeof id !== "string" || !id))
    return null;
  return JSON.stringify([value.dayName, value.dayType, ids]);
}

/** One transaction for foreground saves and durable replay. Existing sessions
 * are receipts, never replacement writes; another week's plan is left intact. */
export async function commitWorkoutCompletion(
  db: Firestore,
  uid: string,
  workoutId: string,
  data: Record<string, unknown>,
  completion?: ProgrammeCompletionContext
): Promise<ProgramState | null> {
  const { auth } = await import("./firebase");
  const assertOwner = () => {
    if (auth.currentUser?.uid !== uid)
      throw new Error("Sign in again to save your workout.");
  };
  assertOwner();
  const workoutRef = doc(db, "users", uid, "workouts", workoutId);
  const programRef = doc(db, "users", uid, "programState", "current");
  return runTransaction(db, async (transaction) => {
    const existing = await transaction.get(workoutRef);
    assertOwner();
    if (existing.exists()) return null;
    let next: ProgramState | null = null;
    let programmeCompletion: SavedProgrammeCompletion | undefined;
    if (completion) {
      const snapshot = await transaction.get(programRef);
      assertOwner();
      const state = snapshot.data() as ProgramState | undefined;
      const day = state?.workouts?.[completion.dayIndex];
      if (
        state?.weekNumber === completion.weekNumber &&
        state.trainingBlock?.id === completion.trainingBlockId &&
        workoutCompletionDayIdentity(day) === completion.dayIdentity &&
        !(day?.completed && day.completedWorkoutId !== workoutId)
      ) {
        const progressed = completion.progression
          ? (
              await import("@/features/program/sessionCompletion")
            ).applySessionProgression(
              state,
              completion.dayIndex,
              completion.progression
            )
          : state;
        if (completion.progression)
          programmeCompletion = {
            context: {
              ...completion,
              progression: storeSessionProgression(completion.progression),
            },
            policy: {
              goal: state.goal,
              settings: state.settings,
              trainingBlock: state.trainingBlock,
            },
            committedExercises: progressed.workouts[
              completion.dayIndex
            ].exercises.filter(
              (exercise, index) =>
                exercise !==
                state.workouts[completion.dayIndex].exercises[index]
            ),
          };
        next = {
          ...markDayDone(progressed, completion.dayIndex, workoutId),
          updatedAt: Date.now(),
        };
      }
    }
    assertOwner();
    if (next) transaction.set(programRef, stripUndefined(next));
    transaction.set(
      workoutRef,
      stripUndefined({
        ...data,
        ...(programmeCompletion ? { programmeCompletion } : {}),
      })
    );
    return next;
  });
}
