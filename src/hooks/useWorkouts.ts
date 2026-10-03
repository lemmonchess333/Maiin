import { useCallback } from "react";
import { parseISO } from "date-fns";
import { localDateString } from "@/lib/dateHelpers";
import { Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { estimateLiftBurn } from "@/lib/workoutBurn";
import { logger } from "@/lib/logger";
import { safeMerge } from "@/lib/offlineQueue";
import { noteActivitySnapshot } from "@/lib/activationTracker";
import {
  SAVED_WORKOUTS,
  type Workout,
  type WorkoutWindow,
} from "@/lib/savedWorkouts";
import { useSavedSessions } from "./useSavedSessions";

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

export type { Workout, WorkoutExercise, WorkoutSet } from "@/lib/savedWorkouts";
export { workoutTonnageKg } from "@/lib/savedWorkouts";

/**
 * The session's display name.
 *
 * `notes` carries the identity for programme and routine saves — e.g.
 * "Push — Chest Focus — Programme Week 3" — where the leading segment is the
 * day name. Freeform saves may have neither, hence the fallback.
 *
 * Shared rather than inlined because two surfaces title the same document:
 * `/workout/:id` and Home's day card. Two copies of a string split is exactly
 * the kind of duplication that drifts silently — one surface would start
 * showing the full note while the other showed the prefix, for one workout.
 */
export function workoutTitle(workout: { notes?: string }): string {
  // `notes` is typed required on `Workout`, but legacy docs and the projected
  // shapes callers pass (Home's day card) can omit it — hence optional here
  // rather than `Pick<Workout, "notes">`, which would reject them.
  return workout.notes?.split(" — ")[0]?.trim() || "Workout";
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

const COVERAGE_WINDOW: Record<WorkoutCoverage, WorkoutWindow> = {
  recent: { latest: RECENT_WORKOUT_LIMIT },
  complete: { all: true },
};

/* Activation funnel: fire `workout_completed` once per newly-created
   workout across all write paths. Only the "recent" listener is the
   lifecycle event source — a "complete" listener can mount after a recent
   one and would falsely count every pre-existing workout beyond the first
   50 as newly-created activity. It is given the list's own rows, not this
   phone's unsynced ones, so a workout fires when it reaches the server, as
   it always has. */
const noteRecentWorkouts = (loaded: Workout[], uid: string) =>
  noteActivitySnapshot(
    "workout",
    uid,
    loaded.map((workout) => workout.id)
  );

export function useWorkouts(options: UseWorkoutsOptions = {}) {
  const { user, profile } = useAuth();
  const uid = user?.uid;
  const coverage = options.coverage ?? "recent";

  /* Through the one workout reader on the shared session engine: account
     A's history never renders while account B's listener is establishing,
     a failed read keeps the rows already shown (so a transient rule or
     network error doesn't empty the history view), and a workout finished
     offline shows at once. */
  const { items: workouts, loading } = useSavedSessions(
    SAVED_WORKOUTS,
    uid,
    COVERAGE_WINDOW[coverage],
    coverage === "recent" ? { onLoaded: noteRecentWorkouts } : {}
  );

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

  /* `deleteWorkout` was here, unwired, from before ADR-0012 — the only
     code path that deleted a workout, and deliberately connected to
     nothing because the server had no reversal. The real path now lives in
     `lib/sessionDelete` and is called from `/workout/:id`, which does not
     mount this hook (it deep-links to a single session and would 404 on
     anything older than the newest 50 this list holds). Keeping a second
     delete path here would be an unwired duplicate of a wired one — which
     is what `hookSurfaceReachability` exists to catch. */

  const getWorkoutsForDate = useCallback(
    (date: string) => {
      return workouts.filter((w) => w.date === date);
    },
    [workouts]
  );

  return {
    workouts,
    loading,
    saveWorkout,
    getWorkoutsForDate,
  };
}
