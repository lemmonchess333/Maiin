import { useState, useEffect, useCallback } from "react";
import { doc, getDoc } from "firebase/firestore";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import {
  scheduleNotification,
  cancelNotification,
  requestNotificationPermission,
} from "@/lib/notifications";
import { logger } from "@/lib/logger";
import { captureError } from "@/lib/errorReporting";

export interface WorkoutReminders {
  enabled: boolean;
  time: string;
}

const DEFAULT_REMINDERS: WorkoutReminders = {
  enabled: false,
  time: "07:00",
};

/**
 * One stable ID per weekday so the workout reminder can fire weekly
 * on each non-rest day independently. Sunday = 2001, Saturday = 2007.
 * Pre-PR-M this was a single ID scheduled once for the next workout
 * day, which fired exactly once and then silently stopped (no
 * repeat semantics on a `schedule.at` payload). The per-weekday
 * fanout lets each day re-arm weekly via `repeatEvery: 'week'` so
 * the user keeps getting reminders on the days they care about.
 */
const WORKOUT_NOTIFICATION_IDS = [
  2001, 2002, 2003, 2004, 2005, 2006, 2007,
] as const;

/**
 * Next future Date landing on `weekday` (0=Sunday … 6=Saturday) at the
 * given HH:MM. Used to anchor a weekly-repeating notification so the
 * OS re-arms it on the same weekday going forward. If the weekday is
 * today and the time is still ahead, returns today; otherwise the
 * next matching weekday.
 */
function computeNextWeekdayOccurrence(
  timeHHMM: string,
  weekday: number
): Date | null {
  const match = /^(\d{2}):(\d{2})$/.exec(timeHHMM);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours > 23 || minutes > 59) return null;
  const now = new Date();
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);
  // Advance to the next instance of `weekday`.
  const todayWeekday = target.getDay();
  let daysAhead = (weekday - todayWeekday + 7) % 7;
  if (daysAhead === 0 && target.getTime() <= now.getTime()) {
    daysAhead = 7;
  }
  target.setDate(target.getDate() + daysAhead);
  return target;
}

/**
 * Mirrors the original fire-time check: a day counts as a workout day
 * unless weekSchedule is a 7-entry array with an explicit 'rest' entry
 * for that day-of-week.
 */
function isWorkoutDay(
  dayOfWeek: number,
  schedule: ReadonlyArray<{ day: number; type: string }> | undefined
): boolean {
  if (!schedule || schedule.length !== 7) return true;
  const todaySchedule = schedule.find((s) => s.day === dayOfWeek);
  if (!todaySchedule) return false;
  return todaySchedule.type !== "rest";
}

/**
 * Heavy-lifting internal hook — run once per authenticated session by
 * <RemindersProvider>. Public callers use `useWorkoutReminders` from
 * RemindersProvider.tsx which reads this hook's output from context.
 */
export function useWorkoutRemindersInternal() {
  const { user, profile } = useAuth();
  const [reminders, setReminders] =
    useState<WorkoutReminders>(DEFAULT_REMINDERS);
  const [loading, setLoading] = useState(true);

  // Load from Firestore
  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: clear loading when signed out
      setLoading(false);
      return;
    }
    const ref = doc(db, "users", user.uid, "settings", "workoutReminders");
    getDoc(ref)
      .then((snap) => {
        if (snap.exists()) {
          setReminders({
            ...DEFAULT_REMINDERS,
            ...(snap.data() as WorkoutReminders),
          });
        }
        setLoading(false);
      })
      .catch((err) => {
        logger.error("[WorkoutReminders] load failed", err);
        setLoading(false);
      });
  }, [user]);

  // Save to Firestore — see useMealReminders.ts for the error-handling
  // rationale (critical-keyword tagging persists to users/{uid}/errors,
  // failures don't re-throw into the UI).
  const updateReminders = useCallback(
    async (updates: Partial<WorkoutReminders>) => {
      if (!user) return;
      const updated = { ...reminders, ...updates };
      setReminders(updated);
      const ref = doc(db, "users", user.uid, "settings", "workoutReminders");
      try {
        await setDocGuarded(ref, updated);
      } catch (err) {
        logger.error("[WorkoutReminders] save failed", err);
        captureError(
          err instanceof Error ? err : new Error(String(err)),
          "network",
          {
            surface: "workoutReminders.save",
          }
        );
      }
    },
    [user, reminders]
  );

  // Schedule / reschedule reminders. One weekly-repeating notification
  // per non-rest weekday so the user gets honest reminders that respect
  // their training schedule and keep firing without the app needing
  // to be open.
  useEffect(() => {
    let cancelled = false;

    const rescheduleWorkout = async () => {
      // Cancel ALL 7 weekday IDs every pass — handles schedule edits
      // (a day flipping from lift to rest) and the disable toggle.
      for (const id of WORKOUT_NOTIFICATION_IDS) {
        await cancelNotification(id);
      }

      if (cancelled || !reminders.enabled) return;

      const schedule = profile?.weekSchedule as
        | ReadonlyArray<{ day: number; type: string }>
        | undefined;

      // Schedule one weekly-repeating notification per workout day.
      // Day index follows the existing `weekSchedule` convention
      // (0=Sunday … 6=Saturday). Each gets a stable ID 2001+day so
      // toggling a day off cleanly cancels just that day.
      for (let day = 0; day < 7; day++) {
        if (!isWorkoutDay(day, schedule)) continue;
        const at = computeNextWeekdayOccurrence(reminders.time, day);
        if (!at) continue;
        await scheduleNotification({
          id: WORKOUT_NOTIFICATION_IDS[day],
          title: "Time to train",
          body: "Your session is ready when you are.",
          scheduleAt: at,
          // Weekly repeat anchored on this weekday — the OS re-arms
          // it for the same weekday + time every week, so the user
          // doesn't have to open the app to keep them queued.
          repeats: true,
          repeatEvery: "week",
        });
      }
    };

    rescheduleWorkout();

    return () => {
      cancelled = true;
    };
  }, [reminders, profile]);

  // Permission request is a stable module-level function — no wrapper needed.
  return {
    reminders,
    loading,
    updateReminders,
    requestPermission: requestNotificationPermission,
  };
}
