/**
 * Notifications test harness — the ergonomics layer over
 * `notificationsFake`, mirroring `firestoreHarness`.
 *
 * Usage in a hook test:
 *
 *   vi.mock("@/lib/notifications");           // ← bare; resolves to __mocks__
 *
 *   import {
 *     resetNotifications, scheduledIds, scheduledAt,
 *   } from "@/test/notificationsHarness";
 *
 *   beforeEach(() => resetNotifications());
 *   expect(scheduledIds()).toEqual([1001, 1003]);   // lunch disabled
 *
 * Assert on the resulting SCHEDULE, not on call counts. "cancel was
 * called with 1002" and "no lunch reminder is scheduled" are different
 * claims, and only the second one is what the user experiences.
 */
import { notificationsFake } from "./notificationsFake";
import type {
  NotificationPayload,
  NotificationPermissionState,
} from "@/lib/notifications";

/** Clear the schedule and restore granted permission. Call in `beforeEach`. */
export function resetNotifications(): void {
  notificationsFake.reset();
}

/** Ids currently scheduled, ascending — the cheapest whole-state assertion. */
export function scheduledIds(): number[] {
  return notificationsFake.ids();
}

/** Every scheduled payload, ordered by id. */
export function scheduled(): NotificationPayload[] {
  return notificationsFake.all();
}

/** The payload scheduled under `id`, or undefined if nothing is. */
export function scheduledAt(id: number): NotificationPayload | undefined {
  return notificationsFake.at(id);
}

/**
 * Set the permission state the fake reports. "denied" makes
 * `scheduleNotification` return false WITHOUT throwing — the real
 * module's behaviour, and the reason a hook that ignores the return
 * value looks identical to one that handles it unless you inspect the
 * schedule.
 */
export function setNotificationPermission(
  state: NotificationPermissionState
): void {
  notificationsFake.setPermission(state);
}

/** Fail the next schedule attempt — for one id, or all of them. */
export function failNextSchedule(id?: number): void {
  notificationsFake.failNextSchedule(id);
}
