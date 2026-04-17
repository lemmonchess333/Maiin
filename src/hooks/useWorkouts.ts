import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import {
  collection,
  deleteDoc,
  doc,
  query,
  orderBy,
  onSnapshot,
  Timestamp,
  limit,
  startAfter,
  getDocs,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { estimateCalories } from "@/lib/exercises";
import { estimateLiftBurn } from "@/lib/workoutBurn";
import { logger } from "@/lib/logger";
import { safeMerge } from "@/lib/offlineQueue";

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
  if (!input) return format(new Date(), "yyyy-MM-dd");
  if (input instanceof Date) return format(input, "yyyy-MM-dd");
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  try {
    return format(parseISO(input), "yyyy-MM-dd");
  } catch {
    logger.warn("saveWorkout: unparseable date, using today", input);
    return format(new Date(), "yyyy-MM-dd");
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

export function useWorkouts() {
  const { user, profile } = useAuth();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);

  const PAGE_SIZE = 50;

  useEffect(() => {
    if (!user) {
      const reset = () => { setWorkouts([]); setLoading(false); };
      reset();
      return;
    }

    const workoutsRef = collection(db, "users", user.uid, "workouts");
    const q = query(workoutsRef, orderBy("date", "desc"), limit(PAGE_SIZE));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Workout)
        .filter((d) => typeof d.date === 'string' && Array.isArray(d.exercises));
      setWorkouts(data);
      setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length >= PAGE_SIZE);
      setLoading(false);
    });

    return unsubscribe;
  }, [user]);

  const loadMore = useCallback(async () => {
    if (!user || !lastDoc || !hasMore) return;
    const workoutsRef = collection(db, "users", user.uid, "workouts");
    const q = query(workoutsRef, orderBy("date", "desc"), startAfter(lastDoc), limit(PAGE_SIZE));
    const snapshot = await getDocs(q);
    const newData = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Workout)
      .filter((d) => typeof d.date === 'string' && Array.isArray(d.exercises));
    setWorkouts(prev => [...prev, ...newData]);
    setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
    setHasMore(snapshot.docs.length >= PAGE_SIZE);
  }, [user, lastDoc, hasMore]);

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
            0,
          ),
        0,
      );
      const completedSetCount = workout.exercises.reduce(
        (c, ex) => c + (ex.sets?.length ?? 0),
        0,
      );
      const bodyweightKg = profile?.weightKg ?? 0;
      if (bodyweightKg <= 0) {
        logger.warn(
          "saveWorkout: profile.weightKg missing — workout will save with totalCalories=0",
        );
      }
      const totalCalories = estimateLiftBurn({
        durationMinutes: workout.durationMinutes ?? 0,
        tonnageKg,
        bodyweightKg,
        completedSetCount,
      });

      await safeMerge(db, `users/${user.uid}/workouts`, workoutId, {
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
    hasMore,
    loadMore,
    saveWorkout,
    deleteWorkout,
    getWorkoutsForDate,
    calculateExerciseCalories,
  };
}
