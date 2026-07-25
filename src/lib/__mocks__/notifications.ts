/**
 * Automock for `@/lib/notifications`, backed by the in-memory scheduler.
 *
 * Lives next to the module it replaces so a bare `vi.mock("@/lib/
 * notifications")` picks it up — the same shape as `__mocks__/firebase/
 * firestore.ts`, and for the same reason: the seam is the MODULE
 * boundary, so every consumer gets the fake without threading a handle
 * through the hook signature (ADR-0009).
 *
 * The real module branches on `Capacitor.isNativePlatform()` and talks to
 * either LocalNotifications or the browser Notification API. Neither
 * exists under jsdom, which is what the `@untested:` markers on the
 * reminder hooks were blocked on.
 */
import { notificationsFake } from "@/test/notificationsFake";
import type { NotificationPayload } from "@/lib/notifications";

export type {
  NotificationPayload,
  NotificationPermissionState,
  PendingNotification,
  TestNotificationKind,
} from "@/lib/notifications";

export async function requestNotificationPermission(): Promise<boolean> {
  return notificationsFake.requestPermission();
}

export async function hasNotificationPermission(): Promise<boolean> {
  return notificationsFake.hasPermission();
}

export async function getNotificationPermissionState() {
  return notificationsFake.permissionState();
}

export async function scheduleNotification(
  payload: NotificationPayload
): Promise<boolean> {
  return notificationsFake.schedule_(payload);
}

export async function cancelNotification(id: number): Promise<void> {
  return notificationsFake.cancel(id);
}

export async function cancelAllNotifications(): Promise<void> {
  return notificationsFake.cancelAll();
}

export async function getPendingNotifications() {
  return notificationsFake.pending();
}

export async function sendTestNotification(): Promise<boolean> {
  return notificationsFake.schedule_({
    id: 9999,
    title: "Test",
    body: "Test",
  });
}
