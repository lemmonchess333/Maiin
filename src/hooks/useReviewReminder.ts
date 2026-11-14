import { useCallback, useEffect, useRef, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { db } from "@/lib/firebase";
import { useUid, useUidForStorageKey } from "@/lib/auth";
import { cancelNotification, scheduleNotification } from "@/lib/notifications";
import { readString } from "@/lib/localStore";
import { logger } from "@/lib/logger";
import { captureError } from "@/lib/errorReporting";
import {
  REVIEW_NOTIFICATION,
  REVIEW_NOTIFICATION_ID,
  REVIEW_ROUTE,
  nextReviewReminderAt,
  reviewWeekFor,
  shouldScheduleReviewReminder,
} from "@/lib/reviewReminder";
import {
  probeReviewEligibility,
  reviewViewedKey,
} from "@/lib/reviewEligibility";
import {
  REMINDERS_SETTINGS_DOC,
  reminderDelivery,
  reviewReminderChoice,
  type ReviewReminderChoice,
} from "@/lib/reminderChoices";

type Stored = Record<string, unknown>;

/**
 * The Monday review notification (`lib/reviewReminder.ts` has the rules),
 * run once a session by <RemindersProvider>, like the other reminders.
 *
 * One switch (App1 Q26, `lib/reminderChoices.ts`), at
 * `users/{uid}/settings/reminders` (`reviewEnabled`), with the old
 * `settings/reviewReminder` and the recap push's switch read until it is
 * written. On unless turned off (Mob2 call 10); it reaches only someone who
 * has allowed notifications, since scheduling asks the permission first.
 * When push carries it, the server's Monday recap is this reminder, at the
 * same 09:00, and nothing is scheduled here; otherwise a
 * cancel-then-maybe-schedule pass runs whenever the answer could have moved.
 *
 * A pass runs on mount, when the switch or whether push carries it
 * changes, when the app comes back to the front or the day turns
 * (`refreshKey`), and when today's logging changes (`activityKey`), since
 * a first log is what makes a new account's first review.
 */
export function useReviewReminderInternal(
  /** `settings/push` as stored ({} for none), or null until it is read. */
  push: Stored | null,
  refreshKey: string,
  activityKey: string
) {
  const uid = useUid();
  const storageUid = useUidForStorageKey();
  const [stored, setStored] = useState<{
    uid: string;
    reminders: Stored;
    old: Stored;
  } | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const loaded = stored?.uid ?? null;
  const prefs: ReviewReminderChoice = reviewReminderChoice({
    reminders: stored?.uid === uid ? stored.reminders : null,
    reviewReminder: stored?.uid === uid ? stored.old : null,
    push,
  });
  // Push carries it (the server's recap is this reminder), or not known yet.
  const pushOwns =
    push === null ? null : reminderDelivery("review", true, push) === "push";

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    const settings = (name: string) =>
      getDoc(doc(db, "users", uid, "settings", name)).then(
        (snap) => (snap.exists() ? snap.data() : {}) as Stored
      );
    Promise.all([settings(REMINDERS_SETTINGS_DOC), settings("reviewReminder")])
      .then(([reminders, old]) => {
        if (!cancelled) setStored({ uid, reminders, old });
      })
      .catch((err) => {
        if (cancelled) return;
        logger.error("[ReviewReminder] load failed", err);
        setStored({ uid, reminders: {}, old: {} });
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  /** The one switch, written in the new shape only. */
  const updatePrefs = useCallback(
    async (updates: Partial<ReviewReminderChoice>) => {
      if (!uid || updates.enabled === undefined) return;
      const patch = { reviewEnabled: updates.enabled };
      try {
        await setDocGuarded(
          doc(db, "users", uid, "settings", REMINDERS_SETTINGS_DOC),
          patch,
          { merge: true }
        );
        setStored((current) =>
          current?.uid === uid
            ? { ...current, reminders: { ...current.reminders, ...patch } }
            : current
        );
      } catch (err) {
        logger.error("[ReviewReminder] save failed", err);
        captureError(
          err instanceof Error ? err : new Error(String(err)),
          "network",
          { surface: "reviewReminder.save" }
        );
        throw err;
      }
    },
    [uid]
  );

  const ready = !!uid && loaded === uid;
  useEffect(() => {
    if (!ready || !uid) return;
    let cancelled = false;
    const reschedule = async () => {
      await cancelNotification(REVIEW_NOTIFICATION_ID).catch((err) => {
        logger.warn("[ReviewReminder] cancel failed", err);
      });
      if (cancelled || !prefs.enabled || pushOwns !== false) return;
      const fireAt = nextReviewReminderAt(new Date());
      const week = reviewWeekFor(fireAt);
      const viewed =
        readString(`${storageUid}:${reviewViewedKey(week)}`) === "1";
      if (viewed) return;
      let waiting = false;
      try {
        waiting = (await probeReviewEligibility(uid, week)) === "eligible";
      } catch (err) {
        logger.warn("[ReviewReminder] eligibility read failed", err);
      }
      if (cancelled) return;
      if (
        !shouldScheduleReviewReminder({
          enabled: prefs.enabled,
          pushOwns,
          waiting,
          viewed,
        })
      )
        return;
      await scheduleNotification({
        id: REVIEW_NOTIFICATION_ID,
        ...REVIEW_NOTIFICATION,
        scheduleAt: fireAt,
        route: REVIEW_ROUTE,
      });
    };
    chain.current = chain.current.then(reschedule, reschedule);
    return () => {
      cancelled = true;
    };
  }, [
    ready,
    uid,
    storageUid,
    prefs.enabled,
    pushOwns,
    refreshKey,
    activityKey,
  ]);

  return {
    prefs,
    loading: !ready,
    updatePrefs,
    /** How it goes now: off, on the phone, or by push; null until known. */
    delivery:
      push === null ? null : reminderDelivery("review", prefs.enabled, push),
  };
}

/**
 * Called by the review page once the review has been read: the
 * notification for that week has nothing left to say. A notification for
 * a later week (read the review on a Tuesday, and next Monday's is about
 * this week) is left alone.
 */
export async function retireReviewReminder(
  weekKey: string,
  now: Date = new Date()
): Promise<void> {
  if (reviewWeekFor(nextReviewReminderAt(now)) !== weekKey) return;
  await cancelNotification(REVIEW_NOTIFICATION_ID);
}
