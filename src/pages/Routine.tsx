import type { SessionPrescription } from "@/features/program/sessionCompletion";
import { commitWorkoutCompletion } from "@/lib/workoutCompletion";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { Timestamp } from "firebase/firestore";
import {
  hasQueuedWorkoutCompletion,
  queueWorkoutCompletion,
} from "@/lib/offlineQueue";
import { logger } from "../lib/logger";
import { auth, db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { getSavedRoutine, type SavedRoutine } from "../lib/savedRoutines";
import { exerciseFromRoutine } from "../features/program/routineExercise";
import { Skeleton } from "../components/LoadingSkeleton";
import WorkoutSession from "../components/WorkoutSession";
import { estimateLiftBurn } from "../lib/workoutBurn";
import { workoutTonnageKg } from "../hooks/useWorkouts";
import { projectWorkoutSets } from "@/features/program/workoutSetRecord";
import type { ActivityPost } from "../lib/activityPost";
import { createSessionShare } from "../lib/sessionPost";
import { toast } from "@/lib/toast";

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
 *   - A custom onCompleteDay handler that writes a workout doc with
 *     `source: "routine"` (instead of "programme") and skips the
 *     program-state mutation completeWorkoutDay does. Sharing goes
 *     through the same `createSessionShare` as useProgram, so the
 *     social loop stays identical.
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

      // Lift3: dated by the session's START, as the programme writer is.
      const today = format(
        typeof sessionData.startedAt === "number" &&
          Number.isFinite(sessionData.startedAt)
          ? new Date(sessionData.startedAt)
          : new Date(),
        "yyyy-MM-dd"
      );
      // Deterministic id — a retried/resumed Finish overwrites the same doc.
      const workoutId = `routine-${sessionData.completionId}`;

      const exercises = (
        sessionData.prescription?.exercises ?? synthDay.exercises
      ).map((ex, exIndex) => {
        const logs = sessionData?.setLogs?.[exIndex];
        // D2: the same shared projection the programme path uses. These two
        // were independent copies of identical logic, which is exactly the
        // shape CLAUDE.md's "the tested copy does not prove the running copy"
        // rule warns about — widening one and forgetting the other would have
        // left routine sessions silently three-field.
        const sets = projectWorkoutSets(logs, {
          sets: ex.sets,
          reps: ex.reps,
          weightKg: ex.weight,
        });
        const note = sessionData.exerciseNotes?.[exIndex]?.trim();
        return {
          exerciseId: ex.exerciseId,
          exerciseName: ex.name,
          category: ex.movementCategory,
          /* Carried onto the doc, conditionally, exactly as the programme
             writers do. Without it the persisted session loses the unit
             the runner just used: ExerciseHistory charts a hold on the
             reps axis, and the server's volume derivation — which reads
             this field to skip timed work — cannot tell it apart from
             weight moved. */
          ...(ex.repUnit !== undefined ? { repUnit: ex.repUnit } : {}),
          ...(note ? { notes: note } : {}),
          sets,
          caloriesBurned: 0,
        };
      });

      /* Was a fifth inline copy of the tonnage reduce, and an unguarded
         one. Marking timed exercises above makes that guard load-bearing
         for the first time — a routine's weighted plank would otherwise
         bank 20 kg × 60 s as 1,200 kg — so rather than add a sixth
         correct copy, this now calls the shared helper (#2045), which
         owns the rule and is tested for it. `exercises` is already the
         WorkoutExercise shape it takes. */
      const tonnage = workoutTonnageKg({ exercises });
      const completedSetCount = exercises.reduce(
        (c, ex) => c + ex.sets.length,
        0
      );
      const bodyweightKg = profile?.weightKg ?? 0;
      const durationMinutes =
        sessionData?.durationMinutes && sessionData.durationMinutes > 0
          ? sessionData.durationMinutes
          : 0;
      const totalCalories = estimateLiftBurn({
        durationMinutes,
        tonnageKg: tonnage,
        bodyweightKg,
        completedSetCount,
      });
      const effectiveDurationMin =
        durationMinutes > 0 ? durationMinutes : completedSetCount * 3;

      // ── CORE write. Propagate a failure so WorkoutSession keeps the
      // completed session mounted, retains the draft, and re-enables Save.
      const queued =
        navigator.onLine === false ||
        hasQueuedWorkoutCompletion(user.uid, workoutId);
      let sync: Promise<"synced" | "failed">;
      const workoutData = {
        date: today,
        exercises,
        totalCalories,
        burnContext: { bodyweightKg: profile?.weightKg ?? 0 },
        durationMinutes: effectiveDurationMin,
        /* Same omission as the programme path: every server consumer of
             a workout doc reads `totalVolume`, and it was only ever
             written onto the social activity post. */
        totalVolume: tonnage,
        notes: `Routine: ${routine.name} (saved from ${routine.sourceAuthorName})`,
        createdAt: Timestamp.now(),
        source: "routine",
        completionId: sessionData.completionId,
        routineId: routine.id,
        routineName: routine.name,
      };
      try {
        if (!queued) {
          await commitWorkoutCompletion(db, user.uid, workoutId, workoutData);
          sync = Promise.resolve("synced");
        } else {
          sync = queueWorkoutCompletion(db, user.uid, workoutId, workoutData);
        }
      } catch (err) {
        logger.error("[Routine] completion write failed:", err);
        toast.error("Couldn't save workout. Try again.");
        throw err;
      }

      // Sharing happens on the finish screen once the save has landed, the
      // same way as a programme workout. The title is the routine's name so
      // the post names the workout the way the user thinks of it.
      const share = createSessionShare({
        uid: user.uid,
        type: "workout",
        source: { kind: "workout", id: workoutId },
        preview: () => ({
          type: "workout",
          title: routine.name,
          meta: [
            `${synthDay.exercises.length} exercise${synthDay.exercises.length === 1 ? "" : "s"}`,
            tonnage > 0
              ? `${Math.round(tonnage).toLocaleString()} kg volume`
              : "",
            effectiveDurationMin > 0 ? `${effectiveDurationMin} min` : "",
          ].filter(Boolean),
        }),
        payload: (decision): ActivityPost => ({
          authorId: user.uid,
          authorName: profile?.displayName || "Athlete",
          ...(profile?.photoURL ? { authorPhotoURL: profile.photoURL } : {}),
          type: "workout" as const,
          visibility: decision.visibility,
          ...(decision.caption ? { caption: decision.caption } : {}),
          workoutName: routine.name,
          activityTitle: routine.name,
          exerciseCount: synthDay.exercises.length,
          totalVolume: tonnage,
          duration: effectiveDurationMin * 60,
          exercises: synthDay.exercises.map((ex) => {
            const setCount = ex.sets;
            const targetReps = ex.reps;
            const targetWeightKg = ex.weight;
            return {
              name: ex.name,
              exerciseId: ex.exerciseId,
              summary: `${setCount}×${targetReps}×${targetWeightKg} kg`,
              setCount,
              targetReps,
              targetWeightKg,
            };
          }),
        }),
      });
      return {
        workoutId,
        share,
        syncStatus: queued ? ("queued" as const) : ("synced" as const),
        sync,
      };
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
