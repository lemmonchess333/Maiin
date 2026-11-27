import { useCallback, useEffect, useMemo, useState } from "react";
import { useUid } from "@/lib/auth";
import { useLocalDateKey } from "@/hooks/useLocalDateKey";
import { useSavedSessions } from "@/hooks/useSavedSessions";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { matchMovementCategory } from "@/lib/exerciseMovementCategory";
import { isHardRun } from "@/lib/hybridGuidance";
import { runEvidenceDate } from "@/lib/runExecutionEvidence";
import { isVolumeEligible } from "@/lib/runStatsEligibility";
import { SAVED_RUNS, type RunWindow } from "@/lib/savedRuns";
import {
  SAVED_WORKOUTS,
  type Workout,
  type WorkoutWindow,
} from "@/lib/savedWorkouts";
import {
  readinessFor,
  type BodySignals,
  type Feel,
  type Readiness,
} from "@/lib/readiness";
import { readFeel, subscribeFeel, writeFeel } from "@/lib/readinessFeel";
import { isLowerBodyDay } from "@/features/program/easierToday";
import {
  HARD_RUN_TYPES,
  type WorkoutDay,
} from "@/features/program/programTypes";

export interface TodayReadiness {
  readiness: Readiness;
  feel: Feel | null;
  /** Keep this morning's answer (null asks again). */
  setFeel: (feel: Feel | null) => void;
}

export interface TodayReadinessOptions {
  /** Today's planned run is a hard one (tempo, intervals, long, race). */
  todayHardRun?: boolean;
  /**
   * Caller-supplied recent workouts (for surfaces like Home that already hold
   * `useWorkouts()`), avoiding a second Firestore listener.
   */
  recentWorkouts?: readonly Pick<Workout, "date" | "exercises">[];
}

const LOWER_BODY_CATEGORY_RE =
  /^(legs|quads|hamstrings|glutes|calves|lower body)$/i;

/**
 * Whether a completed saved workout meaningfully loaded the legs: at least one
 * logged non-warmup set on a knee-dominant, hip-dominant, or lower-body lift.
 */
export function savedWorkoutLoadsLegs(
  workout: Pick<Workout, "exercises">
): boolean {
  return (workout.exercises ?? []).some((ex) => {
    const workingSets = (ex.sets ?? []).filter(
      (s) => s.type !== "warmup" && ((s.reps ?? 0) > 0 || (s.weightKg ?? 0) > 0)
    );
    if (workingSets.length === 0) return false;
    const category = matchMovementCategory(ex.exerciseName, ex.exerciseId);
    if (category === "knee_dominant" || category === "hip_dominant") {
      return true;
    }
    return LOWER_BODY_CATEGORY_RE.test((ex.category ?? "").trim());
  });
}

/** Whether a scheduled run day carries a demanding run type. */
export function isScheduledHardRun(
  run: { type?: string | null } | null | undefined
): boolean {
  return typeof run?.type === "string" && HARD_RUN_TYPES.has(run.type);
}

/**
 * Bidirectional readiness for today's training: this morning's feel answer,
 * yesterday's hard run before a leg-loading lift, yesterday's leg-loading lift
 * before a hard run, and (for Pro accounts on iOS) Apple Health sleep/heart
 * signals.
 */
export function useTodayReadiness(
  day: Pick<WorkoutDay, "exercises"> | undefined,
  body: BodySignals | null = null,
  options: TodayReadinessOptions = {}
): TodayReadiness {
  const uid = useUid() ?? null;
  const today = useLocalDateKey();
  const [feel, setFeelState] = useState<Feel | null>(() =>
    uid ? readFeel(uid, today) : null
  );
  /* A new day, another account, or a change on another tab refreshes the stored answer. */
  useEffect(() => {
    const sync = () => setFeelState(uid ? readFeel(uid, today) : null);
    sync();
    return subscribeFeel(sync);
  }, [uid, today]);

  const yesterday = useMemo(
    () => localDateString(addLocalDays(parseLocalDate(today), -1)),
    [today]
  );

  const todayLoadsLegs = day ? isLowerBodyDay(day) : false;
  const todayHardRun = options.todayHardRun === true;

  // Only subscribe to yesterday's runs when today's lift loads the legs.
  const runWindow = useMemo<RunWindow>(
    () => ({ since: yesterday, until: today }),
    [yesterday, today]
  );
  const queriedRuns = useSavedSessions(
    SAVED_RUNS,
    todayLoadsLegs ? (uid ?? undefined) : undefined,
    runWindow
  );
  const hardRunYesterday = useMemo(() => {
    if (!todayLoadsLegs || !queriedRuns.evidenceReady) return false;
    return queriedRuns.items.some(
      (run) =>
        isVolumeEligible(run) &&
        runEvidenceDate(run) === yesterday &&
        isHardRun(run)
    );
  }, [todayLoadsLegs, queriedRuns.evidenceReady, queriedRuns.items, yesterday]);

  // Only open a minimal yesterday-only workout listener when today has a hard
  // run AND the caller did not already supply `recentWorkouts`.
  const needsWorkoutQuery =
    todayHardRun && options.recentWorkouts === undefined;
  const workoutWindow = useMemo<WorkoutWindow>(
    () => ({ since: yesterday, until: yesterday, cap: 10 }),
    [yesterday]
  );
  const queriedWorkouts = useSavedSessions(
    SAVED_WORKOUTS,
    needsWorkoutQuery ? (uid ?? undefined) : undefined,
    workoutWindow
  );
  const recentWorkouts = options.recentWorkouts ?? queriedWorkouts.items;
  const workoutsReady =
    options.recentWorkouts !== undefined || !queriedWorkouts.loading;

  const legDayYesterday = useMemo(() => {
    if (!todayHardRun || !workoutsReady) return false;
    return recentWorkouts.some(
      (workout) => workout.date === yesterday && savedWorkoutLoadsLegs(workout)
    );
  }, [todayHardRun, workoutsReady, recentWorkouts, yesterday]);

  const readiness = useMemo(
    () =>
      readinessFor({
        feel,
        hardRunYesterday,
        legDayYesterday,
        todayLoadsLegs,
        todayHardRun,
        body,
      }),
    [
      feel,
      hardRunYesterday,
      legDayYesterday,
      todayLoadsLegs,
      todayHardRun,
      body,
    ]
  );

  const setFeel = useCallback(
    (next: Feel | null) => {
      if (uid) writeFeel(uid, today, next);
      setFeelState(next);
    },
    [uid, today]
  );

  return { readiness, feel, setFeel };
}
