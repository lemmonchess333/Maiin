import { useCallback, useEffect, useRef, useState } from "react";
import { doc, getDoc, runTransaction } from "firebase/firestore";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { auth, db } from "@/lib/firebase";
import { useUid } from "@/lib/auth";
import { useStreaks } from "@/features/streaks/useStreaks";
import {
  scheduleNotification,
  cancelNotification,
  requestNotificationPermission,
} from "@/lib/notifications";
import { logger } from "@/lib/logger";
import { captureError } from "@/lib/errorReporting";
import { readString, writeString } from "@/lib/localStore";
import { parseLocalDate } from "@/lib/dateHelpers";
import { format } from "date-fns";
import {
  STREAK_NOTIFICATION_ID,
  FIRST_WEEK_NOTIFICATION_ID,
} from "./streakNotificationId";
import {
  DEFAULT_STREAK_REMINDER_TIME,
  REMINDERS_SETTINGS_DOC,
  reminderDelivery,
  streakReminderChoice,
  streakReminderTime,
  type StreakReminderChoice,
} from "@/lib/reminderChoices";

/**
 * Optional evening reminder — fires in the evening if the user hasn't logged
 * today and their current streak is ≥ 2. One notification per user.
 *
 * One switch and one time (App1 Q26, `lib/reminderChoices.ts`), at
 * `users/{uid}/settings/reminders` (`streakEnabled`, `streakTime`), with the
 * old `settings/streakReminder` and push switches read until those are
 * written. The app picks the channel: when push carries the reminder the
 * server sends it (`hourlyStreakNudge`, at the same hour) and this hook
 * schedules nothing; otherwise it is scheduled here, on the phone:
 *   - via @capacitor/local-notifications on native; silent no-op on web
 *     when permission isn't granted.
 *   - always cancel before schedule, so platform quirks around replacing a
 *     same-id notification can't cause duplicates.
 *
 * Guard chain (all must pass to schedule):
 *   1. Prefs loaded, and whether push carries it is known.
 *   2. The reminder is on, and push does not carry it.
 *   3. `savableStreak >= 2` — no point nagging a brand-new user who
 *      doesn't have a streak yet. The streak a log today keeps, not the one
 *      shown: the morning after a rest day shows 0, and that is the evening
 *      the reminder is for.
 *   4. `hasLoggedToday` is false — cancel-on-activity in useStreaks also
 *      covers the mid-day case, but we re-check here on every eval to
 *      avoid scheduling a stale reminder right after a fresh log.
 */

/**
 * `settings/streakReminder` as stored. Its switch and time (with the
 * priming flag the switch needed) are the old fields, read by
 * `streakReminderChoice` and never written again. The first-week nudge's
 * marker still lives here: the local YYYY-MM-DD the once-ever first-week
 * (day-2) return nudge was scheduled to FIRE (D-1 fix). Presence = consumed
 * — the nudge never schedules again for this user. The dateKey (rather than
 * a boolean) lets cancel-on-log target exactly the pending fire day.
 */
interface StoredStreakReminder {
  enabled?: unknown;
  time?: unknown;
  primingShown?: unknown;
  firstWeekNudgeDateKey?: string | null;
}

type Stored = Record<string, unknown>;

/**
 * Given a "HH:MM" time string, return a Date for the next occurrence —
 * today if the time is still in the future and outside quiet hours.
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
  // A streak alarm is armed for this local day only. Never leave an alarm
  // that will keep speaking about a streak after the user stops returning.
  if (hours >= 22) return null;
  if (hours < 8) target.setHours(8, 0, 0, 0);
  return target.getTime() > now.getTime() ? target : null;
}

/**
 * Pure decision function extracted for unit testability. Given the current
 * state, decide whether we SHOULD schedule a reminder. Separate from the
 * effect that actually calls schedule/cancel so tests don't need to mock
 * out Capacitor.
 */
export function shouldScheduleStreakReminder(state: {
  loading: boolean;
  /** Push carries the reminder (the server sends it); null while unknown. */
  pushOwns?: boolean | null;
  /** The one switch (`streakReminderChoice`). */
  enabled: boolean;
  /** The streak a log today keeps (`useStreaks().savableStreak`). */
  savableStreak: number;
  hasLoggedToday: boolean;
}): boolean {
  if (state.loading || state.pushOwns === true || state.pushOwns === null)
    return false;
  if (!state.enabled) return false;
  if (!(state.savableStreak >= 2)) return false;
  if (state.hasLoggedToday) return false;
  return true;
}

/**
 * First-week (day-2) return nudge — pure decision (D-1,
 * docs/frontend-design-principles-2026-07.md). The daily streak reminder
 * above keeps its deliberate `>= 2` floor (the daily reminder starts at two days); this fills the day-1 → day-2 gap with ONE calm
 * one-shot local notification, scheduled on the user's FIRST log day to
 * fire the following evening, consumed forever once scheduled.
 *
 *   - "schedule": today is a log day (hasLoggedToday), the streak is
 *     exactly at its first day (< 2, and ≥ 1 so a log actually landed),
 *     the evening reminder is on, and the nudge has never been scheduled
 *     before → schedule the one-shot for tomorrow at the reminder's time
 *     and stamp `firstWeekNudgeDateKey`.
 *   - "cancel": the marker exists and either the reminder was disabled, or
 *     it's the fire day and the user already logged (they came back on
 *     their own — the nudge's job is done, don't fire it at them).
 *   - "none": everything else. Cancel is idempotent, so callers may act on
 *     repeated "cancel" results safely.
 */
export function firstWeekNudgeAction(state: {
  loading: boolean;
  /** The evening reminder's one switch (`streakReminderChoice`). */
  enabled: boolean;
  currentStreak: number;
  hasLoggedToday: boolean;
  firstWeekNudgeDateKey: string | null;
  todayKey: string;
  /**
   * The account-wide claim (`settings/pushState`), when this phone read it:
   * its fire date, and whether this phone made it. A claim this phone made
   * whose own marker never saved is armed again for its date; one made
   * elsewhere (another phone, the push sender) leaves nothing armed here.
   */
  sharedNudge?: { dateKey: string; mine: boolean } | null;
}): "schedule" | "rearm" | "cancel" | "none" {
  if (state.loading) return "none";
  // Off is off: whatever was armed, with or without a saved marker.
  if (!state.enabled) return "cancel";
  const shared = state.firstWeekNudgeDateKey ? null : state.sharedNudge;
  const marker =
    state.firstWeekNudgeDateKey ?? (shared?.mine ? shared.dateKey : null);
  if (marker) {
    if (marker === state.todayKey && state.hasLoggedToday) return "cancel";
    if (shared?.mine && marker >= state.todayKey) return "rearm";
    return "none";
  }
  if (shared) return "cancel";
  if (state.currentStreak < 1 || state.currentStreak >= 2) return "none";
  if (!state.hasLoggedToday) return "none";
  return "schedule";
}

/** This phone's mark on the first-week claim, kept on the device, so the
 *  phone that claimed can tell its claim from another's. */
function firstWeekDeviceId(uid: string): string {
  const key = `tropos:first-week-nudge-device:v1:${encodeURIComponent(uid)}`;
  const stored = readString(key);
  if (stored) return stored;
  const id = crypto.randomUUID();
  writeString(key, id);
  return id;
}

/** A claim that did not reach the server: offline, or it timed out. */
function isNetworkFailure(error: unknown): boolean {
  const code = String((error as { code?: unknown })?.code);
  return (
    !navigator.onLine ||
    code.endsWith("unavailable") ||
    code.endsWith("deadline-exceeded")
  );
}

const MARKER_ATTEMPTS = 3;

const FIRST_WEEK_NUDGE = {
  id: FIRST_WEEK_NOTIFICATION_ID,
  title: "A reminder for your next day",
  body: "A quick log today keeps it going.",
};

/**
 * When the first-week nudge fires: TOMORROW at the given "HH:MM", never the
 * same evening (the user already logged today; nudging them tonight would
 * be noise), held to 08:00–21:59 (from 22:00 it moves to 08:00 the day
 * after). Given its claimed fire date, that day's time, so a re-arm fires
 * when the first arming would have. Null on malformed input, mirroring
 * computeNextOccurrence.
 */
export function computeTomorrowOccurrence(
  timeHHMM: string,
  dateKey?: string
): Date | null {
  const match = /^(\d{2}):(\d{2})$/.exec(timeHHMM);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours > 23 || minutes > 59) return null;
  const target = dateKey ? parseLocalDate(dateKey) : new Date();
  if (!dateKey) target.setDate(target.getDate() + (hours >= 22 ? 2 : 1));
  if (hours < 8 || hours >= 22) target.setHours(8, 0, 0, 0);
  else target.setHours(hours, minutes, 0, 0);
  return target;
}

/**
 * Heavy-lifting internal hook — run once per authenticated session by
 * <RemindersProvider>. Public callers use `useStreakReminder` from
 * RemindersProvider.tsx which reads this hook's output from context.
 */
export function useStreakReminderInternal(
  /** `settings/push` as stored ({} for none), or null until it is read. */
  push: Stored | null = {},
  refreshKey = ""
) {
  const scheduleChain = useRef<Promise<void>>(Promise.resolve());
  const firstWeekChain = useRef<Promise<void>>(Promise.resolve());
  const uid = useUid();
  const {
    currentStreak,
    savableStreak,
    hasLoggedToday,
    loading: streaksLoading,
  } = useStreaks();
  // The two documents as read, for this account: the new fields and the
  // old one (whose marker the first-week nudge keeps).
  const [stored, setStored] = useState<{
    uid: string;
    reminders: Stored;
    old: StoredStreakReminder;
  } | null>(null);
  const loading = !!uid && stored?.uid !== uid;
  const reminders = stored?.uid === uid ? stored.reminders : null;
  const old = stored?.uid === uid ? stored.old : null;
  const prefs: StreakReminderChoice = streakReminderChoice({
    reminders,
    streakReminder: old,
    push,
  });
  // Push carries it (the server sends it), the phone does, or not known yet.
  const pushOwns =
    push === null ? null : reminderDelivery("streak", true, push) === "push";
  const firstWeekNudgeDateKey = old?.firstWeekNudgeDateKey ?? null;

  // ── Firestore load / persist ──────────────────────────────────────────

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    const settings = (name: string) =>
      getDoc(doc(db, "users", uid, "settings", name)).then(
        (snap) => (snap.exists() ? snap.data() : {}) as Stored
      );
    Promise.all([settings(REMINDERS_SETTINGS_DOC), settings("streakReminder")])
      .then(([reminders, old]) => {
        if (!cancelled) setStored({ uid, reminders, old });
      })
      .catch((err) => {
        logger.error("[StreakReminder] load failed", err);
        if (!cancelled) setStored({ uid, reminders: {}, old: {} });
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const save = useCallback(
    async (
      name: typeof REMINDERS_SETTINGS_DOC | "streakReminder",
      patch: Stored
    ) => {
      if (!uid) return;
      try {
        // Only the changed fields, so a pending first-week marker and a
        // switch changed on another device do not overwrite each other.
        await setDocGuarded(doc(db, "users", uid, "settings", name), patch, {
          merge: true,
        });
        if (auth.currentUser?.uid !== uid) return;
        // Onto the documents as they are now: a marker save started before
        // a switch changed must not put the old switch back.
        setStored((current) =>
          current?.uid === uid
            ? name === REMINDERS_SETTINGS_DOC
              ? { ...current, reminders: { ...current.reminders, ...patch } }
              : { ...current, old: { ...current.old, ...patch } }
            : current
        );
      } catch (err) {
        logger.error("[StreakReminder] save failed", err);
        captureError(
          err instanceof Error ? err : new Error(String(err)),
          "network",
          { surface: "streakReminder.save" }
        );
        throw err;
      }
    },
    [uid]
  );

  /** The one switch and the one time, written in the new shape only. */
  const updatePrefs = useCallback(
    async (updates: Partial<StreakReminderChoice>) => {
      const patch: Stored = {};
      if (updates.enabled !== undefined) patch.streakEnabled = updates.enabled;
      if (updates.time !== undefined)
        patch.streakTime =
          streakReminderTime(updates.time) ?? DEFAULT_STREAK_REMINDER_TIME;
      await save(REMINDERS_SETTINGS_DOC, patch);
    },
    [save]
  );

  // ── Reschedule on any relevant state change ───────────────────────────
  //
  // Re-evaluation triggers:
  //   - Mount.
  //   - prefs.enabled / prefs.time change, or whether push carries it.
  //   - currentStreak change.
  //   - hasLoggedToday change (user logs something → cancel;
  //     midnight rollover clears today's activity → re-schedule).
  //
  // Foreground events are NOT handled here directly. The hasLoggedToday
  // value comes from useStreaks, whose onSnapshot subscriptions reflect
  // activity changes in near-real-time while the app is open. The switch is
  // in Settings. The finish screen's one ask (`ReminderOffer`, Q66) turns
  // on the training-day reminder and push; once push is on it carries this
  // reminder, and the server sends it at the same time.

  useEffect(() => {
    if (!uid || loading || streaksLoading) return;

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
        pushOwns,
        enabled: prefs.enabled,
        savableStreak,
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
        title: "An evening reminder",
        body: "Still time to log today if you want to keep the run going.",
        scheduleAt: fireAt,
      });
    };

    scheduleChain.current = scheduleChain.current.then(reschedule, reschedule);

    return () => {
      cancelled = true;
    };
  }, [
    uid,
    pushOwns,
    refreshKey,
    loading,
    streaksLoading,
    prefs.enabled,
    prefs.time,
    savableStreak,
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
  //
  // Once the account-wide claim commits, the server sends nothing, so the
  // armed notification is the only nudge there will be: it is never
  // cancelled for a later change of state or a failed marker write. The
  // marker write is retried, and a phone that lost it reads its own claim
  // back and arms again for the claimed date. A claim that could not reach
  // the server leaves the notification armed and is tried again on the next
  // pass.

  useEffect(() => {
    if (!uid || loading || streaksLoading) return;
    let cancelled = false;
    const sharedRef = doc(db, "users", uid, "settings", "pushState");
    const saveMarker = async (dateKey: string) => {
      for (let attempt = 1; attempt <= MARKER_ATTEMPTS; attempt++) {
        try {
          await save("streakReminder", { firstWeekNudgeDateKey: dateKey });
          return;
        } catch {
          // Retried here, then by the next pass from the shared claim.
        }
      }
    };
    const reconcile = async () => {
      if (cancelled) return;
      // Not known yet: a new day's activity key reads the push consent
      // again. The nudge is one-shot, and a claimed one is never armed
      // again, so wait for the answer rather than cancel it.
      if (pushOwns === null) return;
      if (pushOwns) {
        await cancelNotification(FIRST_WEEK_NOTIFICATION_ID);
        return;
      }
      const deviceId = firstWeekDeviceId(uid);
      let sharedNudge: { dateKey: string; mine: boolean } | null = null;
      if (!firstWeekNudgeDateKey && prefs.enabled) {
        try {
          const shared = (await getDoc(sharedRef)).data();
          if (typeof shared?.firstWeekNudgeDateKey === "string")
            sharedNudge = {
              dateKey: shared.firstWeekNudgeDateKey,
              mine: shared.firstWeekNudgeDevice === deviceId,
            };
        } catch {
          // Unread, the claim transaction below still checks it.
        }
        if (cancelled) return;
      }
      const action = firstWeekNudgeAction({
        loading: false,
        enabled: prefs.enabled,
        currentStreak,
        hasLoggedToday,
        firstWeekNudgeDateKey,
        todayKey: format(new Date(), "yyyy-MM-dd"),
        sharedNudge,
      });
      if (action === "cancel") {
        await cancelNotification(FIRST_WEEK_NOTIFICATION_ID);
        return;
      }
      if (action === "rearm" && sharedNudge) {
        const fireAt = computeTomorrowOccurrence(
          prefs.time,
          sharedNudge.dateKey
        );
        if (fireAt && fireAt.getTime() > Date.now()) {
          await cancelNotification(FIRST_WEEK_NOTIFICATION_ID);
          await scheduleNotification({
            ...FIRST_WEEK_NUDGE,
            scheduleAt: fireAt,
          });
        }
        await saveMarker(sharedNudge.dateKey);
        return;
      }
      if (action !== "schedule") return;
      const fireAt = computeTomorrowOccurrence(prefs.time);
      if (!fireAt) return;
      await cancelNotification(FIRST_WEEK_NOTIFICATION_ID);
      if (cancelled) return;
      const scheduled = await scheduleNotification({
        ...FIRST_WEEK_NUDGE,
        scheduleAt: fireAt,
      });
      if (!scheduled) return;
      if (cancelled) {
        // Nothing is claimed yet: the pass that follows decides again.
        await cancelNotification(FIRST_WEEK_NOTIFICATION_ID);
        return;
      }
      const fireKey = format(fireAt, "yyyy-MM-dd");
      let claimed: boolean;
      try {
        // Push and local use one account-wide once-ever marker. Claim it
        // after arming the device, and cancel if another device or the push
        // sender already claimed it. A transaction also keeps two local
        // devices from each arming a first-week nudge. This phone's own
        // earlier claim for the same date counts as its claim.
        claimed = await runTransaction(db, async (transaction) => {
          const shared = (await transaction.get(sharedRef)).data();
          if (shared?.firstWeekNudgeDateKey)
            return (
              shared.firstWeekNudgeDateKey === fireKey &&
              shared.firstWeekNudgeDevice === deviceId
            );
          transaction.set(
            sharedRef,
            { firstWeekNudgeDateKey: fireKey, firstWeekNudgeDevice: deviceId },
            { merge: true }
          );
          return true;
        });
      } catch (error) {
        // Offline, the nudge stays armed and the next pass claims it. Any
        // other refusal leaves nothing armed for a later pass to duplicate.
        if (!isNetworkFailure(error))
          await cancelNotification(FIRST_WEEK_NOTIFICATION_ID);
        return;
      }
      if (!claimed) {
        await cancelNotification(FIRST_WEEK_NOTIFICATION_ID);
        return;
      }
      await saveMarker(fireKey);
    };
    firstWeekChain.current = firstWeekChain.current.then(reconcile, reconcile);
    return () => {
      cancelled = true;
    };
  }, [
    uid,
    loading,
    streaksLoading,
    pushOwns,
    refreshKey,
    prefs.enabled,
    prefs.time,
    firstWeekNudgeDateKey,
    currentStreak,
    hasLoggedToday,
    save,
  ]);

  return {
    prefs,
    loading,
    updatePrefs,
    /** How it goes now: off, on the phone, or by push; null until known. */
    delivery:
      push === null ? null : reminderDelivery("streak", prefs.enabled, push),
    // Stable module-level function — no useCallback wrapper needed.
    requestPermission: requestNotificationPermission,
    // Exposed so the priming modal trigger can read the same values without
    // re-subscribing to Firestore.
    currentStreak,
    hasLoggedToday,
  };
}
