import { useState, useEffect, useCallback } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import type { ProgramState, WorkoutDay } from "./programTypes";
import {
  generateProgram,
  advanceWeek,
  shouldAdvanceWeek,
  generateWeekPrescription,
} from "./programEngine";
import { toast } from "sonner";

const PROGRAM_DOC = "current";

export function useProgram() {
  const { user, profile } = useAuth();
  const [programState, setProgramState] = useState<ProgramState | null>(null);
  const [loading, setLoading] = useState(true);

  // Load program from Firestore
  useEffect(() => {
    if (!user || !profile) {
      setProgramState(null);
      setLoading(false);
      return;
    }

    const loadProgram = async () => {
      const ref = doc(db, "users", user.uid, "programState", PROGRAM_DOC);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        setProgramState(snap.data() as ProgramState);
      } else {
        // Generate initial program based on profile
        const goal = profile.program?.goal ?? "recomp";
        const weeklyTarget = profile.weeklyWorkoutsTarget ?? 4;
        const { splitType, workouts } = generateProgram(goal, weeklyTarget);

        const initial: ProgramState = {
          goal,
          currentPhase: "base",
          weekNumber: 1,
          splitType,
          workouts,
          fatigueScore: 0,
          updatedAt: Date.now(),
        };

        await setDoc(ref, initial);
        setProgramState(initial);
      }

      setLoading(false);
    };

    loadProgram().catch((err) => {
      console.error("Failed to load program:", err);
      setLoading(false);
    });
  }, [user, profile]);

  // Save program to Firestore
  const saveProgram = useCallback(
    async (state: ProgramState) => {
      if (!user) return;
      const ref = doc(db, "users", user.uid, "programState", PROGRAM_DOC);
      await setDoc(ref, { ...state, updatedAt: Date.now() });
      setProgramState(state);
    },
    [user],
  );

  // Mark a workout day as completed
  const completeWorkoutDay = useCallback(
    async (dayIndex: number) => {
      if (!programState || !user) return;

      const updated: ProgramState = {
        ...programState,
        workouts: programState.workouts.map((day, i) =>
          i === dayIndex ? { ...day, completed: true } : day,
        ),
      };

      // Check if all workouts completed → advance week
      if (shouldAdvanceWeek(updated.workouts)) {
        const advanced = advanceWeek(updated);
        await saveProgram(advanced);

        const prescription = generateWeekPrescription(advanced.weekNumber);
        if (prescription.deload) {
          toast.info("Deload week — reduce intensity and recover");
        } else {
          toast.success(`Week ${advanced.weekNumber} — push forward!`);
        }
      } else {
        await saveProgram(updated);
      }
    },
    [programState, user, saveProgram],
  );

  // Update a specific exercise's performance after logging
  const updateExercisePerformance = useCallback(
    async (dayIndex: number, exerciseIndex: number, updatedExercise: WorkoutDay["exercises"][number]) => {
      if (!programState) return;

      const updatedWorkouts = programState.workouts.map((day, di) => {
        if (di !== dayIndex) return day;
        return {
          ...day,
          exercises: day.exercises.map((ex, ei) =>
            ei === exerciseIndex ? updatedExercise : ex,
          ),
        };
      });

      await saveProgram({ ...programState, workouts: updatedWorkouts });
    },
    [programState, saveProgram],
  );

  // Regenerate program (e.g. when goal changes)
  const regenerateProgram = useCallback(
    async () => {
      if (!profile) return;

      const goal = profile.program?.goal ?? "recomp";
      const weeklyTarget = profile.weeklyWorkoutsTarget ?? 4;
      const { splitType, workouts } = generateProgram(
        goal,
        weeklyTarget,
        programState?.workouts,
      );

      const newState: ProgramState = {
        goal,
        currentPhase: "base",
        weekNumber: 1,
        splitType,
        workouts,
        fatigueScore: programState?.fatigueScore ?? 0,
        updatedAt: Date.now(),
      };

      await saveProgram(newState);
      toast.success("Program regenerated");
    },
    [profile, programState, saveProgram],
  );

  const prescription = programState
    ? generateWeekPrescription(programState.weekNumber)
    : null;

  return {
    programState,
    prescription,
    loading,
    completeWorkoutDay,
    updateExercisePerformance,
    regenerateProgram,
    saveProgram,
  };
}
