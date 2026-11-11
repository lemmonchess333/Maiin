import type { ReminderActivity } from "./useReminderActivity";
import { useEffect, useRef } from "react";
import { useReminderPreferences } from "./useReminderPreferences";
import { useAuth } from "@/lib/auth";
import {
  scheduleNotification,
  cancelNotification,
  requestNotificationPermission,
} from "@/lib/notifications";
import { isReminderLocallyOff } from "@/lib/localReminderChoice";
import {
  isReminderDay,
  reminderAtOn,
  WORKOUT_REMINDER_IDS,
  workoutReminderCopy,
} from "@/lib/workoutReminderCopy";

export interface WorkoutReminders {
  enabled: boolean;
  time: string;
}

export const DEFAULT_WORKOUT_REMINDERS: WorkoutReminders = {
  enabled: false,
  time: "07:00",
};

/**
 * One stable id per weekday (`WORKOUT_REMINDER_IDS`) so the reminder fires
 * weekly on each non-rest day independently. Pre-PR-M this was a single
 * id scheduled once for the next workout day, which fired exactly once
 * and then silently stopped (no repeat semantics on a `schedule.at`
 * payload). The per-weekday fanout lets each day re-arm weekly via
 * `repeatEvery: 'week'`.
 */
const WORKOUT_NOTIFICATION_IDS = WORKOUT_REMINDER_IDS;

/**
 * Heavy-lifting internal hook — run once per authenticated session by
 * <RemindersProvider>. Public callers use `useWorkoutReminders` from
 * RemindersProvider.tsx which reads this hook's output from context.
 *
 * `liftName` is the programme's next workout as Home names it
 * (`useNextLiftName`): a lift day's reminder says it ("Upper A today"),
 * and a new name runs the pass again (`workoutReminderCopy`).
 */
export function useWorkoutRemindersInternal(
  activity?: ReminderActivity,
  liftName?: string | null
) {
  const { user, profile } = useAuth();
  const uid = user?.uid ?? null;
  const { reminders, loading, failed, saving, retry, updateReminders } =
    useReminderPreferences(uid, "workout", DEFAULT_WORKOUT_REMINDERS);

  /**
   * Serialises reschedule passes for this hook instance.
   *
   * Every pass is cancel-all-seven then schedule-what-applies, so the
   * LAST pass to run holds the truth — but only if passes cannot
   * interleave. Unserialised, a stale pass suspended on an await resumes
   * after a newer pass has already run its cancels and writes, and then
   * writes over it: the user toggles reminders off, or edits a day to
   * rest, and the old intent wins.
   *
   * Chaining is the whole fix. It also makes each pass's leading
   * cancel-all the reliable cleanup it was always meant to be, because a
   * newer pass now provably starts after the older one has finished.
   *
   * The first attempt at this (#1911) instead had a stale pass CANCEL the
   * notification it had just written. That fixed the leak and introduced
   * a worse race: the cancel could land on an id the newer pass had
   * already legitimately rescheduled, deleting a live reminder. CI caught
   * it — the control test lost exactly one id out of five.
   */
  const passChain = useRef<Promise<void>>(Promise.resolve());

  // Schedule / reschedule reminders. One weekly-repeating notification
  // per non-rest weekday so the user gets honest reminders that respect
  // their training schedule and keep firing without the app needing
  // to be open.
  useEffect(() => {
    // Unknown settings/activity are not an instruction to cancel an
    // already scheduled reminder. Explicit off still cancels immediately.
    if (!uid || ((loading || failed) && !isReminderLocallyOff(uid, "workout")))
      return;
    if (reminders.enabled && activity && !activity.ready) return;
    let cancelled = false;

    const rescheduleWorkout = async () => {
      // Cancel ALL 7 weekday IDs every pass — handles schedule edits
      // (a day flipping from lift to rest) and the disable toggle.
      for (const id of WORKOUT_NOTIFICATION_IDS) {
        if (cancelled) return;
        await cancelNotification(id);
      }

      if (
        cancelled ||
        !reminders.enabled ||
        loading ||
        (activity && !activity.ready)
      )
        return;

      const schedule = profile?.weekSchedule as
        ReadonlyArray<{ day: number; type: string }> | undefined;

      // Schedule one weekly-repeating notification per workout day.
      // Day index follows the existing `weekSchedule` convention
      // (0=Sunday … 6=Saturday). Each gets a stable ID 2001+day so
      // toggling a day off cleanly cancels just that day.
      for (let day = 0; day < 7; day++) {
        // Checked every iteration. Not redundant: with the chain in
        // place this pass can be superseded at ANY of its await points,
        // and stopping early is what keeps a stale intent from writing
        // the remaining days. It cannot un-write the call already in
        // flight — nothing can — but the next pass's cancel-all clears
        // that one, which is exactly why the chain has to exist.
        if (cancelled) return;
        if (!isReminderDay(day, schedule)) continue;
        // The completed day no longer needs a reminder: the next week's.
        const at = reminderAtOn(
          reminders.time,
          day,
          activity?.workout ? activity.dateKey : null
        );
        if (!at) continue;
        await scheduleNotification({
          id: WORKOUT_NOTIFICATION_IDS[day],
          ...workoutReminderCopy(day, schedule, liftName),
          scheduleAt: at,
          // Weekly repeat anchored on this weekday — the OS re-arms
          // it for the same weekday + time every week, so the user
          // doesn't have to open the app to keep them queued.
          repeats: true,
          repeatEvery: "week",
        });
      }
    };

    // A rejected pass must not break the chain for every later one.
    passChain.current = passChain.current.then(
      rescheduleWorkout,
      rescheduleWorkout
    );

    return () => {
      cancelled = true;
    };
  }, [uid, reminders, profile, loading, failed, activity, liftName]);

  // Permission request is a stable module-level function — no wrapper needed.
  return {
    reminders,
    loading,
    failed,
    saving,
    retry,
    updateReminders,
    requestPermission: requestNotificationPermission,
    /** The programme's next workout, as the reminders name it. */
    liftName: liftName ?? null,
    /** The day a session was saved, today's or null: its reminder is not
     *  sent, so a preview must not name it (`reminderAtOn`). */
    doneDay: activity?.workout ? activity.dateKey : null,
  };
}
