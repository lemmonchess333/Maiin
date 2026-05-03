import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { postActivity } from "@/lib/socialApi";
import { compose, enqueueShare, showQueuedToast } from "@/lib/shareComposer";
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
import { estimateLiftBurn } from "@/lib/workoutBurn";
import { getWeeklyRunTarget } from "@/lib/scheduleUtils";

/** Per-set record from an active WorkoutSession run. */
export interface CompletedSetLog {
  weight: number;
  reps: number;
  completed: boolean;
}

/**
 * Session data captured from the live WorkoutSession timer + set tracker.
 * When provided to completeWorkoutDay, the saved workout record reflects
 * actual execution (wall-clock duration, completed-only sets). When
 * absent, the save falls back to planned data with estimateLiftBurn's
 * built-in zero-duration fallback.
 */
export interface CompletedSessionData {
  durationMinutes: number;
  setLogs: CompletedSetLog[][];
}
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
        // Pass profile.primaryGoal as the backfill source so pre-W1a
        // programState docs — written before primaryGoal was persisted —
        // still return a normalised state with the user's actual goal,
        // not an empty field. Onboarding already stores primaryGoal on
        // the profile, so the backfill is always available at read time.
        const normalized = normalizeProgramState(raw, {
          primaryGoal: profile.primaryGoal,
        });

        // Hydrate run days if user has run mode but no runDays yet
        if (!normalized.runDays && profile.runMode && profile.runMode !== "freeform") {
          const liftCount = normalized.workouts.length;
          const liftIndices = getLiftDayIndices(profile.weekSchedule);
          const runTarget = getWeeklyRunTarget(profile) || 3;
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
        // Thread primaryGoal through so the procedural engine reps track
        // what the user asked for. Pre-W1a this call dropped primaryGoal
        // entirely and hypertrophy-rep defaults leaked into every goal.
        const { splitType, workouts } = generateProgram(
          goal,
          weeklyTarget,
          undefined,
          profile.primaryGoal,
        );

        // Generate run schedule if applicable
        let runDays: ScheduledRunDay[] | undefined;
        let runPlan: ProgramState["runPlan"];
        if (profile.runMode && profile.runMode !== "freeform") {
          const runTarget = getWeeklyRunTarget(profile) || 3;
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
          // Persist primaryGoal alongside the engine-derived workouts.
          // Loading already backfills via normalizeProgramState (see
          // line ~80) but the initial doc should write the field
          // explicitly so the persisted shape matches reads.
          ...(profile.primaryGoal !== undefined && { primaryGoal: profile.primaryGoal }),
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
      logger.error("Failed to load program:", err);
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
        logger.error('[Program] Save failed:', error);
        toast.error('Failed to save programme changes');
        throw error;
      }
    },
    [user],
  );

  // Mark a workout day as completed (does NOT auto-advance week)
  // Also writes to workouts collection so Home stats can see it.
  //
  // `sessionData` (optional) carries the wall-clock duration and per-set
  // completion state from an active WorkoutSession. When supplied, the saved
  // record reflects actual execution; otherwise we fall back to planned data
  // (every set assumed completed at `ex.lastAttemptedWeight || ex.weight`).
  const completeWorkoutDay = useCallback(
    async (dayIndex: number, sessionData?: CompletedSessionData) => {
      if (!programState || !user) return;

      const day = programState.workouts[dayIndex];
      if (!day) return;

      const updated: ProgramState = {
        ...programState,
        workouts: programState.workouts.map((d, i) =>
          i === dayIndex ? { ...d, completed: true, skipped: false } : d,
        ),
        // Clear next-workout override if completing the overridden day
        ...(programState.nextWorkoutOverride === dayIndex && { nextWorkoutOverride: undefined }),
      };

      await saveProgram(updated);

      // Write to workouts collection so Home/performance engine picks it up
      try {
        // Local date key so the written workout is picked up by the
        // useEffectiveTargets / useHomeData filters, which both format in
        // the viewer's local timezone via isWorkoutOnDate.
        const today = format(new Date(), "yyyy-MM-dd");
        const workoutId = `${today}-prog-${Date.now()}`;
        const workoutRef = doc(db, "users", user.uid, "workouts", workoutId);

        // Build exercises array — from actual setLogs when available,
        // otherwise from planned data (every set assumed completed).
        const exercises = day.exercises.map((ex, exIndex) => {
          const logs = sessionData?.setLogs?.[exIndex];
          const plannedWeight = ex.lastAttemptedWeight || ex.weight;
          const plannedReps = ex.lastPerformance?.reps ?? ex.reps;

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
                reps: plannedReps,
                weightKg: plannedWeight,
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
          (t, ex) => t + ex.sets.reduce((s, set) => s + set.weightKg * set.reps, 0),
          0,
        );
        const completedSetCount = exercises.reduce(
          (c, ex) => c + ex.sets.length,
          0,
        );

        // Require bodyweight to compute a sensible burn. If it's missing we
        // save the workout anyway — the helper returns 0 — but log so the
        // operator can notice.
        const bodyweightKg = profile?.weightKg ?? 0;
        if (bodyweightKg <= 0) {
          logger.warn(
            "completeWorkoutDay: profile.weightKg missing — workout will save with totalCalories=0",
          );
        }

        const durationMinutes = sessionData?.durationMinutes && sessionData.durationMinutes > 0
          ? sessionData.durationMinutes
          : 0;

        const totalCalories = estimateLiftBurn({
          durationMinutes,
          tonnageKg: tonnage,
          bodyweightKg,
          completedSetCount,
        });

        await setDoc(workoutRef, {
          date: today,
          exercises,
          totalCalories,
          // Prefer the real timer value. When absent, estimateLiftBurn's
          // completedSetCount × 3 fallback drives burn — record that same
          // effective duration so downstream analytics see a consistent
          // value. No more `exercises.length × 5` placeholder.
          durationMinutes: durationMinutes > 0 ? durationMinutes : completedSetCount * 3,
          notes: `${day.dayName} — Programme Week ${programState.weekNumber}`,
          createdAt: Timestamp.now(),
          source: "programme",
        });
        // Share composer: prompt the user (or replay their saved
        // default) for visibility + caption. Returns null if they
        // declined to share. Replaces the old autoPostWorkouts flag —
        // see src/lib/shareComposer.ts for the preference store.
        const effectiveDurationMin = durationMinutes > 0 ? durationMinutes : completedSetCount * 3;
        const decision = await compose({
          type: "workout",
          title: day.dayName,
          meta: [
            `${day.exercises.length} exercise${day.exercises.length === 1 ? "" : "s"}`,
            tonnage > 0 ? `${Math.round(tonnage).toLocaleString()}kg volume` : "",
            effectiveDurationMin > 0 ? `${effectiveDurationMin} min` : "",
          ].filter(Boolean),
        });
        if (decision) {
          const uniqueCategories = [...new Set(day.exercises.map(ex => ex.movementCategory).filter(Boolean))];
          // Map composer-side visibility → postActivity API visibility.
          // 'crews' is composer-only; under the hood it's a followers
          // post tagged with crewId so it surfaces on the crew page.
          // 'public' also tags with crewId so crew members see public
          // posts on the crew surface; 'followers' explicitly does not
          // (the user picked the broader audience without opting in
          // to the crew page).
          const apiVisibility = decision.visibility === 'crews' ? 'followers' : decision.visibility;
          const includeCrewId =
            (decision.visibility === 'crews' || decision.visibility === 'public') && !!profile?.crewId;
          const payload = {
            authorId: user.uid,
            authorName: profile?.displayName || 'Athlete',
            ...(profile?.photoURL ? { authorPhotoURL: profile.photoURL } : {}),
            type: 'workout' as const,
            visibility: apiVisibility,
            ...(decision.caption ? { caption: decision.caption } : {}),
            workoutName: day.dayName,
            activityTitle: day.dayName,
            exerciseCount: day.exercises.length,
            totalVolume: tonnage,
            duration: effectiveDurationMin * 60,
            muscleGroups: uniqueCategories,
            ...(includeCrewId ? { crewId: profile?.crewId } : {}),
            // Exercises — full list (was previously sliced to 3) with
            // structured fields per exercise so feed viewers can
            // "Save as routine" (PR 4) without parsing the summary
            // string. ActivityCard renders only the top 3 visually
            // for compactness; the rest sit on the doc for the routine
            // copy flow.
            exercises: exercises.map(ex => {
              const setCount = ex.sets.length;
              const targetReps = ex.sets[0]?.reps ?? 0;
              const targetWeightKg = ex.sets[0]?.weightKg ?? 0;
              return {
                name: ex.exerciseName,
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
            // Network failures (offline, transient) — queue and let
            // ShareComposerSheet's drain effect retry on reconnect.
            // Auth/identity errors still surface as a warning since
            // those won't recover by retrying.
            const isNetwork = typeof navigator !== "undefined" && navigator.onLine === false;
            if (isNetwork) {
              enqueueShare(payload);
              showQueuedToast();
            } else {
              logger.warn("Failed to post workout to feed:", socialErr);
            }
          }
        }
      } catch (err) {
        logger.warn("Failed to sync programme day to workouts:", err);
      }

      const allDone = updated.workouts.every((d) => d.completed || d.skipped);
      if (allDone) {
        toast.success("All workouts complete! Advance to next week when ready.");
      }
    },
    [programState, user, saveProgram, profile],
  );

  // Skip a workout day (no stats, no social post)
  const skipWorkoutDay = useCallback(
    async (dayIndex: number) => {
      if (!programState || !user) return;
      const updated: ProgramState = {
        ...programState,
        workouts: programState.workouts.map((d, i) =>
          i === dayIndex ? { ...d, skipped: true } : d,
        ),
      };
      await saveProgram(updated);
    },
    [programState, user, saveProgram],
  );

  // Set a specific day as the next workout (override default progression)
  const setNextWorkout = useCallback(
    async (dayIndex: number) => {
      if (!programState) return;
      await saveProgram({ ...programState, nextWorkoutOverride: dayIndex });
    },
    [programState, saveProgram],
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
        const runTarget = getWeeklyRunTarget(profile) || 3;

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
      // Skipped lifts count as "done for the week" — same rule as
      // completeWorkoutDay's `allDone` check uses (`completed || skipped`).
      // Without this parity, a user who skipped one lift but finished
      // every run would never see "Ready for next week" from the run
      // path even though they would from the lift path.
      const allLiftsDone = updated.workouts.every((d) => d.completed || d.skipped);
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
      // No success toast — the schedule UI shows the new run-day state.
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

  // Regenerate program (goal or split change).
  //
  // `overrides` lets callers pass FRESH state directly instead of
  // relying on `profile` having already round-tripped through the
  // hook. Settings → Apply schedule changes used to call
  // `regenerateProgram(undefined, pendingLiftDays)` and then
  // `updateProfile({ weekSchedule: ... })` — so the regenerate ran
  // against the OLD schedule (liftIndices were computed from
  // `profile.weekSchedule` before the new schedule was saved). The
  // resulting run schedule didn't reflect the layout the user just
  // confirmed. Passing schedule + run target via `overrides` makes
  // the regenerate correct on the first call.
  const regenerateProgram = useCallback(
    async (
      goalOverride?: string,
      weeklyTargetOverride?: number,
      overrides?: { weekSchedule?: { day: number; type: string }[]; weeklyRunDaysTarget?: number },
    ) => {
      if (!profile) return;

      const goal = (goalOverride ?? programState?.goal ?? profile.program?.goal ?? "recomp") as ProgramState["goal"];
      const weeklyTarget = weeklyTargetOverride ?? profile.weeklyWorkoutsTarget ?? 4;
      // Prefer programState's persisted primaryGoal (set at onboarding),
      // falling back to the profile value. Regenerate with goal-aware reps.
      const primaryGoal = programState?.primaryGoal ?? profile.primaryGoal;
      const { splitType, workouts } = generateProgram(
        goal,
        weeklyTarget,
        programState?.workouts,
        primaryGoal,
      );

      // Regenerate run schedule using the override schedule when
      // provided, falling back to the profile's persisted schedule.
      let runDays: ScheduledRunDay[] | undefined;
      let runPlan: ProgramState["runPlan"];
      if (profile.runMode && profile.runMode !== "freeform") {
        const runTarget = overrides?.weeklyRunDaysTarget ?? (getWeeklyRunTarget(profile) || 3);
        const effectiveSchedule = overrides?.weekSchedule ?? profile.weekSchedule;
        const liftIndices = getLiftDayIndices(effectiveSchedule);
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
        // Persist primaryGoal across regenerate. Without this, the
        // engine USED primaryGoal to pick rep ranges when generating
        // the new workouts (line above), but the saved state lost
        // the field — so the Program header's "Built for {goal}" line
        // (Program.tsx:381 → primaryGoalLabel) silently fell back to
        // "General Fitness" after every Goal change / Refresh, even
        // for a hypertrophy or strength user.
        ...(primaryGoal !== undefined && { primaryGoal }),
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
      const runTarget = getWeeklyRunTarget(profile) || 3;
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
    skipWorkoutDay,
    setNextWorkout,
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
