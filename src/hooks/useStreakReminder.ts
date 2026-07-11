import { useCallback, useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { setDocGuarded } from "@/lib/firestoreWrite";
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
import { format } from "date-fns";
import {
  STREAK_NOTIFICATION_ID,
  FIRST_WEEK_NOTIFICATION_ID,
} from "./streakNotificationId";

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
  /**
   * Local YYYY-MM-DD the once-ever first-week (day-2) return nudge was
   * scheduled to FIRE (D-1 fix). Presence = consumed — the nudge never
   * schedules again for this user. The dateKey (rather than a boolean)
   * lets cancel-on-log target exactly the pending fire day.
   */
  firstWeekNudgeDateKey: string | null;
}

const DEFAULT_PREFS: StreakReminderPrefs = {
  enabled: true,
  time: "20:00",
  primingShown: false,
  firstWeekNudgeDateKey: null,
};

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
 * First-week (day-2) return nudge — pure decision (D-1,
 * docs/frontend-design-principles-2026-07.md). The daily streak reminder
 * above keeps its deliberate `>= 2` floor (a repeating alarm needs a streak
 * worth protecting); this fills the day-1 → day-2 gap with ONE calm
 * one-shot local notification, scheduled on the user's FIRST log day to
 * fire the following evening, consumed forever once scheduled.
 *
 *   - "schedule": today is a log day (hasLoggedToday), the streak is
 *     exactly at its first day (< 2, and ≥ 1 so a log actually landed),
 *     consent has been granted (enabled + primingShown), and the nudge has
 *     never been scheduled before → schedule the one-shot for tomorrow at
 *     prefs.time and stamp `firstWeekNudgeDateKey`.
 *   - "cancel": the marker exists and either the reminder was disabled, or
 *     it's the fire day and the user already logged (they came back on
 *     their own — the nudge's job is done, don't fire it at them).
 *   - "none": everything else. Cancel is idempotent, so callers may act on
 *     repeated "cancel" results safely.
 */
export function firstWeekNudgeAction(state: {
  loading: boolean;
  enabled: boolean;
  primingShown: boolean;
  currentStreak: number;
  hasLoggedToday: boolean;
  firstWeekNudgeDateKey: string | null;
  todayKey: string;
}): "schedule" | "cancel" | "none" {
  if (state.loading) return "none";
  if (state.firstWeekNudgeDateKey) {
    if (!state.enabled) return "cancel";
    if (state.firstWeekNudgeDateKey === state.todayKey && state.hasLoggedToday)
      return "cancel";
    return "none";
  }
  if (!state.enabled) return "none";
  if (!state.primingShown) return "none";
  if (state.currentStreak < 1 || state.currentStreak >= 2) return "none";
  if (!state.hasLoggedToday) return "none";
  return "schedule";
}

/**
 * A Date for TOMORROW at the given "HH:MM" — the first-week nudge always
 * fires the evening AFTER the log day, never the same evening (the user
 * already logged today; nudging them tonight would be noise). Null on
 * malformed input, mirroring computeNextOccurrence.
 */
export function computeTomorrowOccurrence(timeHHMM: string): Date | null {
  const match = /^(\d{2}):(\d{2})$/.exec(timeHHMM);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours > 23 || minutes > 59) return null;
  const target = new Date();
  target.setDate(target.getDate() + 1);
  target.setHours(hours, minutes, 0, 0);
  return target;
}

/**
 * Heavy-lifting internal hook — run once per authenticated session by
 * <RemindersProvider>. Public callers use `useStreakReminder` from
 * RemindersProvider.tsx which reads this hook's output from context.
 */
export function useStreakReminderInternal() {
  const { user } = useAuth();
  const {
    currentStreak,
    hasLoggedToday,
    loading: streaksLoading,
  } = useStreaks();
  const [prefs, setPrefs] = useState<StreakReminderPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);

  // ── Firestore load / persist ──────────────────────────────────────────

  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: clear loading when signed out
      setLoading(false);
      return;
    }
    const ref = doc(db, "users", user.uid, "settings", "streakReminder");
    getDoc(ref)
      .then((snap) => {
        if (snap.exists()) {
          setPrefs({
            ...DEFAULT_PREFS,
            ...(snap.data() as Partial<StreakReminderPrefs>),
          });
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
        await setDocGuarded(ref, next);
      } catch (err) {
        logger.error("[StreakReminder] save failed", err);
        captureError(
          err instanceof Error ? err : new Error(String(err)),
          "network",
          { surface: "streakReminder.save" }
        );
      }
    },
    [user, prefs]
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

  // ── First-week (day-2) return nudge — one-shot, once ever ────────────
  //
  // Runs alongside the daily reminder effect above but manages its OWN
  // notification id, so the two can't clobber each other. Schedule happens
  // on the first log day (streak 1) for tomorrow evening; the marker write
  // makes it once-ever. Cancel-on-log for the fire day is handled here too:
  // useStreaks' snapshot flips hasLoggedToday in near-real-time while the
  // app is open, and logging is only possible in-app, so a day-2 log always
  // re-runs this effect before the user backgrounds.
  //
  // The marker is stamped only when the OS accepted the schedule — if
  // permission lapsed at the OS level, the once-ever budget isn't consumed
  // and a later log day (still below the `>= 2` floor) may retry.

  useEffect(() => {
    if (loading || streaksLoading) return;

    const action = firstWeekNudgeAction({
      loading: false,
      enabled: prefs.enabled,
      primingShown: prefs.primingShown,
      currentStreak,
      hasLoggedToday,
      firstWeekNudgeDateKey: prefs.firstWeekNudgeDateKey ?? null,
      todayKey: format(new Date(), "yyyy-MM-dd"),
    });

    if (action === "cancel") {
      void cancelNotification(FIRST_WEEK_NOTIFICATION_ID).catch((err) => {
        logger.warn("[FirstWeekNudge] cancel failed", err);
      });
      return;
    }
    if (action !== "schedule") return;

    const fireAt = computeTomorrowOccurrence(prefs.time);
    if (!fireAt) {
      logger.warn("[FirstWeekNudge] malformed time", prefs.time);
      return;
    }

    let cancelled = false;
    void (async () => {
      // Always-cancel-before-schedule, same platform-quirk defence as the
      // daily reminder above.
      await cancelNotification(FIRST_WEEK_NOTIFICATION_ID).catch((err) => {
        logger.warn("[FirstWeekNudge] pre-schedule cancel failed", err);
      });
      if (cancelled) return;
      const scheduled = await scheduleNotification({
        id: FIRST_WEEK_NOTIFICATION_ID,
        title: "Yesterday was a good start 💪",
        body: "A quick log today keeps it going.",
        scheduleAt: fireAt,
        // One-shot by design — no repeats. A daily alarm at streak 0–1 is
        // exactly the anxiety the weekly-cadence philosophy avoids.
      });
      if (cancelled || !scheduled) return;
      await updatePrefs({
        firstWeekNudgeDateKey: format(fireAt, "yyyy-MM-dd"),
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [
    loading,
    streaksLoading,
    prefs.enabled,
    prefs.primingShown,
    prefs.time,
    prefs.firstWeekNudgeDateKey,
    currentStreak,
    hasLoggedToday,
    updatePrefs,
  ]);

  return {
    prefs,
    loading,
    updatePrefs,
    // Stable module-level function — no useCallback wrapper needed.
    requestPermission: requestNotificationPermission,
    // Exposed so the priming modal trigger can read the same values without
    // re-subscribing to Firestore.
    currentStreak,
    hasLoggedToday,
  };
}
