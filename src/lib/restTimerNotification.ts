/**
 * Rest-timer end notification — the lock-screen half of the in-lift rest
 * timer (Tier 2 item 6).
 *
 * The in-app ring, chime and haptic only exist while the WebView is
 * running. iOS suspends JS the moment the screen locks or the app
 * backgrounds — which is exactly what lifters do between sets — so
 * without this, rest-end passes silently and the timer stalls until
 * foreground. Hevy/Strong both solve it the same way: a local
 * notification scheduled for rest-end.
 *
 * Scheduling model: **the notification exists only while the app is
 * hidden.** WorkoutSession schedules it on `visibilitychange → hidden`
 * (with the remaining rest computed from the wall-clock anchor) and
 * cancels it on return to foreground. That split keeps the two alert
 * channels from double-firing: foregrounded users get the in-app
 * chime + haptic, backgrounded users get the OS banner, and nobody
 * gets both.
 *
 * Permission is CHECKED, never requested, here: prompting for OS
 * notification permission mid-set would be hostile. Users grant it via
 * the Settings → Notifications priming flow; until then the lock-screen
 * alert silently doesn't happen — the same degradation web gets.
 *
 * Web: the browser Notification path in `scheduleNotification` is
 * setTimeout-backed and only fires while the tab lives, which is the
 * situation where the in-app chime already covers the user. So this
 * module is native-only by design; the web-visible path for the feature
 * is the ring + chime that already ship.
 */
import { isNativePlatform } from "@/lib/platform";
import {
  scheduleNotification,
  cancelNotification,
  hasNotificationPermission,
} from "@/lib/notifications";

/** 3000-range = event-driven notifications (see MEAL_NOTIFICATION_IDS'
 *  allocation comment in useMealReminders). One stable id — a new rest
 *  replaces any stale scheduled entry rather than stacking. */
export const REST_NOTIFICATION_ID = 3001;

/**
 * How many seconds from now the rest-end notification should fire, or
 * null when no notification is warranted. Pure — WorkoutSession's
 * visibility handler feeds it session state; the tests feed it edges.
 *
 * Null when: not resting, the target was already reached (the in-app
 * chime fired before the app hid — alerting again is a re-nag), or the
 * remaining time is under a second (the OS can't reliably deliver a
 * past-dated schedule; the user will see the finished ring on return).
 */
export function restNotificationDelaySeconds(args: {
  isResting: boolean;
  elapsedSeconds: number;
  targetSeconds: number;
  chimeFired: boolean;
}): number | null {
  const { isResting, elapsedSeconds, targetSeconds, chimeFired } = args;
  if (!isResting || chimeFired) return null;
  const remaining = targetSeconds - elapsedSeconds;
  if (remaining < 1) return null;
  return remaining;
}

/**
 * Schedule the rest-end notification `delaySeconds` from now. Returns
 * true when actually scheduled (native + permission granted).
 */
export async function scheduleRestEndNotification(
  delaySeconds: number,
  exerciseName?: string
): Promise<boolean> {
  if (!isNativePlatform()) return false;
  if (!(await hasNotificationPermission())) return false;
  return scheduleNotification({
    id: REST_NOTIFICATION_ID,
    title: "Rest over",
    body: exerciseName ? `Back to ${exerciseName}.` : "Time for your next set.",
    scheduleAt: new Date(Date.now() + delaySeconds * 1000),
  });
}

/** Cancel a pending rest-end notification. Safe to call when none exists. */
export async function cancelRestEndNotification(): Promise<void> {
  if (!isNativePlatform()) return;
  await cancelNotification(REST_NOTIFICATION_ID);
}
