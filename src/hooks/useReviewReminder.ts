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

export interface ReviewReminderPrefs {
  enabled: boolean;
}

/** On for everyone (Mob2 call 10): it reaches only someone who has
 *  allowed notifications, since scheduling asks the permission first. */
const DEFAULT_PREFS: ReviewReminderPrefs = { enabled: true };

/**
 * The Monday review notification (`lib/reviewReminder.ts` has the rules),
 * run once a session by <RemindersProvider>, like the other reminders:
 * its switch at `users/{uid}/settings/reviewReminder`, and a
 * cancel-then-maybe-schedule pass whenever the answer could have moved.
 *
 * A pass runs on mount, when the switch or the push that owns the recap
 * changes, when the app comes back to the front or the day turns
 * (`refreshKey`), and when today's logging changes (`activityKey`), since
 * a first log is what makes a new account's first review.
 */
export function useReviewReminderInternal(
  pushOwns: boolean | null,
  refreshKey: string,
  activityKey: string
) {
  const uid = useUid();
  const storageUid = useUidForStorageKey();
  const [prefs, setPrefs] = useState<ReviewReminderPrefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState<string | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    getDoc(doc(db, "users", uid, "settings", "reviewReminder"))
      .then((snap) => {
        if (cancelled) return;
        setPrefs({
          ...DEFAULT_PREFS,
          ...(snap.exists()
            ? (snap.data() as Partial<ReviewReminderPrefs>)
            : {}),
        });
        setLoaded(uid);
      })
      .catch((err) => {
        if (cancelled) return;
        logger.error("[ReviewReminder] load failed", err);
        setLoaded(uid);
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const updatePrefs = useCallback(
    async (updates: Partial<ReviewReminderPrefs>) => {
      if (!uid) return;
      const next = { ...prefs, ...updates };
      setPrefs(next);
      try {
        await setDocGuarded(
          doc(db, "users", uid, "settings", "reviewReminder"),
          next
        );
      } catch (err) {
        logger.error("[ReviewReminder] save failed", err);
        captureError(
          err instanceof Error ? err : new Error(String(err)),
          "network",
          { surface: "reviewReminder.save" }
        );
      }
    },
    [uid, prefs]
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

  return { prefs, loading: !ready, updatePrefs };
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
