import type { SessionPrescription } from "@/features/program/sessionCompletion";
import { completeLift } from "@/lib/liftCompletion";
import type { LiftMomentFacts } from "@/lib/postMoments";
import { resolveLiftUnit } from "@/lib/liftLoad";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { auth } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import {
  diffCompletedRoutine,
  getSavedRoutine,
  updateSavedRoutine,
  type SavedRoutine,
  type SavedRoutineExercise,
} from "../lib/savedRoutines";
import {
  ROUTINE_DAY_INDEX,
  ROUTINE_DRAFT_EPOCH,
  routineDraftScope,
  routineSessionDay,
} from "../features/program/routineSession";
import { RESUME_PARAM } from "../lib/resumeParam";
import { Skeleton } from "../components/LoadingSkeleton";
import { ErrorState } from "../components/ui/ErrorState";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import WorkoutSession from "../components/WorkoutSession";
import { keepTitleWhole } from "@/lib/workoutLabels";
import { recoveryFoodPath } from "@/lib/recoveryFood";
import { haptic } from "@/lib/haptic";
import { toast } from "@/lib/toast";
import { logger } from "@/lib/logger";

/**
 * Saved-routine workout runner (PR 4.1).
 *
 * Reuses the existing WorkoutSession component (the same fullscreen
 * runner program days use) with two adaptations:
 *
 *   - The session built from the routine (`routineSession.ts`), under a
 *     day index no programme day has and a draft scope of the routine's
 *     own, so its draft is the one Home and Train recognise and offer
 *     back, and never another routine's or a programme day's.
 *   - A custom onCompleteDay handler that saves through the same
 *     `completeLift` as a programme day, with `source: "routine"` and
 *     no plan to move on, so the workout, its post and the sharing
 *     that follows are a programme workout's.
 */
export default function Routine() {
  const { routineId } = useParams<{ routineId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  /* Resume on Home's or Train's In progress strip (`?resume=1`) carries on
     with the routine's draft without asking "Resume workout?" again. Read
     as the page opens; the flag then comes off the address, so a reload
     or a Back to this page asks. */
  const [searchParams, setSearchParams] = useSearchParams();
  const resumeInAddress = searchParams.get(RESUME_PARAM) === "1";
  const [resumeOnOpen] = useState(resumeInAddress);
  useEffect(() => {
    if (!resumeInAddress) return;
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        next.delete(RESUME_PARAM);
        return next;
      },
      { replace: true }
    );
  }, [resumeInAddress, setSearchParams]);
  const [routine, setRoutine] = useState<SavedRoutine | null>(null);
  const [loading, setLoading] = useState(true);
  // A read that failed is not a routine that doesn't exist.
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [pendingTemplateSync, setPendingTemplateSync] = useState<{
    exercises: SavedRoutineExercise[];
    summary: string;
    status: "pending" | "saving" | "updated";
  } | null>(null);

  // The uid, not the user object: a new object for the same account is not
  // a reason to read again, and each read re-renders.
  const uid = user?.uid;

  useEffect(() => {
    if (!uid || !routineId) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await getSavedRoutine(uid, routineId);
        if (cancelled) return;
        setRoutine(r);
        setLoadFailed(false);
      } catch {
        if (cancelled) return;
        setRoutine(null);
        setLoadFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, routineId, attempt]);

  /* Synthetic workout day from the routine. Built once routine loads. */
  const synthDay = useMemo(
    () => (routine ? routineSessionDay(routine) : null),
    [routine]
  );

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
        /** The session's new bests and streak, for its post (Soc15). */
        moments?: LiftMomentFacts;
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
      const ran = sessionData.prescription?.exercises ?? synthDay.exercises;
      const { committed: _noPlan, ...receipt } = await completeLift({
        uid: user.uid,
        author: {
          displayName: profile?.displayName,
          photoURL: profile?.photoURL,
        },
        liftUnit: resolveLiftUnit(profile?.liftingWeightUnit),
        source: "routine",
        completionId: sessionData.completionId,
        startedAt: sessionData.startedAt,
        ran,
        setLogs: sessionData.setLogs,
        exerciseNotes: sessionData.exerciseNotes,
        supersets: sessionData.prescription?.supersets,
        durationMinutes: sessionData.durationMinutes,
        bodyweightKg: profile?.weightKg ?? 0,
        // The post names the workout the way the user thinks of it.
        title: routine.name,
        // Kept whole: the title is read up to the first " — " (`workoutTitle`),
        // and a routine's name or its author's can hold one.
        notes: keepTitleWhole(
          `Routine: ${routine.name} (saved from ${routine.sourceAuthorName})`
        ),
        extra: { routineId: routine.id, routineName: routine.name },
        moments: sessionData.moments,
      });

      const diff = diffCompletedRoutine(
        routine.exercises,
        ran,
        sessionData.setLogs
      );
      if (diff.changed) {
        setPendingTemplateSync({
          exercises: diff.updatedExercises,
          summary: diff.summary,
          status: "pending",
        });
      }

      return receipt;
    },
    [user, routine, synthDay, profile]
  );

  const applyTemplateSync = useCallback(async () => {
    if (!uid || !routine || !pendingTemplateSync) return;
    if (pendingTemplateSync.status !== "pending") return;
    setPendingTemplateSync((prev) =>
      prev ? { ...prev, status: "saving" } : prev
    );
    try {
      await updateSavedRoutine(uid, routine.id, {
        name: routine.name,
        exercises: pendingTemplateSync.exercises,
      });
      setRoutine((prev) =>
        prev
          ? {
              ...prev,
              sourceAuthorId: uid,
              exercises: pendingTemplateSync.exercises,
            }
          : prev
      );
      setPendingTemplateSync((prev) =>
        prev ? { ...prev, status: "updated" } : prev
      );
      haptic("light");
      toast.success("Routine updated");
    } catch (err) {
      logger.error("[Routine] template sync failed", err);
      setPendingTemplateSync((prev) =>
        prev ? { ...prev, status: "pending" } : prev
      );
      toast.error("Couldn’t update routine. Try again.");
    }
  }, [uid, routine, pendingTemplateSync]);

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="p-6 space-y-3 text-center">
        <ErrorState
          title="Couldn’t load this routine"
          description="Check your connection and try again."
          retry={{
            onClick: () => {
              setLoading(true);
              setLoadFailed(false);
              setAttempt((n) => n + 1);
            },
          }}
        />
        <button
          type="button"
          onClick={() => navigate("/program")}
          className="text-xs font-medium text-foreground"
        >
          Back to programme
        </button>
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
          className="text-xs font-medium text-foreground"
        >
          Back to programme
        </button>
      </div>
    );
  }

  const templateSyncNotice = pendingTemplateSync ? (
    <Card size="compact" className="space-y-3 text-left">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">
          {pendingTemplateSync.status === "updated"
            ? "Saved routine updated"
            : `Update ${routine.name}?`}
        </p>
        <p className="text-xs text-muted-foreground">
          {pendingTemplateSync.status === "updated"
            ? "Next time you run this routine, it will open with today’s exercises and targets."
            : pendingTemplateSync.summary}
        </p>
      </div>
      {pendingTemplateSync.status !== "updated" && (
        <Button
          variant="secondary"
          fullWidth
          loading={pendingTemplateSync.status === "saving"}
          onClick={() => void applyTemplateSync()}
        >
          Update saved routine
        </Button>
      )}
    </Card>
  ) : undefined;

  return (
    <WorkoutSession
      day={synthDay}
      dayIndex={ROUTINE_DAY_INDEX}
      draftScope={routineDraftScope(routine.id)}
      draftEpoch={ROUTINE_DRAFT_EPOCH}
      onCompleteDay={handleCompleteRoutine}
      onClose={() => navigate("/program")}
      onViewWorkout={(id) =>
        navigate(`/workout/${encodeURIComponent(id)}`, { replace: true })
      }
      onLogFood={() => navigate(recoveryFoodPath("lift"), { replace: true })}
      completionExtras={templateSyncNotice}
      resumeDraft={resumeOnOpen}
    />
  );
}
