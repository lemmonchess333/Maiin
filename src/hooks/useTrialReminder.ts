import { useEffect, useRef } from "react";
import { useAuth, type SubscriptionTrial } from "@/lib/auth";
import { useSubscription } from "@/lib/subscription";
import { scheduleNotification, cancelNotification } from "@/lib/notifications";
import { trialPhoneReminder } from "@/lib/subscriptionTrial";
import { logger } from "@/lib/logger";

/**
 * Trial-ending reminder — one local notification before a trial ends.
 *
 * Two trials, one notification id:
 *
 *  - The store trial a purchase is in (`subscriptionTrial`, Sub1 STATUS
 *    2026-10-06), which becomes a paid subscription unless it is
 *    cancelled. Its notification goes at the instant the server chose for
 *    the reminder email (`reminderAt`), so the two agree; the words come
 *    from `trialPhoneReminder`. The email is the reminder of record; this
 *    is the extra for people who allow notifications.
 *  - The legacy onboarding free week, below, which ends without a charge.
 *
 * The 7-day Pro trial granted at onboarding (`trialExpiresAt`) ends
 * quietly: the Home strip counts it down and the trial-ended prompt
 * appears afterwards, but nothing reaches a user who has not opened the
 * app that week. A reminder before the end is what lets someone decide
 * while the features are still on, rather than discover the lapse at
 * the camera. Cal AI and Runna both promise one on the paywall.
 *
 * Which trial: the app-granted one — and, since the onboarding grant
 * was removed (Sub1a pin 3 as written), a LEGACY one: this fires only
 * for profiles that still carry a live `trialExpiresAt` from before.
 * The store trial above takes the id when both are somehow present.
 *
 * Fires at 10:00 local on the calendar day two days before the expiry's
 * local day. Local methods throughout — the expiry is a UTC instant, and
 * the day it lands on is the user's, not the server's.
 *
 * Mirrors the streak reminder: cancel-then-schedule on every evaluation
 * (same-id replacement is not reliable on every platform), one stable
 * id, silent no-op without notification permission. There is no toggle:
 * it is a one-shot about the account's own state, not a recurring nudge.
 */
export const TRIAL_NOTIFICATION_ID = 3003;
export const TRIAL_REMINDER_DAYS_BEFORE = 2;
export const TRIAL_REMINDER_HOUR = 10;

export const TRIAL_REMINDER_TITLE = "Your Pro trial ends in 2 days";
export const TRIAL_REMINDER_BODY =
  "Photo logging pauses and your calorie target stops adapting after that. Nothing is charged unless you subscribe.";

/**
 * When the reminder fires, or null when there is nothing to remind
 * about: no live trial, a paid tier, an unreadable expiry, or a fire
 * time already behind us (the Home strip carries the last two days).
 */
export function trialReminderFireAt(input: {
  isInTrial: boolean;
  trialExpiresAt: string | null | undefined;
  now: Date;
}): Date | null {
  if (!input.isInTrial || !input.trialExpiresAt) return null;
  const expires = new Date(input.trialExpiresAt);
  if (Number.isNaN(expires.getTime())) return null;
  const fireAt = new Date(expires.getTime());
  fireAt.setDate(fireAt.getDate() - TRIAL_REMINDER_DAYS_BEFORE);
  fireAt.setHours(TRIAL_REMINDER_HOUR, 0, 0, 0);
  if (fireAt.getTime() <= input.now.getTime()) return null;
  return fireAt;
}

/** Runs once at the authenticated root (RemindersProvider). Returns nothing. */
export function useTrialReminderInternal(): void {
  const { profile, loading } = useAuth();
  const { isInTrial } = useSubscription();
  const trialExpiresAt = profile?.trialExpiresAt ?? null;
  // The record as a string: a fresh profile object with the same trial
  // must not reschedule, and a changed one (a cancel) must.
  const storeTrial = JSON.stringify(profile?.subscriptionTrial ?? null);
  const chain = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    const reconcile = async () => {
      await cancelNotification(TRIAL_NOTIFICATION_ID).catch((err) => {
        logger.warn("[TrialReminder] cancel failed", err);
      });
      if (cancelled) return;
      const now = new Date();
      const billed = trialPhoneReminder(
        JSON.parse(storeTrial) as SubscriptionTrial | null,
        now
      );
      if (billed) {
        await scheduleNotification({
          id: TRIAL_NOTIFICATION_ID,
          title: billed.title,
          body: billed.body,
          scheduleAt: billed.fireAt,
        });
        return;
      }
      const fireAt = trialReminderFireAt({ isInTrial, trialExpiresAt, now });
      if (!fireAt) return;
      await scheduleNotification({
        id: TRIAL_NOTIFICATION_ID,
        title: TRIAL_REMINDER_TITLE,
        body: TRIAL_REMINDER_BODY,
        scheduleAt: fireAt,
      });
    };
    chain.current = chain.current.then(reconcile, reconcile);
    return () => {
      cancelled = true;
    };
  }, [loading, isInTrial, trialExpiresAt, storeTrial]);
}
