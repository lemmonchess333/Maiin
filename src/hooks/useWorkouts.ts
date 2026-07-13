import { useState, useEffect, useCallback } from "react";
import { parseISO } from "date-fns";
import { localDateString } from "@/lib/dateHelpers";
import {
  collection,
  deleteDoc,
  doc,
  query,
  orderBy,
  onSnapshot,
  Timestamp,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { estimateCalories } from "@/lib/exercises";
import { estimateLiftBurn } from "@/lib/workoutBurn";
import { logger } from "@/lib/logger";
import { safeMerge } from "@/lib/offlineQueue";
import { noteActivitySnapshot } from "@/lib/activationTracker";

/**
 * Normalise a caller-supplied workout date to a local "yyyy-MM-dd" string.
 *
 * Callers historically passed a mix of pre-formatted date strings, ISO
 * timestamps (often UTC, via `new Date().toISOString()`), and Date objects.
 * Storing UTC strings breaks near-midnight reads on the useEffectiveTargets
 * / isWorkoutOnDate side, which both use local-timezone keys. This helper
 * routes each input shape through the correct parse path:
 *
 *   - undefined                    → today (local)
 *   - Date instance                → local yyyy-MM-dd
 *   - "yyyy-MM-dd" string          → passed through unchanged
 *   - ISO or other string          → parseISO then format local
 *   - unparseable string           → today (local), logged
 */
function normaliseWorkoutDate(input: string | Date | undefined): string {
  if (!input) return localDateString();
  if (input instanceof Date) return localDateString(input);
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  try {
    return localDateString(parseISO(input));
  } catch {
    logger.warn("saveWorkout: unparseable date, using today", input);
    return localDateString();
  }
}

export interface WorkoutSet {
  setNumber: number;
  reps: number;
  weightKg: number;
}

export interface WorkoutExercise {
  exerciseId: string;
  exerciseName: string;
  category: string;
  sets: WorkoutSet[];
  caloriesBurned: number;
  // Cardio-specific (optional)
  durationMinutes?: number;
  distanceKm?: number;
  intensity?: "low" | "moderate" | "high";
}

export interface Workout {
  id: string;
  date: string;
  exercises: WorkoutExercise[];
  totalCalories: number;
  durationMinutes: number;
  notes: string;
  createdAt: Timestamp;
}

/** Total kg lifted in a session, derived from its sets. saveWorkout computes
 *  this for the burn formula but does NOT persist it, so consumers derive it
 *  from `exercises` (correct for every doc, old and new). */
export function workoutTonnageKg(workout: Pick<Workout, "exercises">): number {
  // Defensive `?? []`: legacy docs can miss `exercises` entirely; the
  // guarded per-set multiply already tolerates missing weight/reps, so
  // the container should tolerate a missing list the same way.
  return (workout.exercises ?? []).reduce(
    (t, ex) =>
      t +
      (ex.sets ?? []).reduce(
        (s, set) => s + (set.weightKg || 0) * (set.reps || 0),
        0
      ),
    0
  );
}

/**
 * Read coverage for the workouts subscription.
 *  - "recent"   (default) — the newest RECENT_WORKOUT_LIMIT workouts. Correct
 *    for Home / Programme / feed surfaces that only need latest state.
 *  - "complete" — every workout document, newest-first. Required by the
 *    surfaces that promise LIFETIME data (History, ExerciseHistory), which
 *    were silently omitting the oldest once a user logged >50 workouts.
 */
export type WorkoutCoverage = "recent" | "complete";

export interface UseWorkoutsOptions {
  coverage?: WorkoutCoverage;
}

const RECENT_WORKOUT_LIMIT = 50;

export function useWorkouts(options: UseWorkoutsOptions = {}) {
  const { user, profile } = useAuth();
  const uid = user?.uid;
  const coverage = options.coverage ?? "recent";
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setWorkouts([]);
      setLoading(false);
      return;
    }

    // Never render account A's history while account B's listener is still
    // establishing, and reset cleanly when coverage changes. The captured
    // `uid` is the only uid these callbacks may act on.
    let active = true;
    setWorkouts([]);
    setLoading(true);

    const workoutsRef = collection(db, "users", uid, "workouts");
    const q =
      coverage === "complete"
        ? query(workoutsRef, orderBy("date", "desc"))
        : query(
            workoutsRef,
            orderBy("date", "desc"),
            limit(RECENT_WORKOUT_LIMIT)
          );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!active) return;
        const data = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Workout)
          .filter(
            (d) => typeof d.date === "string" && Array.isArray(d.exercises)
          );
        setWorkouts(data);
        setLoading(false);
        // Activation funnel: fire `workout_completed` once per newly-created
        // workout across all write paths. Only the "recent" listener is the
        // lifecycle event source — a "complete" listener can mount after a
        // recent one and would falsely count every pre-existing workout
        // beyond the first 50 as newly-created activity.
        if (coverage === "recent") {
          noteActivitySnapshot(
            "workout",
            uid,
            snapshot.docs.map((d) => d.id)
          );
        }
      },
      // Surface the failure so the UI exits its skeleton; retain any
      // previously loaded workouts so a transient rule or network error
      // doesn't empty the history view.
      (err) => {
        if (!active) return;
        logger.error("[useWorkouts] snapshot subscription failed", err);
        setLoading(false);
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [uid, coverage]);

  const saveWorkout = useCallback(
    async (workout: Omit<Workout, "id" | "createdAt">) => {
      if (!user) return;
      const date = normaliseWorkoutDate(workout.date);
      const workoutId = `${date}-${Date.now()}`;

      // Canonicalise totalCalories via the shared estimateLiftBurn formula,
      // ignoring any caller-supplied value. WorkoutLogger used to sum
      // per-exercise `caloriesBurned`, which was zero whenever the user
      // didn't fill cardio duration inputs. One formula, one source of
      // truth. Per-exercise `caloriesBurned` is kept in the schema for
      // backwards compat but is NOT summed here; do not reintroduce that.
      const tonnageKg = workout.exercises.reduce(
        (t, ex) =>
          t +
          (ex.sets ?? []).reduce(
            (s, set) => s + (set.weightKg || 0) * (set.reps || 0),
            0
          ),
        0
      );
      const completedSetCount = workout.exercises.reduce(
        (c, ex) => c + (ex.sets?.length ?? 0),
        0
      );
      const bodyweightKg = profile?.weightKg ?? 0;
      if (bodyweightKg <= 0) {
        logger.warn(
          "saveWorkout: profile.weightKg missing — workout will save with totalCalories=0"
        );
      }
      const totalCalories = estimateLiftBurn({
        durationMinutes: workout.durationMinutes ?? 0,
        tonnageKg,
        bodyweightKg,
        completedSetCount,
      });

      await safeMerge(db, user.uid, `users/${user.uid}/workouts`, workoutId, {
        ...workout,
        date,
        totalCalories,
        createdAt: Timestamp.now(),
      });
      return workoutId;
    },
    [user, profile?.weightKg]
  );

  const deleteWorkout = useCallback(
    async (workoutId: string) => {
      if (!user) return;
      await deleteDoc(doc(db, "users", user.uid, "workouts", workoutId));
    },
    [user]
  );

  const getWorkoutsForDate = useCallback(
    (date: string) => {
      return workouts.filter((w) => w.date === date);
    },
    [workouts]
  );

  const calculateExerciseCalories = useCallback(
    (exerciseId: string, sets: WorkoutSet[], userWeightKg: number): number => {
      let total = 0;
      sets.forEach((s) => {
        total += estimateCalories(exerciseId, 1, s.reps, userWeightKg);
      });
      return total;
    },
    []
  );

  return {
    workouts,
    loading,
    saveWorkout,
    deleteWorkout,
    getWorkoutsForDate,
    calculateExerciseCalories,
  };
}
