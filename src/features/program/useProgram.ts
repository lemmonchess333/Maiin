import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { postActivity } from "@/lib/socialApi";
import { compose, enqueueShare, showQueuedToast } from "@/lib/shareComposer";
import type { ProgramState, ProgramSettings, ProgramExercise, ScheduledRunDay, ScheduledRunStatus } from "./programTypes";
import { normalizeProgramState, transitionStatus } from "./programTypes";
import { migrateProgramState, backfillWeekScheduleIfMissing } from "./migrations";
import {
  generateProgram,
  advanceWeek,
  shouldAdvanceWeek,
  generateWeekPrescription,
  applyProgression,
} from "./programEngine";
import { logger } from "@/lib/logger";
import { estimateLiftBurn } from "@/lib/workoutBurn";
import { getWeeklyRunTarget, runTargetWriteFields } from "@/lib/scheduleUtils";

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
  scheduleStructuredWeekV2,
  generateRacePlanV2,
  scheduleRecoveryWeekV2,
  recoveryWeeksForDistance,
} from "./runScheduler";
import { localWeekKey, localDateString, addLocalDays, parseLocalDate } from "@/lib/dateHelpers";
import { CURRENT_PROGRAM_SCHEMA_VERSION } from "./programTypes";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import {
  getScheduledRunStatus,
  isScheduledRunEditable,
} from "@/lib/scheduledRunStatus";
import { toast } from "sonner";

const PROGRAM_DOC = "current";

/**
 * PR-0b-ii: assemble a v7 RunPlan record from a V2 race-plan
 * output. Preserves previous-plan continuity for the
 * "Week N of M" display: callers that advance / refresh pass
 * the prior `currentWeek` + `totalWeeks` through `carry` so the
 * stored counters keep their semantic meaning. Initial /
 * full-regenerate paths leave `carry` empty and accept V2's
 * fresh values + currentWeek=0.
 *
 * `compressed` always trusts V2's fresh output — config changes
 * (e.g. race date pushed earlier) can flip an uncompressed plan
 * to compressed and the UI banner needs to reflect that.
 */
function makeRunPlanRecord(
  v2: { totalWeeks: number; compressed: boolean },
  raceGoal: { distance: "5k" | "10k" | "half" | "marathon"; targetDate: string },
  carry: { currentWeek?: number; totalWeeks?: number } = {},
): ProgramState["runPlan"] {
  return {
    mode: "race_prep",
    raceGoal,
    totalWeeks: carry.totalWeeks ?? v2.totalWeeks,
    currentWeek: carry.currentWeek ?? 0,
    compressed: v2.compressed,
  };
}

interface RefreshRunScheduleOverrides {
  /** Confirmed week schedule from the editor's apply path —
   *  threaded explicitly so a freshly-`updateProfile`'d schedule
   *  doesn't get overwritten by a stale `profile.weekSchedule`
   *  read from useAuth's closure. */
  weekSchedule?: ScheduleDay[];
  /** Confirmed weekly run target from the editor. Same staleness
   *  concern as `weekSchedule`. */
  weeklyRunDaysTarget?: number;
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

      // PR-0b-i: weekSchedule backfill on read. Self-heals legacy
      // profiles where weekSchedule is absent / wrong-length /
      // duplicated-day / corrupted-type. The patch persists via
      // updateProfile so subsequent reads (and the V2 writer
      // paths below, which read `profile.weekSchedule` directly
      // for run-day generation) see the repaired value.
      // backfillWeekScheduleIfMissing returns null when the
      // schedule is already valid, so this is a no-op on
      // the warm path.
      const profilePatch = backfillWeekScheduleIfMissing(profile);
      if (profilePatch) {
        await updateProfile(profilePatch);
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

        // PR-0b-i: shape-aware migration on read. Repairs V1-shaped
        // runDays (missing id / date / weekKey / status) and aligns
        // inconsistent completed↔status pairs. Idempotent — healthy
        // V2 docs return the input reference, and the
        // JSON.stringify guard below avoids writes when nothing
        // changed. Migration NEVER regenerates workouts; any
        // customizations the user made survive untouched.
        const migrated = migrateProgramState(normalized, localWeekKey());

        // Persist-if-changed guard. Avoids a Firestore write on every
        // cold app open for users whose docs are already clean. The
        // stringify comparison is safe here because the doc is plain
        // JSON (no undefineds, functions, Symbols, or Dates that
        // wouldn't survive serialisation). It's a write optimisation
        // — the React state below uses `migrated` directly, so
        // correctness doesn't depend on this guard firing.
        if (JSON.stringify(migrated) !== JSON.stringify(raw)) {
          await setDoc(ref, migrated, { merge: true });
        }

        // Hydrate run days if user has run mode but no runDays yet
        if (!migrated.runDays && profile.runMode && profile.runMode !== "freeform") {
          // PR-0b-ii: V2 writers. Reads weekSchedule directly so
          // hybrid Both-day slots get a scheduled run (V1 lost them
          // because it derived run-eligible days from liftIndices).
          // PR-0b-i's backfill above guarantees a valid 7-entry
          // weekSchedule is present on profile by this point.
          const weekSchedule = profile.weekSchedule ?? [];
          const runTarget = getWeeklyRunTarget(profile) || 3;
          const weekStart = localWeekKey();
          let runDays: ScheduledRunDay[] = [];
          let runPlan = migrated.runPlan;

          if (profile.runMode === "race_prep" && profile.raceGoal) {
            const plan = generateRacePlanV2({
              weekSchedule,
              raceGoal: profile.raceGoal,
              weeklyRunDays: runTarget,
              currentDate: localDateString(),
              weekStart,
            });
            runDays = plan.weeks[0] ?? [];
            runPlan = makeRunPlanRecord(plan, profile.raceGoal);
          } else {
            runDays = scheduleStructuredWeekV2({
              weekSchedule,
              weekNumber: migrated.weekNumber,
              weekStart,
            });
            runPlan = { mode: "structured" };
          }

          const withRuns = { ...migrated, runDays, runPlan };
          await setDoc(ref, { ...withRuns, updatedAt: Date.now() }, { merge: true });
          setProgramState(withRuns);
        } else {
          // PR-0b-i: drive React state from the migrated value so
          // the UI sees v2-shaped runDays + corrected status/
          // completed pairs. Pre-PR-0b-i this set `normalized`,
          // which would leave consumers reading legacy fields.
          setProgramState(migrated);
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

        // Generate run schedule if applicable. PR-0b-ii: V2 writers.
        let runDays: ScheduledRunDay[] | undefined;
        let runPlan: ProgramState["runPlan"];
        if (profile.runMode && profile.runMode !== "freeform") {
          const weekSchedule = profile.weekSchedule ?? [];
          const runTarget = getWeeklyRunTarget(profile) || 3;
          const weekStart = localWeekKey();
          if (profile.runMode === "race_prep" && profile.raceGoal) {
            const plan = generateRacePlanV2({
              weekSchedule,
              raceGoal: profile.raceGoal,
              weeklyRunDays: runTarget,
              currentDate: localDateString(),
              weekStart,
            });
            runDays = plan.weeks[0] ?? [];
            runPlan = makeRunPlanRecord(plan, profile.raceGoal);
          } else {
            runDays = scheduleStructuredWeekV2({
              weekSchedule,
              weekNumber: 1,
              weekStart,
            });
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
          // PR-0b-ii: explicit schema version on initial creation so
          // PR-0b-i's shape-aware migration sees a current doc on
          // next read. Without this, the doc would migrate (no-op)
          // on every cold open until the next saveProgram.
          programSchemaVersion: CURRENT_PROGRAM_SCHEMA_VERSION,
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
    // updateProfile is intentionally omitted: it's a stable
    // function reference from useAuth's context and including it
    // would force a re-run on every render that recreates it.
    // The PR-0b-i profilePatch call uses updateProfile inside the
    // effect body — same call style as elsewhere in the file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // PR-D: race-day auto-transition effect. When the race date has
  // passed AND the race-day runDay is still `planned`, infer a
  // no-show and transition the status. Fires on programState
  // load and on subsequent programState changes (idempotent —
  // once the status is no-show or completed_*, this skips).
  //
  // Conditions:
  //   - profile.runMode === "race_prep" AND profile.raceGoal exists
  //   - a runDay with `date === raceGoal.targetDate` AND `status === "planned"`
  //   - today - 3 days > race date (the 3-day grace period locked in Q5)
  //
  // Recoverability: race_no_show → completed_* is legal (per PR-D's
  // LEGAL_TRANSITIONS update). If the user later logs the race via
  // RunSummary's reconciliation flow, the slot transitions onward.
  useEffect(() => {
    if (!programState || !profile) return;
    if (profile.runMode !== "race_prep" || !profile.raceGoal) return;

    const raceDate = profile.raceGoal.targetDate;
    const raceDay = programState.runDays?.find((rd) => rd.date === raceDate);
    if (!raceDay) return;

    const status = getScheduledRunStatus(raceDay);
    if (status !== "planned") return;

    // 3-day grace period — auto-transition only fires when the
    // race date is more than 3 days in the past. Users who
    // upload late get the chance to reconcile before we infer
    // no-show.
    const gracePassed =
      new Date().getTime() - parseLocalDate(raceDate).getTime() >
      3 * 24 * 60 * 60 * 1000;
    if (!gracePassed) return;

    // Transition gate. transitionStatus(planned, race_no_show) is
    // legal per LEGAL_TRANSITIONS. Defense in depth — refuses if
    // the transition table changes underneath us.
    if (!transitionStatus(status, "race_no_show")) return;

    const updatedRunDays = programState.runDays!.map((rd) =>
      rd === raceDay ? { ...rd, status: "race_no_show" as ScheduledRunStatus } : rd,
    );

    logger.log(
      `[auto-transition] race-day runDay ${raceDay.id ?? raceDay.dayIndex} → race_no_show ` +
        `(date ${raceDate}, ${Math.floor((new Date().getTime() - parseLocalDate(raceDate).getTime()) / 86400000)} days past)`,
    );

    saveProgram({ ...programState, runDays: updatedRunDays }).catch((err) => {
      logger.warn("[auto-transition] save failed", err);
    });
  }, [programState, profile, saveProgram]);

  // PR-E: recovery-phase exit effect. When the user has been in
  // recovery and the grace period (recoveryEndDate + 7 days) has
  // passed, silently clear `phase` and `recoveryEndDate` from
  // runPlan. The 7-day window between `recoveryEndDate` and the
  // grace-end is when PR-C's "Recovery ended — what's next?"
  // card variant prompts the user to pick their next direction;
  // if they ignore it for a full week, we auto-promote back to
  // normal training shape.
  //
  // Mid-recovery (today < recoveryEndDate): no-op, this effect
  // skips. The card shows "Recovering — N days left."
  // Post-recovery, in grace (today >= recoveryEndDate, today <
  // recoveryEndDate + 7d): no-op here either. PR-C's variant 3
  // renders. Phase stays "recovery" so refreshRunSchedule keeps
  // emitting easy_30 (the user's still in the soft window).
  // Post-grace (today >= recoveryEndDate + 7d): silent clear.
  useEffect(() => {
    if (!programState?.runPlan) return;
    if (programState.runPlan.phase !== "recovery") return;
    if (!programState.runPlan.recoveryEndDate) return;

    const gracePost = parseLocalDate(programState.runPlan.recoveryEndDate);
    gracePost.setDate(gracePost.getDate() + 7);
    const todayKey = localDateString();
    const graceEndKey = localDateString(gracePost);
    if (todayKey < graceEndKey) return;

    const cleared = { ...programState.runPlan };
    delete cleared.phase;
    delete cleared.recoveryEndDate;

    logger.log(
      `[recovery-exit] phase cleared after grace (recoveryEndDate ${programState.runPlan.recoveryEndDate}, today ${todayKey})`,
    );

    saveProgram({ ...programState, runPlan: cleared }).catch((err) => {
      logger.warn("[recovery-exit] save failed", err);
    });
  }, [programState, saveProgram]);

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

      // Refresh run days for new week. PR-0b-ii: V2 writers + next-
      // week date vantage so the saved runDays carry next-week
      // dates / weekKey. `currentWeek` increments to track week-
      // since-plan-start; `totalWeeks` preserved from prev so the
      // race-strip "Week N of M" display stays consistent.
      if (profile?.runMode && profile.runMode !== "freeform") {
        const weekSchedule = profile.weekSchedule ?? [];
        const runTarget = getWeeklyRunTarget(profile) || 3;
        const nextWeekStart = localWeekKey(addLocalDays(new Date(), 7));
        const nextWeekCurrentDate = localDateString(addLocalDays(new Date(), 7));

        if (profile.runMode === "race_prep" && profile.raceGoal) {
          const plan = generateRacePlanV2({
            weekSchedule,
            raceGoal: profile.raceGoal,
            weeklyRunDays: runTarget,
            currentDate: nextWeekCurrentDate,
            weekStart: nextWeekStart,
          });
          advanced.runDays = plan.weeks[0] ?? [];
          advanced.runPlan = makeRunPlanRecord(plan, profile.raceGoal, {
            currentWeek: (advanced.runPlan?.currentWeek ?? 0) + 1,
            totalWeeks: advanced.runPlan?.totalWeeks,
          });
        } else {
          advanced.runDays = scheduleStructuredWeekV2({
            weekSchedule,
            weekNumber: advanced.weekNumber,
            weekStart: nextWeekStart,
          });
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

  // P0-6: Mark a run day as completed.
  //
  // Accepts either a v2 ScheduledRunDay.id (string) for precise
  // by-id completion, or a legacy dayIndex (number) for the
  // pre-v2 path that's still wired elsewhere in the UI. When the
  // id path resolves, status transitions via `transitionStatus`
  // (planned → completed_exact). The runtime `completed: true`
  // flag is set on both paths for back-compat — the in-app
  // `runDays.find(d => !d.completed)` lookups still work.
  //
  // The transition validation is a soft guard: a no-op (status
  // already terminal) logs a warning and falls through without
  // writing — completing the same scheduled run twice shouldn't
  // double-fire the "ready for next week" toast.
  const completeRunDay = useCallback(
    async (idOrDayIndex: string | number, savedRunId?: string) => {
      if (!programState?.runDays || !user) return;

      // Resolve which runDay we're completing. By-id path takes
      // precedence (P0-6 entry) but falls back to legacy by-index
      // when the caller has only a dayIndex.
      const targetIndex =
        typeof idOrDayIndex === "string"
          ? programState.runDays.findIndex((rd) => rd.id === idOrDayIndex)
          : programState.runDays.findIndex((rd) => rd.dayIndex === idOrDayIndex);
      if (targetIndex === -1) {
        logger.warn(
          `[completeRunDay] no runDay matched ${typeof idOrDayIndex === "string" ? "id" : "dayIndex"}=${idOrDayIndex}; skipping`,
        );
        return;
      }
      const targetDay = programState.runDays[targetIndex];

      // Status transition gate. PR-D: race_no_show → completed_*
      // is now legal (recovery from inferred no-show state via
      // the reconciliation flow). transitionStatus enforces the
      // updated LEGAL_TRANSITIONS table.
      // PR-0b-iii: legacy-completed-aware status read via the
      // central helper. A pre-status doc with completed: true +
      // status: undefined resolves to "completed_exact" (not
      // "planned"), so transitionStatus refuses the
      // completed_exact → completed_exact illegal transition and
      // we skip + log instead of double-completing.
      const fromStatus = getScheduledRunStatus(targetDay);
      const toStatus: ScheduledRunStatus = "completed_exact";
      if (!transitionStatus(fromStatus, toStatus)) {
        logger.warn(
          `[completeRunDay] invalid transition ${fromStatus} → ${toStatus} for runDay ${targetDay.id ?? targetDay.dayIndex}; skipping`,
        );
        return;
      }

      const updatedDays = programState.runDays.slice();
      updatedDays[targetIndex] = {
        ...targetDay,
        completed: true,
        status: toStatus,
        // PR-D: write linkedRunId when present so a future
        // "tap completed run → view saved run" navigation hook
        // can resolve the connection. Optional — DayActionSheet's
        // manual "Mark complete" calls without a savedRunId.
        ...(savedRunId ? { linkedRunId: savedRunId } : {}),
      };

      // PR-D: when the just-completed runDay is the race day for a
      // race_prep user, also enter the recovery phase. Distance-
      // scaled duration: 5K=1w, 10K=2w, half=3w, marathon=4w.
      // Auto-enter only on completion (not on no-show — Q17 in
      // the design grill).
      let updatedRunPlan = programState.runPlan;
      const raceGoal = programState.runPlan?.raceGoal;
      if (
        profile?.runMode === "race_prep" &&
        raceGoal &&
        targetDay.date === raceGoal.targetDate &&
        programState.runPlan
      ) {
        const recoveryWeeks = recoveryWeeksForDistance(
          raceGoal.distance as "5k" | "10k" | "half" | "marathon",
        );
        const recoveryEndDate = localDateString(
          addLocalDays(parseLocalDate(raceGoal.targetDate), recoveryWeeks * 7),
        );
        updatedRunPlan = {
          ...programState.runPlan,
          phase: "recovery",
          recoveryEndDate,
        };
      }

      const updated: ProgramState = {
        ...programState,
        runDays: updatedDays,
        runPlan: updatedRunPlan,
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
    [programState, user, saveProgram, profile?.runMode],
  );

  // P1-3: Skip a run day (planned → skipped). Same id-or-index
  // overload as completeRunDay so the Week tab's overflow menu can
  // dispatch either way. Transition is gated by transitionStatus,
  // so a no-op call against a terminal-state runDay logs and exits
  // without writing.
  const skipRunDay = useCallback(
    async (idOrDayIndex: string | number) => {
      if (!programState?.runDays || !user) return;

      const targetIndex =
        typeof idOrDayIndex === "string"
          ? programState.runDays.findIndex((rd) => rd.id === idOrDayIndex)
          : programState.runDays.findIndex((rd) => rd.dayIndex === idOrDayIndex);
      if (targetIndex === -1) {
        logger.warn(
          `[skipRunDay] no runDay matched ${typeof idOrDayIndex === "string" ? "id" : "dayIndex"}=${idOrDayIndex}; skipping`,
        );
        return;
      }
      const targetDay = programState.runDays[targetIndex];
      // PR-0b-iii: legacy-completed-aware status read via the
      // central helper. A pre-status doc with completed: true +
      // status: undefined resolves to "completed_exact" (not
      // "planned"), so transitionStatus refuses the
      // completed_exact → completed_exact illegal transition and
      // we skip + log instead of double-completing.
      const fromStatus = getScheduledRunStatus(targetDay);
      const toStatus: ScheduledRunStatus = "skipped";
      if (!transitionStatus(fromStatus, toStatus)) {
        logger.warn(
          `[skipRunDay] invalid transition ${fromStatus} → ${toStatus} for runDay ${targetDay.id ?? targetDay.dayIndex}; skipping`,
        );
        return;
      }

      const updatedDays = programState.runDays.slice();
      updatedDays[targetIndex] = {
        ...targetDay,
        // `completed` stays false — skipped is distinct from
        // completed. The Week tab + status-derived analytics need
        // to tell the two states apart.
        status: toStatus,
      };
      await saveProgram({ ...programState, runDays: updatedDays });
    },
    [programState, user, saveProgram],
  );

  // Override a run day template. Refuses to write when the target
  // runDay is already in a terminal status (completed_*, skipped,
  // race_no_show) — the UI is expected to disable the template
  // dropdown in those cases, and this is the defence-in-depth gate
  // for any caller that slips past. Without this, swapping a
  // template on a skipped/completed runDay would silently update
  // the dropdown but leave the day terminal, surfacing as "the
  // change didn't take" from the user's perspective.
  //
  // The "re-engage a skipped run" use case isn't covered here on
  // purpose — that requires an explicit status reset and the
  // current state-machine map (P0-A) treats `skipped` as terminal.
  // If product wants un-skip, add `skipped → planned` to
  // LEGAL_TRANSITIONS and surface an "un-skip" button in the
  // Week tab overflow instead of overloading override semantics.
  // PR-1: id-preferring overload. Same shape as completeRunDay /
  // skipRunDay — string = runDay.id, number = legacy dayIndex.
  // V2 docs have stable IDs (PR-0b-i); future surfaces (Home
  // DayActionSheet) need to address a specific runDay across weeks,
  // not "whichever runDay happens to match this dayIndex". The
  // dayIndex fallback stays for legacy callers (Programme Run tab
  // row select, Week-tab template select) that still pass dow.
  const overrideRunDay = useCallback(
    async (idOrDayIndex: string | number, templateId: string) => {
      if (!programState?.runDays) return;
      const target =
        typeof idOrDayIndex === "string"
          ? programState.runDays.find((rd) => rd.id === idOrDayIndex)
          : programState.runDays.find((rd) => rd.dayIndex === idOrDayIndex);
      if (!target) {
        logger.warn(
          `[overrideRunDay] no runDay matched ${typeof idOrDayIndex === "string" ? "id" : "dayIndex"}=${idOrDayIndex}; skipping`,
        );
        return;
      }
      // PR-0b-iii: editability gate via the central helper.
      // Only `planned` qualifies for in-place template swap.
      // race_completed_unlinked (reconciliation) is now excluded
      // — its only outgoing path is via a future linking UI, not
      // the shared template editor.
      const status = getScheduledRunStatus(target);
      if (!isScheduledRunEditable(status)) {
        logger.warn(
          `[overrideRunDay] refusing to swap template on non-editable runDay (status="${status}", id=${target.id ?? target.dayIndex}); use Configure Plan to rebuild instead`,
        );
        return;
      }

      // Match against the resolved target's id when present
      // (id-preferring), falling back to dayIndex. Without this
      // a multi-week V2 runDays array could double-overwrite
      // (multiple rows with the same dayIndex).
      const updated: ProgramState = {
        ...programState,
        runDays: programState.runDays.map((rd) =>
          (target.id && rd.id === target.id) ||
          (!target.id && rd.dayIndex === target.dayIndex)
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
      overrides?: { weekSchedule?: ScheduleDay[]; weeklyRunDaysTarget?: number },
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

      // Regenerate run schedule. PR-0b-ii: V2 writers. Full regen
      // resets currentWeek to 0 and trusts V2's fresh totalWeeks
      // (caller intent is "rebuild this plan from scratch").
      let runDays: ScheduledRunDay[] | undefined;
      let runPlan: ProgramState["runPlan"];
      if (profile.runMode && profile.runMode !== "freeform") {
        const runTarget = overrides?.weeklyRunDaysTarget ?? (getWeeklyRunTarget(profile) || 3);
        const effectiveSchedule = overrides?.weekSchedule ?? profile.weekSchedule ?? [];
        const weekStart = localWeekKey();
        if (profile.runMode === "race_prep" && profile.raceGoal) {
          const plan = generateRacePlanV2({
            weekSchedule: effectiveSchedule,
            raceGoal: profile.raceGoal,
            weeklyRunDays: runTarget,
            currentDate: localDateString(),
            weekStart,
          });
          runDays = plan.weeks[0] ?? [];
          runPlan = makeRunPlanRecord(plan, profile.raceGoal);
        } else {
          runDays = scheduleStructuredWeekV2({
            weekSchedule: effectiveSchedule,
            weekNumber: 1,
            weekStart,
          });
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
        // PR-0b-ii: explicit schema version on regenerate so the
        // freshly-rebuilt state matches the current contract. Pre-
        // PR-0b-ii this was inherited from the prior doc (or
        // missing), which is exactly the V1-shape-in-current-
        // version footgun PR-0b-i's shape-aware migration repairs.
        programSchemaVersion: CURRENT_PROGRAM_SCHEMA_VERSION,
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

  // Refresh run schedule without resetting program (called when
  // weekSchedule changes). PR-0b-ii: V2 writers + optional
  // overrides to avoid stale-closure reads of profile.weekSchedule.
  // Editor apply path passes the freshly-confirmed schedule
  // through explicitly so we never use the pre-`updateProfile`
  // value.
  const refreshRunSchedule = useCallback(
    async (overrides?: RefreshRunScheduleOverrides) => {
      if (!programState || !profile) return;
      if (!profile.runMode || profile.runMode === "freeform") return;

      const weekSchedule = overrides?.weekSchedule ?? profile.weekSchedule ?? [];
      const runTarget = overrides?.weeklyRunDaysTarget ?? (getWeeklyRunTarget(profile) || 3);
      const weekStart = localWeekKey();
      let runDays: ScheduledRunDay[];
      let runPlan = programState.runPlan;

      // PR-F: snapshot per-day userOverrides BEFORE regenerating.
      // Pre-PR-F, refreshRunSchedule called the generator (which
      // builds fresh runDays via buildRunDayV2 with no userOverride
      // field) and wrote the result directly — silently destroying
      // any per-day template overrides the user had set via the
      // inline <select> in ProgrammeRunSection's per-day list.
      // Snapshot dayIndex → userOverride map; restore after the
      // generator runs but only for days still scheduled as
      // run/both (orphan overrides on a day that became rest get
      // dropped).
      const overrideSnapshot: Record<number, string> = {};
      for (const rd of programState.runDays ?? []) {
        if (rd.userOverride) {
          overrideSnapshot[rd.dayIndex] = rd.userOverride;
        }
      }

      // PR-E: recovery phase takes precedence over the runMode
      // branches. When the user just completed a race and is
      // mid-recovery (runPlan.phase === "recovery" + not yet
      // expired), emit all easy_30 templates regardless of mode.
      // runMode stays at race_prep during recovery; the phase flag
      // does the differentiation. PR-D writes the phase on race
      // completion; this generator consumes it on subsequent
      // refreshes (e.g. mid-week schedule edits while recovering).
      const inRecovery =
        programState.runPlan?.phase === "recovery" &&
        programState.runPlan?.recoveryEndDate &&
        localDateString() < programState.runPlan.recoveryEndDate;

      if (inRecovery) {
        runDays = scheduleRecoveryWeekV2({ weekSchedule, weekStart });
        runPlan = { ...programState.runPlan! };
      } else if (profile.runMode === "race_prep" && profile.raceGoal) {
        const plan = generateRacePlanV2({
          weekSchedule,
          raceGoal: profile.raceGoal,
          weeklyRunDays: runTarget,
          currentDate: localDateString(),
          weekStart,
        });
        runDays = plan.weeks[0] ?? [];
        // Refresh preserves currentWeek + totalWeeks so the user's
        // race-strip position stays put across mid-week schedule
        // edits. Only `compressed` updates (V2 may flip it if the
        // schedule change pushed run count below race-config
        // thresholds). PR-E: also clear any stale recovery phase
        // — if user has aged out of recovery (recoveryEndDate
        // passed) and we're re-rendering race_prep, drop phase
        // and recoveryEndDate.
        runPlan = makeRunPlanRecord(plan, profile.raceGoal, {
          currentWeek: programState.runPlan?.currentWeek,
          totalWeeks: programState.runPlan?.totalWeeks,
        });
      } else {
        runDays = scheduleStructuredWeekV2({
          weekSchedule,
          weekNumber: programState.weekNumber,
          weekStart,
        });
        runPlan = { mode: "structured" };
      }

      // Re-apply preserved overrides. The generator emits entries
      // keyed by dayIndex; we re-key the snapshot the same way so
      // a user's "Monday=tempo" intent survives weeklyRunDays
      // edits, schedule reshuffles, and mode flips (via the chip
      // row's handleModeChange path). Templates that are no longer
      // scheduled drop silently (snapshot lookup misses; original
      // generator template wins).
      runDays = runDays.map((rd) => {
        const preserved = overrideSnapshot[rd.dayIndex];
        return preserved
          ? { ...rd, userOverride: preserved, templateId: preserved }
          : rd;
      });

      await saveProgram({ ...programState, runDays, runPlan });
    },
    [programState, profile, saveProgram],
  );

  // PR-C: skip-recovery-early writer. Atomic phase clear + mode
  // flip + run-schedule regenerate. Called from the post-race
  // card when the user opts out of the soft window. Race is past,
  // raceGoal preserved (R1 GATED), but the user wants normal
  // training back NOW instead of waiting for the 7-day grace to
  // elapse and the recovery-exit effect to fire.
  //
  // Why a dedicated writer instead of composing skipRecovery +
  // handleModeChange + refresh: refreshRunSchedule reads
  // `programState.runPlan.phase` from its closure. If we cleared
  // phase via saveProgram and then called refresh, the closure
  // would lag and refresh would still emit easy_30. By doing the
  // whole transition in one saveProgram call, we sidestep the
  // closure-lag problem.
  const skipRecoveryEarly = useCallback(
    async () => {
      if (!programState || !profile) return;
      if (programState.runPlan?.phase !== "recovery") return;

      const weekSchedule = profile.weekSchedule ?? [];
      const runTarget = getWeeklyRunTarget(profile) || 3;
      const weekStart = localWeekKey();

      // User skipping early = "I'm done with the race-prep arc,
      // give me structured training now." Flip profile.runMode and
      // regenerate runDays with the structured generator.
      const runDays = scheduleStructuredWeekV2({
        weekSchedule,
        weekNumber: programState.weekNumber,
        weekStart,
      });
      const runPlan = { mode: "structured" as const };

      logger.log(
        `[skipRecoveryEarly] clearing phase, flipping runMode → structured, regenerating ${runDays.length} runDays`,
      );

      await Promise.all([
        updateProfile({ runMode: "structured", ...runTargetWriteFields(runTarget) }),
        saveProgram({ ...programState, runDays, runPlan }),
      ]);
    },
    [programState, profile, saveProgram, updateProfile],
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
    skipRunDay,
    overrideRunDay,
    refreshRunSchedule,
    skipRecoveryEarly,
    viewWeek,
    viewingHistoryIndex,
    viewedWorkouts,
    viewedWeekNumber,
  };
}
