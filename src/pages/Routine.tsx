import type { SessionPrescription } from "@/features/program/sessionCompletion";
import { completeLift } from "@/lib/liftCompletion";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { auth } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { getSavedRoutine, type SavedRoutine } from "../lib/savedRoutines";
import { exerciseFromRoutine } from "../features/program/routineExercise";
import { Skeleton } from "../components/LoadingSkeleton";
import WorkoutSession from "../components/WorkoutSession";

/* Synthetic dayIndex used by saved-routine sessions.
   useWorkoutDraft keys drafts on dayIndex. Program days are 0-6, so
   -1 is safely out of band — a routine session's draft can't
   overwrite or be overwritten by a scheduled day's draft. Isolation
   BETWEEN routines comes from the LIFT-01 draft identity: the
   `routine:<id>` draftScope below means routine A's in-flight draft
   is never offered for resume inside routine B. */
const ROUTINE_DAY_INDEX = -1;

/**
 * Saved-routine workout runner (PR 4.1).
 *
 * Reuses the existing WorkoutSession component (the same fullscreen
 * runner program days use) with two adaptations:
 *
 *   - Synthetic dayIndex (-1) so useWorkoutDraft scopes the in-flight
 *     draft to "the routine session" without overwriting any program
 *     day's draft.
 *   - A custom onCompleteDay handler that saves through the same
 *     `completeLift` as a programme day, with `source: "routine"` and
 *     no plan to move on, so the workout, its post and the sharing
 *     that follows are a programme workout's.
 */
export default function Routine() {
  const { routineId } = useParams<{ routineId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [routine, setRoutine] = useState<SavedRoutine | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !routineId) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await getSavedRoutine(user.uid, routineId);
        if (cancelled) return;
        setRoutine(r);
      } catch {
        if (!cancelled) setRoutine(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, routineId]);

  /* Synthetic workout day from the routine. Built once routine loads. */
  const synthDay = useMemo(() => {
    if (!routine) return null;
    return {
      dayName: routine.name,
      dayType: "lift",
      exercises: routine.exercises.map(exerciseFromRoutine),
      completed: false,
    };
  }, [routine]);

  /* No-op log handler — completeWorkoutDay's onLogExercise is used to
     update the program state's progression history. Saved routines
     don't participate in progression tracking, so per-set logs are
     a workout-doc concern only and are captured at completion time
     from sessionData. */
  const handleCompleteRoutine = useCallback(
    async (
      _dayIndex: number,
      sessionData: {
        completionId: string;
        prescription?: SessionPrescription;
        durationMinutes: number;
        /** Lift3 — the doc is dated by when the session started. */
        startedAt?: number;
        exerciseNotes?: Record<number, string>;
        setLogs: Array<
          Array<{
            weight: number;
            reps: number;
            completed: boolean;
            type?: string;
            rpe?: number;
          }>
        >;
      }
    ) => {
      // Fail CLOSED — returning silently would let WorkoutSession clear the
      // draft + navigate as if the save succeeded.
      if (
        !user ||
        !routine ||
        !synthDay ||
        auth.currentUser?.uid !== user.uid
      ) {
        throw new Error(
          "Cannot save a routine without an active user + routine."
        );
      }

      // The same completion as a programme day's (`completeLift`), without
      // the plan: a routine takes no part in progression. Its post lists
      // what was done, as a programme workout's does, not the routine as
      // written. A failure throws to the workout screen, which keeps the
      // session and says so.
      const { committed: _noPlan, ...receipt } = await completeLift({
        uid: user.uid,
        author: {
          displayName: profile?.displayName,
          photoURL: profile?.photoURL,
        },
        source: "routine",
        completionId: sessionData.completionId,
        startedAt: sessionData.startedAt,
        ran: sessionData.prescription?.exercises ?? synthDay.exercises,
        setLogs: sessionData.setLogs,
        exerciseNotes: sessionData.exerciseNotes,
        durationMinutes: sessionData.durationMinutes,
        bodyweightKg: profile?.weightKg ?? 0,
        // The post names the workout the way the user thinks of it.
        title: routine.name,
        notes: `Routine: ${routine.name} (saved from ${routine.sourceAuthorName})`,
        extra: { routineId: routine.id, routineName: routine.name },
      });
      return receipt;
    },
    [user, routine, synthDay, profile]
  );

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!routine || !synthDay) {
    return (
      <div className="p-6 text-center space-y-3">
        <p className="text-sm font-semibold text-foreground">
          Routine not found
        </p>
        <button
          type="button"
          onClick={() => navigate("/program")}
          className="text-xs font-medium text-lifting-strong"
        >
          Back to program
        </button>
      </div>
    );
  }

  return (
    <WorkoutSession
      day={synthDay}
      dayIndex={ROUTINE_DAY_INDEX}
      draftScope={`routine:${routineId ?? "unknown"}`}
      onCompleteDay={handleCompleteRoutine}
      onClose={() => navigate("/program")}
    />
  );
}
