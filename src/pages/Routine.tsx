import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { doc, Timestamp } from "firebase/firestore";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { logger } from "../lib/logger";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import {
  getSavedRoutine,
  type SavedRoutine,
  type SavedRoutineExercise,
} from "../lib/savedRoutines";
import { normalizeExercise } from "../features/program/programTypes";
import type { ProgramExercise } from "../features/program/programTypes";
import { Skeleton } from "../components/LoadingSkeleton";
import WorkoutSession from "../components/WorkoutSession";
import { estimateLiftBurn } from "../lib/workoutBurn";
import { compose, enqueueShare, showQueuedToast } from "../lib/shareComposer";
import { postActivity } from "../lib/socialApi";
import { toast } from "@/lib/toast";

/* Synthetic dayIndex used by saved-routine sessions.
   useWorkoutDraft keys drafts on dayIndex. Program days are 0-6, so
   -1 is safely out of band — a routine session's draft can't
   overwrite or be overwritten by a scheduled day's draft. Isolation
   BETWEEN routines comes from the LIFT-01 draft identity: the
   `routine:<id>` draftScope below means routine A's in-flight draft
   is never offered for resume inside routine B. */
const ROUTINE_DAY_INDEX = -1;

function exerciseFromRoutine(ex: SavedRoutineExercise): ProgramExercise {
  /* The saved routine snapshot only carries `setCount / targetReps /
     targetWeightKg` per exercise. Fill the rest of ProgramExercise's
     surface with safe defaults — the UI uses these for progression
     hints which don't apply to a one-off routine run, and for the
     workout-doc write which only consumes name / exerciseId / sets /
     reps / weight in practice. movementCategory is inferred from
     the exercise name via normalizeExercise → inferMovementCategory;
     the saved category flows into the workout doc and is read by
     analytics + MuscleHeatMap, so getting it right matters. */
  return normalizeExercise({
    name: ex.name,
    exerciseId:
      ex.exerciseId || `routine-${ex.name.toLowerCase().replace(/\s+/g, "-")}`,
    sets: Math.max(1, ex.setCount || 1),
    reps: Math.max(1, ex.targetReps || 8),
    weight: ex.targetWeightKg || 0,
    lastAttemptedWeight: ex.targetWeightKg || 0,
    lastSuccessfulWeight: ex.targetWeightKg || 0,
  });
}

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
 *     program-state mutation completeWorkoutDay does. The post-save
 *     share composer flow mirrors useProgram so the social loop
 *     stays identical.
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
  const handleLogExercise = useCallback(async () => {
    /* intentional no-op */
  }, []);

  const handleCompleteRoutine = useCallback(
    async (
      _dayIndex: number,
      sessionData?: {
        durationMinutes: number;
        setLogs: Array<
          Array<{ weight: number; reps: number; completed: boolean }>
        >;
      }
    ) => {
      if (!user || !routine || !synthDay) return;

      try {
        const today = format(new Date(), "yyyy-MM-dd");
        const workoutId = `${today}-routine-${Date.now()}`;
        const workoutRef = doc(db, "users", user.uid, "workouts", workoutId);

        const exercises = synthDay.exercises.map((ex, exIndex) => {
          const logs = sessionData?.setLogs?.[exIndex];
          const sets = logs
            ? logs
                .filter((l) => l.completed)
                .map((l, i) => ({
                  setNumber: i + 1,
                  reps: l.reps,
                  weightKg: l.weight,
                }))
            : Array.from({ length: ex.sets }, (_, i) => ({
                setNumber: i + 1,
                reps: ex.reps,
                weightKg: ex.weight,
              }));
          return {
            exerciseId: ex.exerciseId,
            exerciseName: ex.name,
            category: ex.movementCategory,
            sets,
            caloriesBurned: 0,
          };
        });

        const tonnage = exercises.reduce(
          (t, ex) =>
            t + ex.sets.reduce((s, set) => s + set.weightKg * set.reps, 0),
          0
        );
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

        await setDocGuarded(workoutRef, {
          date: today,
          exercises,
          totalCalories,
          durationMinutes: effectiveDurationMin,
          notes: `Routine: ${routine.name} (saved from ${routine.sourceAuthorName})`,
          createdAt: Timestamp.now(),
          source: "routine",
          routineId: routine.id,
          routineName: routine.name,
        });

        /* Share composer: same flow as useProgram.completeWorkoutDay.
           Title uses the routine name so the social card identifies
           the workout the same way the user thinks of it. */
        const decision = await compose({
          type: "workout",
          title: routine.name,
          meta: [
            `${synthDay.exercises.length} exercise${synthDay.exercises.length === 1 ? "" : "s"}`,
            tonnage > 0
              ? `${Math.round(tonnage).toLocaleString()}kg volume`
              : "",
            effectiveDurationMin > 0 ? `${effectiveDurationMin} min` : "",
          ].filter(Boolean),
        });
        if (decision) {
          const apiVisibility =
            decision.visibility === "crews" ? "followers" : decision.visibility;
          const includeCrewId =
            (decision.visibility === "crews" ||
              decision.visibility === "public") &&
            !!profile?.crewId;
          const payload = {
            authorId: user.uid,
            authorName: profile?.displayName || "Athlete",
            ...(profile?.photoURL ? { authorPhotoURL: profile.photoURL } : {}),
            type: "workout" as const,
            visibility: apiVisibility,
            ...(decision.caption ? { caption: decision.caption } : {}),
            workoutName: routine.name,
            activityTitle: routine.name,
            exerciseCount: synthDay.exercises.length,
            totalVolume: tonnage,
            duration: effectiveDurationMin * 60,
            ...(includeCrewId ? { crewId: profile?.crewId } : {}),
            exercises: synthDay.exercises.map((ex) => {
              const setCount = ex.sets;
              const targetReps = ex.reps;
              const targetWeightKg = ex.weight;
              return {
                name: ex.name,
                exerciseId: ex.exerciseId,
                summary: `${setCount}×${targetReps}×${targetWeightKg}kg`,
                setCount,
                targetReps,
                targetWeightKg,
              };
            }),
          };
          try {
            await postActivity(payload);
          } catch (socialErr) {
            const isOffline =
              typeof navigator !== "undefined" && navigator.onLine === false;
            if (isOffline) {
              enqueueShare(user.uid, payload);
              showQueuedToast();
            } else {
              logger.warn("Routine post failed:", socialErr);
            }
          }
        }

        /* Hist5d Stress 19 / PR 7b — return-link toast closes the
           PRs-tab cold-start loop. Any saved workout may have set
           a per-exercise lifetime or recent-bests PR, so we surface
           a quick way back to the PRs tab without forcing the user
           to remember to navigate. Sonner auto-dismisses in 4s;
           tap "View PRs" → /history?tab=prs. */
        toast.success("Workout saved", {
          action: {
            label: "View PRs",
            onClick: () => navigate("/history?tab=prs"),
          },
        });
        navigate("/program");
      } catch (err) {
        logger.error("[Routine] complete failed:", err);
        toast.error("Couldn't save workout. Try again.");
      }
    },
    [user, routine, synthDay, profile, navigate]
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
          className="text-xs font-medium text-primary"
        >
          Back to Program
        </button>
      </div>
    );
  }

  return (
    <WorkoutSession
      day={synthDay}
      dayIndex={ROUTINE_DAY_INDEX}
      draftScope={`routine:${routineId ?? "unknown"}`}
      onLogExercise={handleLogExercise}
      onCompleteDay={handleCompleteRoutine}
      onClose={() => navigate("/program")}
    />
  );
}
