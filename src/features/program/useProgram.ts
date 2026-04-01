import { useState, useEffect, useCallback } from "react";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { postActivity } from "@/lib/socialApi";
import type { ProgramState, ProgramSettings, ProgramExercise, ScheduledRunDay } from "./programTypes";
import { normalizeProgramState } from "./programTypes";
import {
  generateProgram,
  advanceWeek,
  shouldAdvanceWeek,
  generateWeekPrescription,
  applyProgression,
} from "./programEngine";
import { logger } from "@/lib/logger";
import {
  scheduleStructuredWeek,
  generateRacePlan,
  getCurrentRaceWeek,
} from "./runScheduler";
import { toast } from "sonner";

const PROGRAM_DOC = "current";

function getLiftDayIndices(weekSchedule?: { day: number; type: string }[]): number[] | undefined {
  if (!weekSchedule || weekSchedule.length !== 7) return undefined;
  const indices = weekSchedule.filter(s => s.type === "lift" || s.type === "both").map(s => s.day);
  return indices.length > 0 ? indices : undefined;
}

export function useProgram() {
  const { user, profile, updateProfile } = useAuth();
  const [programState, setProgramState] = useState<ProgramState | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewingHistoryIndex, setViewingHistoryIndex] = useState<number | null>(null);

  // Load program from Firestore (with backward-compat normalize)
  useEffect(() => {
    const loadProgram = async () => {
      if (!user || !profile) {
        setProgramState(null);
        setLoading(false);
        return;
      }

      const ref = doc(db, "users", user.uid, "programState", PROGRAM_DOC);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const raw = snap.data() as ProgramState;
        const normalized = normalizeProgramState(raw);

        // Hydrate run days if user has run mode but no runDays yet
        if (!normalized.runDays && profile.runMode && profile.runMode !== "freeform") {
          const liftCount = normalized.workouts.length;
          const liftIndices = getLiftDayIndices(profile.weekSchedule);
          const runTarget = profile.weeklyRunDaysTarget ?? 3;
          let runDays: ScheduledRunDay[] = [];
          let runPlan = normalized.runPlan;

          if (profile.runMode === "race_prep" && profile.raceGoal) {
            const plan = generateRacePlan(
              profile.raceGoal.distance,
              profile.raceGoal.targetDate,
              liftCount,
              runTarget,
              liftIndices,
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
            runDays = scheduleStructuredWeek(liftCount, runTarget, normalized.weekNumber, liftIndices);
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
          const liftIndices = getLiftDayIndices(profile.weekSchedule);
          if (profile.runMode === "race_prep" && profile.raceGoal) {
            const plan = generateRacePlan(
              profile.raceGoal.distance,
              profile.raceGoal.targetDate,
              workouts.length,
              runTarget,
              liftIndices,
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
            runDays = scheduleStructuredWeek(workouts.length, runTarget, 1, liftIndices);
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
          ...(runDays !== undefined && { runDays }),
          ...(runPlan !== undefined && { runPlan }),
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
      // Strip undefined values — Firestore rejects them
      const clean = Object.fromEntries(
        Object.entries({ ...state, updatedAt: Date.now() }).filter(([, v]) => v !== undefined),
      );
      try {
        await setDoc(ref, clean);
        setProgramState(state);
      } catch (error) {
        console.error('[Program] Save failed:', error);
        toast.error('Failed to save programme changes');
        throw error;
      }
    },
    [user],
  );

  // Mark a workout day as completed (does NOT auto-advance week)
  // Also writes to workouts collection so Home stats can see it
  const completeWorkoutDay = useCallback(
    async (dayIndex: number) => {
      if (!programState || !user) return;

      const day = programState.workouts[dayIndex];
      if (!day) return;

      const updated: ProgramState = {
        ...programState,
        workouts: programState.workouts.map((d, i) =>
          i === dayIndex ? { ...d, completed: true } : d,
        ),
      };

      await saveProgram(updated);

      // Write to workouts collection so Home/performance engine picks it up
      try {
        const today = new Date().toISOString().split("T")[0];
        const workoutId = `${today}-prog-${Date.now()}`;
        const workoutRef = doc(db, "users", user.uid, "workouts", workoutId);

        const exercises = day.exercises.map((ex) => {
          const weight = ex.lastAttemptedWeight || ex.weight;
          return {
            exerciseId: ex.exerciseId,
            exerciseName: ex.name,
            category: ex.movementCategory,
            sets: Array.from({ length: ex.sets }, (_, i) => ({
              setNumber: i + 1,
              reps: ex.lastPerformance?.reps ?? ex.reps,
              weightKg: weight,
            })),
            caloriesBurned: 0,
          };
        });

        const tonnage = exercises.reduce(
          (t, ex) => t + ex.sets.reduce((s, set) => s + set.weightKg * set.reps, 0),
          0,
        );

        await setDoc(workoutRef, {
          date: today,
          exercises,
          totalCalories: Math.round(tonnage * 0.05),
          durationMinutes: day.exercises.length * 5,
          notes: `${day.dayName} — Programme Week ${programState.weekNumber}`,
          createdAt: Timestamp.now(),
          source: "programme",
        });
        // Post to social feed if autoPostWorkouts is enabled
        if (profile?.autoPostWorkouts !== false) {
          const uniqueCategories = [...new Set(day.exercises.map(ex => ex.movementCategory).filter(Boolean))];
          try {
            await postActivity({
              authorId: user.uid,
              authorName: profile?.displayName || 'Athlete',
              type: 'workout',
              visibility: (profile?.defaultVisibility as 'public' | 'followers' | 'private') || 'public',
              workoutName: day.dayName,
              activityTitle: day.dayName,
              exerciseCount: day.exercises.length,
              totalVolume: tonnage,
              duration: day.exercises.length * 5 * 60, // estimated seconds
              muscleGroups: uniqueCategories,
              crewId: profile?.crewId,
              exercises: exercises.slice(0, 3).map(ex => ({
                name: ex.exerciseName,
                summary: `${ex.sets.length}×${ex.sets[0]?.reps ?? 0}×${ex.sets[0]?.weightKg ?? 0}kg`,
              })),
            });
          } catch (socialErr) {
            logger.warn("Failed to post workout to feed:", socialErr);
          }
        }
      } catch (err) {
        logger.warn("Failed to sync programme day to workouts:", err);
      }

      const allDone = updated.workouts.every((d) => d.completed);
      if (allDone) {
        toast.success("All workouts complete! Advance to next week when ready.");
      }
    },
    [programState, user, saveProgram, profile],
  );

  // Manually advance to next week (called from UI)
  const advanceToNextWeek = useCallback(
    async () => {
      if (!programState) return;
      if (!shouldAdvanceWeek(programState.workouts)) return;

      const advanced = advanceWeek(programState);

      // Refresh run days for new week
      if (profile?.runMode && profile.runMode !== "freeform") {
        const liftCount = advanced.workouts.length;
        const liftIndices = getLiftDayIndices(profile.weekSchedule);
        const runTarget = profile.weeklyRunDaysTarget ?? 3;

        if (profile.runMode === "race_prep" && profile.raceGoal && advanced.runPlan?.totalWeeks) {
          const weekIdx = getCurrentRaceWeek(advanced.runPlan.totalWeeks, profile.raceGoal.targetDate);
          const plan = generateRacePlan(
            profile.raceGoal.distance,
            profile.raceGoal.targetDate,
            liftCount,
            runTarget,
            liftIndices,
          );
          advanced.runDays = plan.weeks[weekIdx] ?? [];
          advanced.runPlan = { ...advanced.runPlan, currentWeek: weekIdx };
        } else {
          advanced.runDays = scheduleStructuredWeek(liftCount, runTarget, advanced.weekNumber, liftIndices);
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
        const liftIndices = getLiftDayIndices(profile.weekSchedule);
        if (profile.runMode === "race_prep" && profile.raceGoal) {
          const plan = generateRacePlan(
            profile.raceGoal.distance,
            profile.raceGoal.targetDate,
            workouts.length,
            runTarget,
            liftIndices,
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
          runDays = scheduleStructuredWeek(workouts.length, runTarget, 1, liftIndices);
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
        ...(runDays !== undefined && { runDays }),
        ...(runPlan !== undefined && { runPlan }),
      };

      await saveProgram(newState);
      // Sync goal to profile so Settings Training Phase stays in sync
      await updateProfile({
        program: {
          goal,
          startWeight: profile.program?.startWeight ?? profile.weightKg ?? 70,
          currentPhase: "base",
        },
      });
      setViewingHistoryIndex(null);
      toast.success("Program regenerated");
    },
    [profile, programState, saveProgram, updateProfile],
  );

  // Refresh run schedule without resetting program (called when weekSchedule changes)
  const refreshRunSchedule = useCallback(
    async () => {
      if (!programState || !profile) return;
      if (!profile.runMode || profile.runMode === "freeform") return;

      const liftIndices = getLiftDayIndices(profile.weekSchedule);
      const liftCount = liftIndices?.length ?? programState.workouts.length;
      const runTarget = profile.weeklyRunDaysTarget ?? 3;
      let runDays: ScheduledRunDay[];
      let runPlan = programState.runPlan;

      if (profile.runMode === "race_prep" && profile.raceGoal) {
        const plan = generateRacePlan(
          profile.raceGoal.distance,
          profile.raceGoal.targetDate,
          liftCount,
          runTarget,
          liftIndices,
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
        runDays = scheduleStructuredWeek(liftCount, runTarget, programState.weekNumber, liftIndices);
        runPlan = { mode: "structured" };
      }

      await saveProgram({ ...programState, runDays, runPlan });
    },
    [programState, profile, saveProgram],
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
    refreshRunSchedule,
    viewWeek,
    viewingHistoryIndex,
    viewedWorkouts,
    viewedWeekNumber,
  };
}
