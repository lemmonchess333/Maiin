/**
 * Finishing a lift: the saved workout, the receipt the workout screen
 * reads, and the post it can share (`liftPost`).
 *
 * Two writers save a lift session, the programme's (`useProgram`'s
 * `completeWorkoutDay`) and a saved routine's (`Routine.tsx`). Each built
 * the workout and its post by hand, and the copies drifted:
 *
 * - A routine's post listed the routine as written, not what was done: an
 *   exercise left out still showed, at the planned load.
 * - A routine's workout had no planned set count (D2), which the
 *   programme's carries.
 * - Both showed their own "couldn't save" toast and then threw, and the
 *   workout screen showed its own, so one failure said it twice.
 *
 * Each now supplies only what differs: the exercises it ran, a title, a
 * notes line and its own fields. This module builds the rest. Underneath
 * it, the one transaction (`commitWorkoutCompletion`), the offline queue
 * and the share chain (`sessionPost`) are unchanged.
 */
import { Timestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { localDateString } from "@/lib/dateHelpers";
import { stripUndefined } from "@/lib/firestoreGuards";
import {
  hasQueuedWorkoutCompletion,
  queueWorkoutCompletion,
} from "@/lib/offlineQueue";
import { workoutTonnageKg, type WorkoutExercise } from "@/lib/savedWorkouts";
import { createSessionShare, type SessionShareAction } from "@/lib/sessionPost";
import { estimateLiftBurn } from "@/lib/workoutBurn";
import {
  commitWorkoutCompletion,
  type ProgrammeCompletionContext,
} from "@/lib/workoutCompletion";
import { liftPost, liftPostPreview, type LiftForPost } from "@/lib/liftPost";
import { logger } from "@/lib/logger";
import type {
  ProgramExercise,
  ProgramState,
} from "@/features/program/programTypes";
import {
  projectWorkoutSets,
  type LoggedSet,
} from "@/features/program/workoutSetRecord";

/** What a lift writer hands the workout screen. */
export interface LiftCompletionReceipt {
  /** `programme-<completionId>` or `routine-<completionId>`. */
  workoutId: string;
  /** Posts the workout, with or without asking (`sessionPost`). */
  share: SessionShareAction;
  /** Saved now, or waiting in the offline queue. */
  syncStatus: "synced" | "queued";
  /** Settles once the workout is saved, or cannot be. */
  sync: Promise<"synced" | "failed">;
}

/** A finished lift's workout id. Deterministic, so a retried Finish
 *  writes the same workout rather than a second one. */
export function liftWorkoutId(
  source: "programme" | "routine",
  completionId: string
): string {
  return `${source}-${completionId}`;
}

/**
 * The day a lift session belongs to: the local day it started (Lift3), so
 * a session that runs past midnight, or is resumed the next day, counts on
 * the day it began. A local day, which every reader matches by.
 */
export function liftSessionDay(startedAt: number | undefined): string {
  return localDateString(
    typeof startedAt === "number" && Number.isFinite(startedAt)
      ? new Date(startedAt)
      : new Date()
  );
}

/**
 * The exercises a session ran, as its saved workout records them: the sets
 * done (not warm-ups, which never reach a completion), the prescription
 * each was done against, the planned set count, and any note.
 */
export function liftWorkoutExercises(
  ran: readonly ProgramExercise[],
  setLogs: readonly (readonly LoggedSet[] | undefined)[] | undefined,
  notes?: Readonly<Record<number, string>>
): WorkoutExercise[] {
  return ran.map((ex, index) => {
    const logs = setLogs?.[index];
    // D2: the planned pair on each set is the PRESCRIPTION, which
    // `applyProgression` scores the sets against and overwrites a moment
    // later. A day marked done without a live session has no logs; its
    // sets are taken as the last attempt, the best guess there is.
    const sets = projectWorkoutSets(
      logs,
      logs
        ? { sets: ex.sets, reps: ex.reps, weightKg: ex.weight }
        : {
            sets: ex.sets,
            reps: ex.lastPerformance?.reps ?? ex.reps,
            weightKg: ex.lastAttemptedWeight || ex.weight,
          }
    );
    // Trimmed, and left out when empty: an empty string reads as "there
    // is a note" to every reader that checks for one.
    const note = notes?.[index]?.trim();
    return {
      exerciseId: ex.exerciseId,
      exerciseName: ex.name,
      category: ex.movementCategory,
      // The unit the session ran in: without it a timed hold reads as
      // reps, and its load as weight moved.
      ...(ex.repUnit !== undefined ? { repUnit: ex.repUnit } : {}),
      ...(note ? { notes: note } : {}),
      sets,
      // D2: how many sets were prescribed, beside `sets.length`, how many
      // were done. `sets` stays done-only: every reader assumes that.
      plannedSetCount: ex.sets,
      caloriesBurned: 0,
    };
  });
}

export interface LiftTotals {
  /** Kilograms moved; a timed hold moves none (`workoutTonnageKg`). */
  tonnageKg: number;
  completedSetCount: number;
  /** Minutes as saved: the session's clock, or three a set without one. */
  durationMinutes: number;
  totalCalories: number;
}

export function liftTotals(
  exercises: WorkoutExercise[],
  session: {
    /** Minutes on the session's clock; 0 when it had none. */
    durationMinutes: number;
    bodyweightKg: number;
  }
): LiftTotals {
  const tonnageKg = workoutTonnageKg({ exercises });
  const completedSetCount = exercises.reduce(
    (count, ex) => count + ex.sets.length,
    0
  );
  const clock = session.durationMinutes > 0 ? session.durationMinutes : 0;
  return {
    tonnageKg,
    completedSetCount,
    durationMinutes: clock > 0 ? clock : completedSetCount * 3,
    // The burn is given the clock as it was: with none, it has its own
    // estimate from the sets.
    totalCalories: estimateLiftBurn({
      durationMinutes: clock,
      tonnageKg,
      bodyweightKg: session.bodyweightKg,
      completedSetCount,
    }),
  };
}

/** A finished lift session, as its writer hands it over. */
export interface FinishedLift {
  uid: string;
  author: { displayName?: string | null; photoURL?: string | null };
  /** Which writer: the workout's id prefix and its `source`. */
  source: "programme" | "routine";
  /** Stable across a session's retries: a retried Finish writes the same
   *  workout. */
  completionId: string;
  /** When the session started, in ms: the workout is dated by it (Lift3). */
  startedAt?: number;
  /** The exercises the session ran, in the set logs' order. */
  ran: readonly ProgramExercise[];
  setLogs: readonly (readonly LoggedSet[] | undefined)[] | undefined;
  exerciseNotes?: Readonly<Record<number, string>>;
  /** Minutes on the session's clock; 0 when it had none. */
  durationMinutes: number;
  bodyweightKg: number;
  /** The session's name: the post's title. */
  title: string;
  /** The workout's notes line. */
  notes: string;
  /** Fields only this writer saves: a programme's session variant and
   *  RPE provenance, a routine's id and name. */
  extra?: Record<string, unknown>;
  /** A programme day's completion: the plan moves on in the same
   *  transaction as the workout is saved. */
  completion?: ProgrammeCompletionContext;
}

export interface LiftCompletion extends LiftCompletionReceipt {
  /**
   * The plan as a save made now left it: null when the transaction changed
   * no plan (a routine, a workout already saved, a day that moved on).
   * Absent while the workout waits in the offline queue.
   */
  committed?: ProgramState | null;
}

/**
 * Saves a finished lift, now or through the offline queue, and builds its
 * post. Throws when the save fails, and the workout screen says so once.
 */
export async function completeLift(
  finished: FinishedLift
): Promise<LiftCompletion> {
  const { uid } = finished;
  const workoutId = liftWorkoutId(finished.source, finished.completionId);
  const exercises = liftWorkoutExercises(
    finished.ran,
    finished.setLogs,
    finished.exerciseNotes
  );
  // Without a bodyweight the burn is 0. The workout is saved anyway.
  if (!(finished.bodyweightKg > 0))
    logger.warn(
      "[liftCompletion] no bodyweight on the profile: the workout saves with 0 calories"
    );
  const totals = liftTotals(exercises, {
    durationMinutes: finished.durationMinutes,
    bodyweightKg: finished.bodyweightKg,
  });
  const data = stripUndefined({
    date: liftSessionDay(finished.startedAt),
    exercises,
    totalCalories: totals.totalCalories,
    burnContext: { bodyweightKg: finished.bodyweightKg },
    durationMinutes: totals.durationMinutes,
    // The field every server reader of a workout uses (challenge totals,
    // lifetime volume).
    totalVolume: totals.tonnageKg,
    notes: finished.notes,
    createdAt: Timestamp.now(),
    source: finished.source,
    completionId: finished.completionId,
    ...finished.extra,
  });

  if (auth.currentUser?.uid !== uid)
    throw new Error("Sign in again to save your workout.");
  const queued =
    navigator.onLine === false || hasQueuedWorkoutCompletion(uid, workoutId);
  let committed: ProgramState | null | undefined;
  let sync: Promise<"synced" | "failed">;
  if (!queued) {
    committed = await commitWorkoutCompletion(
      db,
      uid,
      workoutId,
      data,
      finished.completion
    );
    sync = Promise.resolve("synced");
  } else {
    sync = queueWorkoutCompletion(
      db,
      uid,
      workoutId,
      data,
      finished.completion
    );
  }

  // Posting happens on the finish screen once the save has landed:
  // automatically when the user has said so, or from its share button.
  const lift: LiftForPost = {
    title: finished.title,
    exercises,
    durationMinutes: totals.durationMinutes,
  };
  const share = createSessionShare({
    uid,
    type: "workout",
    source: { kind: "workout", id: workoutId },
    preview: () => liftPostPreview(lift),
    payload: (decision) =>
      liftPost({ uid, ...finished.author }, lift, decision),
  });
  return {
    workoutId,
    share,
    syncStatus: queued ? "queued" : "synced",
    sync,
    ...(queued ? {} : { committed }),
  };
}
