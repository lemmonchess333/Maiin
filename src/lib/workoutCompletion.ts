import { doc, runTransaction, type Firestore } from "firebase/firestore";
import { stripUndefined } from "./firestoreGuards";
import type { SessionProgression } from "@/features/program/sessionCompletion";
import type { ProgramState } from "@/features/program/programTypes";

export interface SavedProgrammeCompletion {
  context: ProgrammeCompletionContext;
  policy: Pick<ProgramState, "goal" | "settings" | "trainingBlock">;
  committedExercises: ProgramState["workouts"][number]["exercises"];
}

export interface ProgrammeCompletionContext {
  weekNumber: number;
  dayIndex: number;
  dayIdentity: string;
  trainingBlockId?: string;
  progression?: SessionProgression;
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
            context: completion,
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
          ...progressed,
          updatedAt: Date.now(),
          workouts: progressed.workouts.map((row, index) =>
            index === completion.dayIndex
              ? {
                  ...row,
                  completed: true,
                  skipped: false,
                  completedWorkoutId: workoutId,
                }
              : row
          ),
        };
        if (next.nextWorkoutOverride === completion.dayIndex)
          delete next.nextWorkoutOverride;
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
