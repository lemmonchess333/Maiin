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
      await LocalNotifications.schedule({
        notifications: [
          {
            id: payload.id,
            title: payload.title,
            body: payload.body,
            schedule: payload.scheduleAt ? { at: payload.scheduleAt } : undefined,
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
