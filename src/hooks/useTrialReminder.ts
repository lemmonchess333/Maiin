import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/subscription";
import { scheduleNotification, cancelNotification } from "@/lib/notifications";
import { logger } from "@/lib/logger";

/**
 * Trial-ending reminder — one local notification, two days before the
 * onboarding trial lapses.
 *
 * The 7-day Pro trial granted at onboarding (`trialExpiresAt`) ends
 * quietly: the Home strip counts it down and the trial-ended prompt
 * appears afterwards, but nothing reaches a user who has not opened the
 * app that week. A reminder before the end is what lets someone decide
 * while the features are still on, rather than discover the lapse at
 * the camera. Cal AI and Runna both promise one on the paywall.
 *
 * Which trial: THIS one — the app-granted trial, no card, nothing is
 * charged when it ends. The billed checkout trial (`hasUsedTrial`,
 * Stripe `trialing` / the App Store intro offer) is a different thing
 * whose end the client cannot see, so it gets no reminder here and the
 * timeline on the offer page does not claim one.
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
  const chain = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    const reconcile = async () => {
      await cancelNotification(TRIAL_NOTIFICATION_ID).catch((err) => {
        logger.warn("[TrialReminder] cancel failed", err);
      });
      if (cancelled) return;
      const fireAt = trialReminderFireAt({
        isInTrial,
        trialExpiresAt,
        now: new Date(),
      });
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
  }, [loading, isInTrial, trialExpiresAt]);
}
