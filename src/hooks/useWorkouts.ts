import { useState, useEffect, useCallback } from "react";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { estimateCalories } from "@/lib/exercises";

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

  useEffect(() => {
    if (!user) {
      setWorkouts([]);
      setLoading(false);
      return;
    }

    const workoutsRef = collection(db, "users", user.uid, "workouts");
    const q = query(workoutsRef, orderBy("date", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Workout[];
      setWorkouts(data);
      setLoading(false);
    });

    return unsubscribe;
  }, [user]);

  const saveWorkout = useCallback(
    async (workout: Omit<Workout, "id" | "createdAt">) => {
      if (!user) return;
      const workoutId = `${workout.date}-${Date.now()}`;
      const workoutRef = doc(db, "users", user.uid, "workouts", workoutId);
      await setDoc(workoutRef, {
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
    saveWorkout,
    deleteWorkout,
    getWorkoutsForDate,
    calculateExerciseCalories,
  };
}
