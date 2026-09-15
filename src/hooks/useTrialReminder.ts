import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/subscription";
import { scheduleNotification, cancelNotification } from "@/lib/notifications";
import { logger } from "@/lib/logger";

/**
 * Trial-ending reminder — one local notification, two days before the
 * trial ends. Whichever trial is running:
 *
 *   - the BILLED trial (the card trial at checkout — the App Store
 *     introductory offer via the RevenueCat webhook, or Stripe
 *     `trialing`): Apple and Stripe send the user nothing before it
 *     converts, so this is the reminder the offer page's timeline
 *     promises. "Your free trial ends in 2 days" — the subscription
 *     starts then unless they cancel;
 *   - the legacy onboarding free week, for profiles that still hold one:
 *     nothing is charged when it ends, and the copy says so.
 *
 * Fires at 10:00 local on the calendar day two days before the end's
 * local day. Local methods throughout — the end is a UTC instant, and
 * the day it lands on is the user's, not the server's.
 *
 * Mirrors the streak reminder: cancel-then-schedule on every evaluation
 * (same-id replacement is not reliable on every platform), one stable
 * id, silent without notification permission. There is no toggle: it
 * is a one-shot about the account's own state, not a recurring nudge.
 */
export const TRIAL_NOTIFICATION_ID = 3003;
export const TRIAL_REMINDER_DAYS_BEFORE = 2;
export const TRIAL_REMINDER_HOUR = 10;

export type TrialReminderKind = "billed" | "onboarding";

export const TRIAL_REMINDER_COPY: Record<
  TrialReminderKind,
  { title: string; body: string }
> = {
  billed: {
    title: "Your free trial ends in 2 days",
    body: "Your subscription starts then unless you cancel before it ends. Manage it in Settings.",
  },
  onboarding: {
    title: "Your Pro trial ends in 2 days",
    body: "Photo logging pauses and your calorie target stops adapting after that. Nothing is charged unless you subscribe.",
  },
};

/**
 * When the reminder fires, or null when there is nothing to remind
 * about: no live trial, an unreadable end, or a fire time already
 * behind us (the Home strip carries the last two days).
 */
export function trialReminderFireAt(input: {
  trialKind: TrialReminderKind | null;
  trialEndsAt: string | null | undefined;
  now: Date;
}): Date | null {
  if (!input.trialKind || !input.trialEndsAt) return null;
  const ends = new Date(input.trialEndsAt);
  if (Number.isNaN(ends.getTime())) return null;
  const fireAt = new Date(ends.getTime());
  fireAt.setDate(fireAt.getDate() - TRIAL_REMINDER_DAYS_BEFORE);
  fireAt.setHours(TRIAL_REMINDER_HOUR, 0, 0, 0);
  if (fireAt.getTime() <= input.now.getTime()) return null;
  return fireAt;
}

/** Runs once at the authenticated root (RemindersProvider). Returns nothing. */
export function useTrialReminderInternal(): void {
  const { loading } = useAuth();
  const { trialKind, trialEndsAt } = useSubscription();
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
        trialKind,
        trialEndsAt,
        now: new Date(),
      });
      if (!fireAt || !trialKind) return;
      const copy = TRIAL_REMINDER_COPY[trialKind];
      await scheduleNotification({
        id: TRIAL_NOTIFICATION_ID,
        title: copy.title,
        body: copy.body,
        scheduleAt: fireAt,
      });
    };
    chain.current = chain.current.then(reconcile, reconcile);
    return () => {
      cancelled = true;
    };
  }, [loading, trialKind, trialEndsAt]);
}
