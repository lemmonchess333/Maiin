import { useState, useEffect, useCallback } from "react";
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
import { safeMerge } from "@/lib/offlineQueue";

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
  const { user } = useAuth();
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
      const data = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Workout[];
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
    const newData = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Workout[];
    setWorkouts(prev => [...prev, ...newData]);
    setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
    setHasMore(snapshot.docs.length >= PAGE_SIZE);
  }, [user, lastDoc, hasMore]);

  const saveWorkout = useCallback(
    async (workout: Omit<Workout, "id" | "createdAt">) => {
      if (!user) return;
      const workoutId = `${workout.date}-${Date.now()}`;
      await safeMerge(db, `users/${user.uid}/workouts`, workoutId, {
        ...workout,
        createdAt: Timestamp.now(),
      });
      return workoutId;
    },
    [user]
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
