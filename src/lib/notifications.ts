import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { logger } from "@/lib/logger";

export interface NotificationPayload {
  /** Stable integer ID — lets us cancel or replace a previously scheduled notification */
  id: number;
  title: string;
  body: string;
  /** If set, schedule for this time. If omitted, fire immediately. */
  scheduleAt?: Date;
  /**
   * When true on native, the notification re-arms at the cadence
   * given by `repeatEvery` (defaults to 'day') after the initial
   * `scheduleAt` fire. Without this the meal / streak / workout
   * reminders silently stopped working after their first delivery —
   * the OS doesn't auto-repeat a `schedule.at` payload. Web fallback
   * ignores this flag (the setTimeout path only fires while the tab
   * is open anyway, so recurrence there is moot).
   */
  repeats?: boolean;
  /**
   * Recurrence cadence. Defaults to 'day'. Pass 'week' when the
   * caller wants fires on a specific weekday (the `scheduleAt`
   * should land on the target weekday) — used by the workout
   * reminder hook to schedule one notification per non-rest weekday.
   */
  repeatEvery?: "day" | "week";
}

const isNative = Capacitor.isNativePlatform();

/**
 * Request notification permission from the user.
 * Returns true if granted, false otherwise.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    if (isNative) {
      const result = await LocalNotifications.requestPermissions();
      return result.display === "granted";
    }
    if (typeof window !== "undefined" && "Notification" in window) {
      const result = await Notification.requestPermission();
      return result === "granted";
    }
    return false;
  } catch (err) {
    logger.error("requestNotificationPermission failed", err);
    return false;
  }
}

/**
 * Check whether notification permission is currently granted.
 */
export async function hasNotificationPermission(): Promise<boolean> {
  try {
    if (isNative) {
      const result = await LocalNotifications.checkPermissions();
      return result.display === "granted";
    }
    if (typeof window !== "undefined" && "Notification" in window) {
      return Notification.permission === "granted";
    }
    return false;
  } catch (err) {
    logger.error("hasNotificationPermission failed", err);
    return false;
  }
}

export type NotificationPermissionState = "granted" | "denied" | "default" | "unsupported";

/**
 * Fine-grained permission state — lets callers distinguish "denied" (user
 * actively blocked; needs OS-settings trip to recover) from "default" (not
 * asked yet; a request prompt will work). Used by the NotificationsSection
 * banner so we only nag users whose permission is actually blocking.
 */
export async function getNotificationPermissionState(): Promise<NotificationPermissionState> {
  try {
    if (isNative) {
      const result = await LocalNotifications.checkPermissions();
      // Capacitor enum is 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale'.
      if (result.display === "granted") return "granted";
      if (result.display === "denied") return "denied";
      return "default";
    }
    if (typeof window !== "undefined" && "Notification" in window) {
      const perm = Notification.permission;
      if (perm === "granted") return "granted";
      if (perm === "denied") return "denied";
      return "default";
    }
    return "unsupported";
  } catch (err) {
    logger.error("getNotificationPermissionState failed", err);
    return "unsupported";
  }
}

/**
 * Schedule or immediately fire a notification.
 * Returns true on success.
 */
export async function scheduleNotification(payload: NotificationPayload): Promise<boolean> {
  const granted = await hasNotificationPermission();
  if (!granted) return false;

  try {
    if (isNative) {
      // Native schedule shape:
      //   `at` for the first fire time;
      //   `every: 'day'` plus `repeats: true` so the OS keeps re-arming
      //   the notification daily — without it the entry is one-shot and
      //   silently stops working after day 1. We always also send `at`
      //   alongside `every` because Capacitor uses `at` as the anchor
      //   for the first occurrence; omitting it makes the first fire
      //   ambiguous on some platform builds.
      const schedule = payload.scheduleAt
        ? payload.repeats
          ? {
              at: payload.scheduleAt,
              every: (payload.repeatEvery ?? "day") as "day" | "week",
              repeats: true,
            }
          : { at: payload.scheduleAt }
        : undefined;
      await LocalNotifications.schedule({
        notifications: [
          {
            id: payload.id,
            title: payload.title,
            body: payload.body,
            schedule,
          },
        ],
      });
      return true;
    }

    if (typeof window !== "undefined" && "Notification" in window) {
      if (payload.scheduleAt) {
        const delay = payload.scheduleAt.getTime() - Date.now();
        if (delay <= 0) {
          new Notification(payload.title, { body: payload.body });
        } else {
          // Web fallback: setTimeout only fires if the app stays open.
          // Accepted limitation — web is not the primary delivery target.
          setTimeout(() => {
            try {
              new Notification(payload.title, { body: payload.body });
            } catch (err) {
              logger.error("web notification fire failed", err);
            }
          }, delay);
        }
      } else {
        new Notification(payload.title, { body: payload.body });
      }
      return true;
    }

    return false;
  } catch (err) {
    logger.error("scheduleNotification failed", err);
    return false;
  }
}

/**
 * Cancel a single scheduled notification by ID.
 * No-op on web (setTimeout handles are not tracked).
 */
export async function cancelNotification(id: number): Promise<void> {
  if (!isNative) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } catch (err) {
    logger.error("cancelNotification failed", err);
  }
}

/**
 * Cancel all scheduled notifications.
 */
export async function cancelAllNotifications(): Promise<void> {
  if (!isNative) return;
  try {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({ notifications: pending.notifications });
    }
  } catch (err) {
    logger.error("cancelAllNotifications failed", err);
  }
}

/**
 * PR I (audit P1 #10): pending-notifications diagnostics.
 *
 * Returns the list of notifications the OS has currently scheduled
 * to fire — meal reminders, workout reminders, streak reminders. The
 * Settings → Notifications surface uses this to show users a "Next
 * reminder: <human-time>" line so they can verify their setup works
 * without having to wait for the actual fire-time.
 *
 * Native (Capacitor LocalNotifications.getPending) is the only place
 * this returns real data. On web there's no equivalent — the setTimeout
 * fallback is session-bound and isn't queryable across reloads — so
 * we return an empty array and let the caller surface "Web reminders
 * fire only while the app is open" copy.
 */
export interface PendingNotification {
  id: number;
  title: string | null;
  body: string | null;
  /** ISO string when the OS will fire it, or null if Capacitor didn't
   *  return a schedule (one-shot at: dates always do; legacy entries
   *  might not). */
  scheduleAt: string | null;
}

export async function getPendingNotifications(): Promise<PendingNotification[]> {
  if (!isNative) return [];
  try {
    const result = await LocalNotifications.getPending();
    return result.notifications.map((n) => ({
      id: n.id,
      title: n.title ?? null,
      body: n.body ?? null,
      // Capacitor's schedule.at is a Date when the at form is used;
      // it can also be undefined / cron-style on more complex
      // schedules. Defensive read.
      scheduleAt:
        n.schedule && typeof n.schedule === "object" && "at" in n.schedule && n.schedule.at instanceof Date
          ? n.schedule.at.toISOString()
          : null,
    }));
  } catch (err) {
    logger.error("getPendingNotifications failed", err);
    return [];
  }
}

/**
 * PR I (audit P1 #10): fire a test notification ~3s from now so the
 * user can verify their device-level setup. Useful when permission was
 * granted weeks ago and the user can't remember whether iOS Do-Not-
 * Disturb / Focus is currently filtering Tropos notifications.
 *
 * Uses a stable ID per category so successive test taps replace rather
 * than queue (no spam if the user impatiently double-taps).
 */
export type TestNotificationKind = "meal" | "workout" | "streak" | "generic";

const TEST_NOTIFICATION_IDS: Record<TestNotificationKind, number> = {
  // High IDs to avoid collision with the real reminders (which use
  // dayIndex-style low integers).
  generic: 9990,
  meal: 9991,
  workout: 9992,
  streak: 9993,
};

const TEST_NOTIFICATION_COPY: Record<TestNotificationKind, { title: string; body: string }> = {
  generic: { title: "Tropos test notification", body: "If you can read this, notifications are working." },
  meal: { title: "Meal reminder test", body: "This is what your meal reminders look like." },
  workout: { title: "Workout reminder test", body: "This is what your workout reminders look like." },
  streak: { title: "Streak reminder test", body: "This is what your streak reminders look like." },
};

export async function sendTestNotification(kind: TestNotificationKind = "generic"): Promise<boolean> {
  const copy = TEST_NOTIFICATION_COPY[kind];
  return scheduleNotification({
    id: TEST_NOTIFICATION_IDS[kind],
    title: copy.title,
    body: copy.body,
    scheduleAt: new Date(Date.now() + 3000),
  });
}
