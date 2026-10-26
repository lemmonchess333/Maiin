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
   * When true on native, the notification repeats at `scheduleAt`'s
   * wall-clock time every day (or, with `repeatEvery: 'week'`, on its
   * weekday) — see `nativeSchedule`. Without this the meal / streak /
   * workout reminders silently stopped working after their first
   * delivery. Web fallback ignores this flag (the setTimeout path only
   * fires while the tab is open anyway, so recurrence there is moot).
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
const webTimers = new Map<number, ReturnType<typeof setTimeout>>();

/** The plugin's schedule shapes this module sends. Weekday is iOS's
 *  calendar weekday, 1 = Sunday (`Date.getDay() + 1`). */
export type NativeSchedule =
  | { at: Date }
  | { on: { hour: number; minute: number; weekday?: number } };

/** The first time after `now` that falls on `at`'s hour and minute (and, for
 *  a weekly reminder, its weekday). */
function nextNaturalOccurrence(
  at: Date,
  every: "day" | "week",
  now: Date
): Date {
  const next = new Date(now);
  next.setHours(at.getHours(), at.getMinutes(), 0, 0);
  const step = () => next.setDate(next.getDate() + 1);
  if (next.getTime() <= now.getTime()) step();
  if (every === "week") while (next.getDay() !== at.getDay()) step();
  return next;
}

/**
 * The schedule a native reminder is sent with.
 *
 * A repeating reminder is a calendar trigger on its hour and minute (and
 * weekday). It used to be `{ at, every, repeats: true }`, and the iOS plugin
 * reads `at` first and arms a time-interval trigger of now → `at` that
 * repeats (LocalNotificationsPlugin.swift, the `at` branch returns before
 * `every` is read): a breakfast reminder set at 05:00 for 08:00 fired every
 * three hours until the app was next opened, and one set under a minute
 * ahead threw.
 *
 * A calendar trigger fires at the next matching time and cannot skip one.
 * When the caller has deferred the first fire past the next one (today's
 * meal is already logged, so the reminder starts tomorrow), the reminder is
 * sent once, at that time: the hooks schedule again on their next pass and
 * the series resumes then.
 */
export function nativeSchedule(
  payload: Pick<NotificationPayload, "scheduleAt" | "repeats" | "repeatEvery">,
  now: Date = new Date()
): NativeSchedule | undefined {
  const at = payload.scheduleAt;
  if (!at) return undefined;
  if (!payload.repeats) return { at };
  const every = payload.repeatEvery ?? "day";
  const natural = nextNaturalOccurrence(at, every, now);
  const sameMinute =
    Math.floor(natural.getTime() / 60_000) ===
    Math.floor(at.getTime() / 60_000);
  if (!sameMinute) return { at };
  return {
    on: {
      hour: at.getHours(),
      minute: at.getMinutes(),
      ...(every === "week" ? { weekday: at.getDay() + 1 } : {}),
    },
  };
}

/** When a pending native reminder will next fire: its `at` (a Date, or the
 *  ISO string iOS returns it as), or the next time its calendar trigger
 *  matches. */
export function nextFireOf(
  schedule: unknown,
  now: Date = new Date()
): Date | null {
  if (!schedule || typeof schedule !== "object") return null;
  const { at, on } = schedule as { at?: unknown; on?: unknown };
  if (at instanceof Date) return Number.isNaN(at.getTime()) ? null : at;
  if (typeof at === "string") {
    const parsed = new Date(at);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (!on || typeof on !== "object") return null;
  const { hour, minute, weekday } = on as Record<string, unknown>;
  if (typeof hour !== "number" || typeof minute !== "number") return null;
  const template = new Date(now);
  template.setHours(hour, minute, 0, 0);
  if (typeof weekday === "number") {
    const offset = (weekday - 1 - template.getDay() + 7) % 7;
    template.setDate(template.getDate() + offset);
    return nextNaturalOccurrence(template, "week", now);
  }
  return nextNaturalOccurrence(template, "day", now);
}

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

export type NotificationPermissionState =
  | "granted"
  | "denied"
  | "default"
  | "unsupported";

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
export async function scheduleNotification(
  payload: NotificationPayload
): Promise<boolean> {
  const granted = await hasNotificationPermission();
  if (!granted) return false;

  try {
    if (isNative) {
      const schedule = nativeSchedule(payload);
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
      const previous = webTimers.get(payload.id);
      if (previous !== undefined) clearTimeout(previous);
      webTimers.delete(payload.id);
      if (payload.scheduleAt) {
        const delay = payload.scheduleAt.getTime() - Date.now();
        if (delay <= 0) {
          new Notification(payload.title, { body: payload.body });
        } else {
          // Web fallback: setTimeout only fires if the app stays open.
          // Accepted limitation — web is not the primary delivery target.
          const timer = setTimeout(() => {
            webTimers.delete(payload.id);
            try {
              new Notification(payload.title, { body: payload.body });
            } catch (err) {
              logger.error("web notification fire failed", err);
            }
          }, delay);
          webTimers.set(payload.id, timer);
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
 * Web and native both cancel the exact scheduled ID.
 */
export async function cancelNotification(id: number): Promise<void> {
  const timer = webTimers.get(id);
  if (timer !== undefined) clearTimeout(timer);
  webTimers.delete(id);
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
  for (const timer of webTimers.values()) clearTimeout(timer);
  webTimers.clear();
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

export async function getPendingNotifications(): Promise<
  PendingNotification[]
> {
  if (!isNative) return [];
  try {
    const result = await LocalNotifications.getPending();
    return result.notifications.map((n) => ({
      id: n.id,
      title: n.title ?? null,
      body: n.body ?? null,
      // iOS returns `at` as an ISO string, not the Date it was sent as,
      // and a repeating reminder has no `at` at all, only its calendar
      // trigger: read either.
      scheduleAt: nextFireOf(n.schedule)?.toISOString() ?? null,
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

const TEST_NOTIFICATION_COPY: Record<
  TestNotificationKind,
  { title: string; body: string }
> = {
  generic: {
    title: "Tropos test notification",
    body: "If you can read this, notifications are working.",
  },
  meal: {
    title: "Meal reminder test",
    body: "This is what your meal reminders look like.",
  },
  workout: {
    title: "Workout reminder test",
    body: "This is what your workout reminders look like.",
  },
  streak: {
    title: "Streak reminder test",
    body: "This is what your streak reminders look like.",
  },
};

export async function sendTestNotification(
  kind: TestNotificationKind = "generic"
): Promise<boolean> {
  const copy = TEST_NOTIFICATION_COPY[kind];
  return scheduleNotification({
    id: TEST_NOTIFICATION_IDS[kind],
    title: copy.title,
    body: copy.body,
    scheduleAt: new Date(Date.now() + 3000),
  });
}
