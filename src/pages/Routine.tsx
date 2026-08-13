import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { doc, Timestamp } from "firebase/firestore";
import { setDocGuarded, updateDocGuarded } from "@/lib/firestoreWrite";
import { logger } from "../lib/logger";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { getSavedRoutine, type SavedRoutine } from "../lib/savedRoutines";
import { exerciseFromRoutine } from "../features/program/routineExercise";
import { Skeleton } from "../components/LoadingSkeleton";
import WorkoutSession from "../components/WorkoutSession";
import { estimateLiftBurn } from "../lib/workoutBurn";
import { workoutTonnageKg } from "../hooks/useWorkouts";
import { projectWorkoutSets } from "@/features/program/workoutSetRecord";
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
      sessionData: {
        completionId: string;
        durationMinutes: number;
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
      if (!user || !routine || !synthDay) {
        throw new Error(
          "Cannot save a routine without an active user + routine."
        );
      }

      const today = format(new Date(), "yyyy-MM-dd");
      // Deterministic id — a retried/resumed Finish overwrites the same doc.
      const workoutId = `routine-${sessionData.completionId}`;
      const workoutRef = doc(db, "users", user.uid, "workouts", workoutId);

      const exercises = synthDay.exercises.map((ex, exIndex) => {
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
      try {
        const workoutWrite = setDocGuarded(workoutRef, {
          date: today,
          exercises,
          totalCalories,
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
        });
        if (navigator.onLine) {
          await workoutWrite;
        } else {
          // #1887 — offline, the ack arrives only on reconnect; awaiting
          // it parked the chain (session hang, share enqueue below
          // unreachable). The write is durably queued in IndexedDB —
          // proceed, and log a post-reconnect rejection.
          void workoutWrite.catch((err) =>
            logger.error("[Routine] queued offline write failed:", err)
          );
        }
      } catch (err) {
        logger.error("[Routine] completion write failed:", err);
        toast.error("Couldn't save workout. Try again.");
        throw err;
      }

      // ── POST-SAVE best-effort: sharing must not invalidate a saved workout.
      try {
        /* Share composer: same flow as useProgram.completeWorkoutDay.
           Title uses the routine name so the social card identifies
           the workout the same way the user thinks of it. */
        const decision = await compose(user.uid, {
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
          const payload = {
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
                summary: `${setCount}×${targetReps}×${targetWeightKg}kg`,
                setCount,
                targetReps,
                targetWeightKg,
              };
            }),
          };
          if (typeof navigator !== "undefined" && navigator.onLine === false) {
            /* #1887 — pre-gate, not a catch: a parked postActivity never
               throws offline, so the old catch-only branch could not
               fire. Queue up-front; ShareComposerSheet's drain effect
               replays it on reconnect. */
            enqueueShare(user.uid, payload);
            showQueuedToast();
          } else {
            try {
              const activityId = await postActivity(payload);
              // Same dedupe marker the programme path writes — `/workout/:id`
              // reads it so a session already in the feed isn't offered up a
              // second time. Best-effort; a failed marker risks a duplicate
              // post, never the post itself.
              try {
                await updateDocGuarded(workoutRef, {
                  sharedActivityId: activityId,
                });
              } catch (markErr) {
                logger.warn("[Routine] shared marker write failed:", markErr);
              }
            } catch (socialErr) {
              logger.warn("Routine post failed:", socialErr);
            }
          }
        }
      } catch (err) {
        logger.warn("[Routine] post-save sharing failed:", err);
      }

      /* Hist5d Stress 19 / PR 7b — return-link toast closes the
         PRs-tab cold-start loop. Any saved workout may have set
         a per-exercise lifetime or recent-bests PR, so we surface
         a quick way back to the PRs tab. Sonner auto-dismisses in 4s;
         tap "View PRs" → /history?tab=prs. No navigate("/program") here —
         WorkoutSession's onClose handles navigation on success; a thrown
         core-write error keeps the completed session mounted. */
      toast.success("Workout saved", {
        action: {
          label: "View PRs",
          onClick: () => navigate("/history?tab=prs"),
        },
      });
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
