import { useState, useEffect, useCallback } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import type { ProgramState, ProgramSettings, ProgramExercise, ScheduledRunDay } from "./programTypes";
import { normalizeProgramState } from "./programTypes";
import {
  generateProgram,
  advanceWeek,
  shouldAdvanceWeek,
  generateWeekPrescription,
  applyProgression,
} from "./programEngine";
import {
  scheduleStructuredWeek,
  generateRacePlan,
  getCurrentRaceWeek,
} from "./runScheduler";
import { toast } from "sonner";

const PROGRAM_DOC = "current";

export function useProgram() {
  const { user, profile } = useAuth();
  const [programState, setProgramState] = useState<ProgramState | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewingHistoryIndex, setViewingHistoryIndex] = useState<number | null>(null);

  // Load program from Firestore (with backward-compat normalize)
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
        const raw = snap.data() as ProgramState;
        const normalized = normalizeProgramState(raw);

        // Hydrate run days if user has run mode but no runDays yet
        if (!normalized.runDays && profile.runMode && profile.runMode !== "freeform") {
          const liftDays = normalized.workouts.length;
          const runTarget = profile.weeklyRunDaysTarget ?? 3;
          let runDays: ScheduledRunDay[] = [];
          let runPlan = normalized.runPlan;

          if (profile.runMode === "race_prep" && profile.raceGoal) {
            const plan = generateRacePlan(
              profile.raceGoal.distance,
              profile.raceGoal.targetDate,
              liftDays,
              runTarget,
            );
            const weekIdx = getCurrentRaceWeek(plan.totalWeeks, profile.raceGoal.targetDate);
            runDays = plan.weeks[weekIdx] ?? [];
            runPlan = {
              mode: "race_prep",
              raceGoal: profile.raceGoal,
              totalWeeks: plan.totalWeeks,
              currentWeek: weekIdx,
            };
          } else {
            runDays = scheduleStructuredWeek(liftDays, runTarget, normalized.weekNumber);
            runPlan = { mode: "structured" };
          }

          const withRuns = { ...normalized, runDays, runPlan };
          await setDoc(ref, { ...withRuns, updatedAt: Date.now() }, { merge: true });
          setProgramState(withRuns);
        } else {
          setProgramState(normalized);
        }
      } else {
        const goal = profile.program?.goal ?? "recomp";
        const weeklyTarget = profile.weeklyWorkoutsTarget ?? 4;
        const { splitType, workouts } = generateProgram(goal, weeklyTarget);

        // Generate run schedule if applicable
        let runDays: ScheduledRunDay[] | undefined;
        let runPlan: ProgramState["runPlan"];
        if (profile.runMode && profile.runMode !== "freeform") {
          const runTarget = profile.weeklyRunDaysTarget ?? 3;
          if (profile.runMode === "race_prep" && profile.raceGoal) {
            const plan = generateRacePlan(
              profile.raceGoal.distance,
              profile.raceGoal.targetDate,
              workouts.length,
              runTarget,
            );
            const weekIdx = getCurrentRaceWeek(plan.totalWeeks, profile.raceGoal.targetDate);
            runDays = plan.weeks[weekIdx] ?? [];
            runPlan = {
              mode: "race_prep",
              raceGoal: profile.raceGoal,
              totalWeeks: plan.totalWeeks,
              currentWeek: weekIdx,
            };
          } else {
            runDays = scheduleStructuredWeek(workouts.length, runTarget, 1);
            runPlan = { mode: "structured" };
          }
        }

        const initial: ProgramState = {
          goal,
          currentPhase: "base",
          weekNumber: 1,
          splitType,
          workouts,
          fatigueScore: 0,
          updatedAt: Date.now(),
          settings: { autoProgression: true, microloading: true },
          weekHistory: [],
          runDays,
          runPlan,
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

  // Mark a workout day as completed (does NOT auto-advance week)
  const completeWorkoutDay = useCallback(
    async (dayIndex: number) => {
      if (!programState || !user) return;

      const updated: ProgramState = {
        ...programState,
        workouts: programState.workouts.map((day, i) =>
          i === dayIndex ? { ...day, completed: true } : day,
        ),
      };

      await saveProgram(updated);

      const allDone = updated.workouts.every((d) => d.completed);
      if (allDone) {
        toast.success("All workouts complete! Advance to next week when ready.");
      }
    },
    [programState, user, saveProgram],
  );

  // Manually advance to next week (called from UI)
  const advanceToNextWeek = useCallback(
    async () => {
      if (!programState) return;
      if (!shouldAdvanceWeek(programState.workouts)) return;

      const advanced = advanceWeek(programState);

      // Refresh run days for new week
      if (profile?.runMode && profile.runMode !== "freeform") {
        const liftDays = advanced.workouts.length;
        const runTarget = profile.weeklyRunDaysTarget ?? 3;

        if (profile.runMode === "race_prep" && profile.raceGoal && advanced.runPlan?.totalWeeks) {
          const weekIdx = getCurrentRaceWeek(advanced.runPlan.totalWeeks, profile.raceGoal.targetDate);
          const plan = generateRacePlan(
            profile.raceGoal.distance,
            profile.raceGoal.targetDate,
            liftDays,
            runTarget,
          );
          advanced.runDays = plan.weeks[weekIdx] ?? [];
          advanced.runPlan = { ...advanced.runPlan, currentWeek: weekIdx };
        } else {
          advanced.runDays = scheduleStructuredWeek(liftDays, runTarget, advanced.weekNumber);
        }
      }

      await saveProgram(advanced);

      const rx = generateWeekPrescription(advanced.weekNumber);
      if (rx.deload) {
        toast.info("Deload week — reduce intensity and recover");
      } else {
        toast.success(`Week ${advanced.weekNumber} started`);
      }
    },
    [programState, profile, saveProgram],
  );

  // Mark a run day as completed
  const completeRunDay = useCallback(
    async (dayIndex: number) => {
      if (!programState?.runDays || !user) return;

      const updated: ProgramState = {
        ...programState,
        runDays: programState.runDays.map((rd) =>
          rd.dayIndex === dayIndex ? { ...rd, completed: true } : rd,
        ),
      };

      await saveProgram(updated);

      const allRunsDone = updated.runDays!.every((rd) => rd.completed);
      const allLiftsDone = updated.workouts.every((d) => d.completed);
      if (allRunsDone && allLiftsDone) {
        toast.success("All workouts & runs complete! Ready for next week.");
      }
    },
    [programState, user, saveProgram],
  );

  // Override a run day template
  const overrideRunDay = useCallback(
    async (dayIndex: number, templateId: string) => {
      if (!programState?.runDays) return;

      const updated: ProgramState = {
        ...programState,
        runDays: programState.runDays.map((rd) =>
          rd.dayIndex === dayIndex
            ? { ...rd, templateId, userOverride: templateId }
            : rd,
        ),
      };

      await saveProgram(updated);
      toast.success("Run day updated");
    },
    [programState, saveProgram],
  );

  // Log exercise performance with auto-progression
  const logExercise = useCallback(
    async (
      dayIndex: number,
      exerciseIndex: number,
      actualReps: number,
      actualWeight: number,
    ) => {
      if (!programState) return;

      const settings = programState.settings ?? { autoProgression: true, microloading: true };
      const exercise = programState.workouts[dayIndex]?.exercises[exerciseIndex];
      if (!exercise) return;

      let updatedExercise: ProgramExercise;
      if (settings.autoProgression) {
        updatedExercise = applyProgression(
          exercise,
          actualReps,
          actualWeight,
          programState.goal,
          settings.microloading,
        );
      } else {
        updatedExercise = {
          ...exercise,
          lastAttemptedWeight: actualWeight,
          lastPerformance: {
            sets: exercise.sets,
            reps: actualReps,
            weight: actualWeight,
            completed: actualReps >= exercise.reps,
          },
        };
      }

      if (updatedExercise.plateauCount > 0 && updatedExercise.plateauCount !== exercise.plateauCount) {
        toast("Plateau detected — variation may rotate", { icon: "⚠️" });
      }

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

  // Update exercise manually (weight override)
  const updateExercise = useCallback(
    async (dayIndex: number, exerciseIndex: number, updates: Partial<ProgramExercise>) => {
      if (!programState) return;

      const updatedWorkouts = programState.workouts.map((day, di) => {
        if (di !== dayIndex) return day;
        return {
          ...day,
          exercises: day.exercises.map((ex, ei) =>
            ei === exerciseIndex ? { ...ex, ...updates } : ex,
          ),
        };
      });

      await saveProgram({ ...programState, workouts: updatedWorkouts });
    },
    [programState, saveProgram],
  );

  // Update settings
  const updateSettings = useCallback(
    async (updates: Partial<ProgramSettings>) => {
      if (!programState) return;
      const current = programState.settings ?? { autoProgression: true, microloading: true };
      const newSettings = { ...current, ...updates };
      await saveProgram({ ...programState, settings: newSettings });
    },
    [programState, saveProgram],
  );

  // Regenerate program (goal or split change)
  const regenerateProgram = useCallback(
    async (goalOverride?: string, weeklyTargetOverride?: number) => {
      if (!profile) return;

      const goal = (goalOverride ?? programState?.goal ?? profile.program?.goal ?? "recomp") as ProgramState["goal"];
      const weeklyTarget = weeklyTargetOverride ?? profile.weeklyWorkoutsTarget ?? 4;
      const { splitType, workouts } = generateProgram(
        goal,
        weeklyTarget,
        programState?.workouts,
      );

      // Regenerate run schedule
      let runDays: ScheduledRunDay[] | undefined;
      let runPlan: ProgramState["runPlan"];
      if (profile.runMode && profile.runMode !== "freeform") {
        const runTarget = profile.weeklyRunDaysTarget ?? 3;
        if (profile.runMode === "race_prep" && profile.raceGoal) {
          const plan = generateRacePlan(
            profile.raceGoal.distance,
            profile.raceGoal.targetDate,
            workouts.length,
            runTarget,
          );
          const weekIdx = getCurrentRaceWeek(plan.totalWeeks, profile.raceGoal.targetDate);
          runDays = plan.weeks[weekIdx] ?? [];
          runPlan = {
            mode: "race_prep",
            raceGoal: profile.raceGoal,
            totalWeeks: plan.totalWeeks,
            currentWeek: weekIdx,
          };
        } else {
          runDays = scheduleStructuredWeek(workouts.length, runTarget, 1);
          runPlan = { mode: "structured" };
        }
      }

      const newState: ProgramState = {
        goal,
        currentPhase: "base",
        weekNumber: 1,
        splitType,
        workouts,
        fatigueScore: programState?.fatigueScore ?? 0,
        updatedAt: Date.now(),
        settings: programState?.settings ?? { autoProgression: true, microloading: true },
        weekHistory: [],
        runDays,
        runPlan,
      };

      await saveProgram(newState);
      setViewingHistoryIndex(null);
      toast.success("Program regenerated");
    },
    [profile, programState, saveProgram],
  );

  // Week navigation
  const viewWeek = useCallback((historyIndex: number | null) => {
    setViewingHistoryIndex(historyIndex);
  }, []);

  const viewedWorkouts = viewingHistoryIndex !== null
    ? programState?.weekHistory?.[viewingHistoryIndex]?.workouts ?? null
    : null;

  const viewedWeekNumber = viewingHistoryIndex !== null
    ? programState?.weekHistory?.[viewingHistoryIndex]?.weekNumber ?? null
    : null;

  const prescription = programState
    ? generateWeekPrescription(programState.weekNumber)
    : null;

  return {
    programState,
    prescription,
    loading,
    completeWorkoutDay,
    advanceToNextWeek,
    logExercise,
    updateExercise,
    updateSettings,
    regenerateProgram,
    saveProgram,
    completeRunDay,
    overrideRunDay,
    viewWeek,
    viewingHistoryIndex,
    viewedWorkouts,
    viewedWeekNumber,
  };
}
