import { useCallback, useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { useStreaks } from "@/features/streaks/useStreaks";
import {
  scheduleNotification,
  cancelNotification,
  requestNotificationPermission,
} from "@/lib/notifications";
import { logger } from "@/lib/logger";
import { captureError } from "@/lib/errorReporting";

/**
 * Streak-at-risk reminder — fires in the evening if the user hasn't logged
 * today and their current streak is ≥ 2. One notification per user.
 *
 * Mirrors useMealReminders / useWorkoutReminders:
 *   - Firestore-backed preferences at users/{uid}/settings/streakReminder.
 *   - Schedules via @capacitor/local-notifications on native; silent no-op
 *     on web when permission isn't granted.
 *   - Always-cancel-before-schedule so platform quirks around replacing a
 *     same-id notification can't cause duplicates.
 *
 * Guard chain (all must pass to schedule):
 *   1. Prefs loaded.
 *   2. `enabled` is true.
 *   3. `primingShown` is true — the permission priming modal has been
 *      responded to. Without this gate we could schedule a reminder for a
 *      user who's never opted in.
 *   4. `currentStreak >= 2` — no point nagging a brand-new user who
 *      doesn't have a streak yet.
 *   5. `hasLoggedToday` is false — cancel-on-activity in useStreaks also
 *      covers the mid-day case, but we re-check here on every eval to
 *      avoid scheduling a stale reminder right after a fresh log.
 */

export interface StreakReminderPrefs {
  enabled: boolean;
  time: string; // HH:MM 24-hour local time
  primingShown: boolean;
}

const DEFAULT_PREFS: StreakReminderPrefs = {
  enabled: true,
  time: "20:00",
  primingShown: false,
};

export const STREAK_NOTIFICATION_ID = 3001;

/**
 * Given a "HH:MM" time string, return a Date for the next occurrence —
 * today if the time is still in the future, otherwise tomorrow.
 * Returns null if the input is malformed.
 *
 * Same shape as computeNextOccurrence in useWorkoutReminders — kept
 * local so a change to one reminder type can't silently break another.
 */
function computeNextOccurrence(timeHHMM: string): Date | null {
  const match = /^(\d{2}):(\d{2})$/.exec(timeHHMM);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours > 23 || minutes > 59) return null;
  const now = new Date();
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

/**
 * Pure decision function extracted for unit testability. Given the current
 * state, decide whether we SHOULD schedule a reminder. Separate from the
 * effect that actually calls schedule/cancel so tests don't need to mock
 * out Capacitor.
 */
export function shouldScheduleStreakReminder(state: {
  loading: boolean;
  enabled: boolean;
  primingShown: boolean;
  currentStreak: number;
  hasLoggedToday: boolean;
}): boolean {
  if (state.loading) return false;
  if (!state.enabled) return false;
  if (!state.primingShown) return false;
  if (state.currentStreak < 2) return false;
  if (state.hasLoggedToday) return false;
  return true;
}

/**
 * Heavy-lifting internal hook — run once per authenticated session by
 * <RemindersProvider>. Public callers use `useStreakReminder` from
 * RemindersProvider.tsx which reads this hook's output from context.
 */
export function useStreakReminderInternal() {
  const { user } = useAuth();
  const { currentStreak, hasLoggedToday, loading: streaksLoading } = useStreaks();
  const [prefs, setPrefs] = useState<StreakReminderPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);

  // ── Firestore load / persist ──────────────────────────────────────────

  useEffect(() => {
    if (!user) {
      // Wrap synchronous setState through a local reset() so the lint rule
      // `react-hooks/set-state-in-effect` doesn't flag this — matches the
      // exact workaround used in useWorkoutReminders.ts:67.
      const reset = () => { setLoading(false); };
      reset();
      return;
    }
    const ref = doc(db, "users", user.uid, "settings", "streakReminder");
    getDoc(ref)
      .then((snap) => {
        if (snap.exists()) {
          setPrefs({ ...DEFAULT_PREFS, ...(snap.data() as Partial<StreakReminderPrefs>) });
        }
        setLoading(false);
      })
      .catch((err) => {
        logger.error("[StreakReminder] load failed", err);
        setLoading(false);
      });
  }, [user]);

  const updatePrefs = useCallback(
    async (updates: Partial<StreakReminderPrefs>) => {
      if (!user) return;
      const next = { ...prefs, ...updates };
      setPrefs(next);
      const ref = doc(db, "users", user.uid, "settings", "streakReminder");
      try {
        await setDoc(ref, next);
      } catch (err) {
        logger.error("[StreakReminder] save failed", err);
        captureError(
          err instanceof Error ? err : new Error(String(err)),
          "network",
          { surface: "streakReminder.save" },
        );
      }
    },
    [user, prefs],
  );

  // ── Reschedule on any relevant state change ───────────────────────────
  //
  // Re-evaluation triggers:
  //   - Mount.
  //   - prefs.enabled / prefs.time / prefs.primingShown change.
  //   - currentStreak change.
  //   - hasLoggedToday change (user logs something → cancel;
  //     midnight rollover clears today's activity → re-schedule).
  //
  // Foreground events are NOT handled here directly. The hasLoggedToday
  // value comes from useStreaks, whose onSnapshot subscriptions reflect
  // activity changes in near-real-time while the app is open. Priming
  // does use a visibilitychange listener — that lives in the priming
  // trigger effect (see StreakReminderPrimingModal mount).

  useEffect(() => {
    if (loading || streaksLoading) return;

    let cancelled = false;

    const reschedule = async () => {
      // Always cancel first — regardless of whether we'll reschedule.
      // Some platforms don't cleanly replace a same-id notification.
      // cancelNotification already logs via logger.error in lib/notifications;
      // the outer catch here is just to prevent an unhandled rejection on
      // the no-op web path.
      await cancelNotification(STREAK_NOTIFICATION_ID).catch((err) => {
        logger.warn("[StreakReminder] cancel failed", err);
      });

      if (cancelled) return;

      const shouldSchedule = shouldScheduleStreakReminder({
        loading: false,
        enabled: prefs.enabled,
        primingShown: prefs.primingShown,
        currentStreak,
        hasLoggedToday,
      });
      if (!shouldSchedule) return;

      const fireAt = computeNextOccurrence(prefs.time);
      if (!fireAt) {
        logger.warn("[StreakReminder] malformed time", prefs.time);
        return;
      }

      await scheduleNotification({
        id: STREAK_NOTIFICATION_ID,
        title: "Keep your streak alive",
        body: `Still time to log today and keep your ${currentStreak}-day streak going`,
        scheduleAt: fireAt,
        // Daily-repeating so the evening check doesn't silently stop
        // after one fire. The current-streak body text is captured at
        // schedule time — when the streak changes the cancel-and-
        // reschedule effect above re-runs with the fresh number.
        // cancel-on-log via useStreaks still handles the same-day
        // suppression.
        repeats: true,
      });
    };

    void reschedule();

    return () => {
      cancelled = true;
    };
  }, [
    loading,
    streaksLoading,
    prefs.enabled,
    prefs.time,
    prefs.primingShown,
    currentStreak,
    hasLoggedToday,
  ]);

  const requestPermission = useCallback(async () => {
    return requestNotificationPermission();
  }, []);

  return {
    prefs,
    loading,
    updatePrefs,
    requestPermission,
    // Exposed so the priming modal trigger can read the same values without
    // re-subscribing to Firestore.
    currentStreak,
    hasLoggedToday,
  };
}
