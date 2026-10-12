/**
 * The free trial a store purchase is in, as the app shows it (Sub1, STATUS
 * 2026-10-06).
 *
 * The server records the trial from RevenueCat on the profile
 * (`subscriptionTrial`, functions/lib/trialReminder.js) with the instant
 * the reminder goes, the last moment to cancel and how often it renews.
 * Everything here reads those and works none of them out again, so the
 * phone notification, Home's strip and the Upgrade page say what the
 * reminder email says. Dates and times are the device's, in the house's
 * day-first and 24-hour forms.
 */
import type { SubscriptionTrial } from "@/lib/auth";
import { addLocalDays, localDateString } from "@/lib/dateHelpers";
import { formatTimeOfDay, formatWeekdayDayMonth } from "@/utils/formatters";

/** How long before the end Home shows the strip (Sub1 pin 12's last days). */
export const TRIAL_STRIP_LEAD_MS = 2 * 24 * 60 * 60 * 1000;

function instant(text: string | null | undefined): Date | null {
  if (typeof text !== "string") return null;
  const at = new Date(text);
  return Number.isFinite(at.getTime()) ? at : null;
}

/** The store's own list of a person's subscriptions, where they cancel. */
export function storeSubscriptionsUrl(store: string): string {
  return store === "play_store"
    ? "https://play.google.com/store/account/subscriptions"
    : "https://apps.apple.com/account/subscriptions";
}

/** The trial while it is still running, else null. */
export function runningTrial(
  trial: SubscriptionTrial | null | undefined,
  now: Date
): SubscriptionTrial | null {
  const ends = instant(trial?.endsAt);
  return trial && ends && ends.getTime() > now.getTime() ? trial : null;
}

/** "£3.99 a month", "£34.99 a year", the bare price when the period is
 *  unknown, or null when the app never reported one. */
export function trialPriceText(trial: SubscriptionTrial): string | null {
  const price = trial.price?.display;
  if (!price) return null;
  if (trial.period === "month") return `${price} a month`;
  if (trial.period === "year") return `${price} a year`;
  return price;
}

/** "14:30 on Friday 9 October": the last moment to cancel. */
export function cancelByText(trial: SubscriptionTrial): string | null {
  const by = instant(trial.cancelBy);
  return by ? `${formatTimeOfDay(by)} on ${formatWeekdayDayMonth(by)}` : null;
}

/** "Saturday 10 October", the day the trial ends. */
export function trialEndDayText(trial: SubscriptionTrial): string | null {
  const ends = instant(trial.endsAt);
  return ends ? formatWeekdayDayMonth(ends) : null;
}

export interface TrialPhoneReminder {
  fireAt: Date;
  title: string;
  body: string;
}

/**
 * The phone notification: at the email's instant, while renewal is on.
 * Nothing can withdraw it if they cancel in Settings before the app next
 * opens, so its words hold either way.
 */
export function trialPhoneReminder(
  trial: SubscriptionTrial | null | undefined,
  now: Date
): TrialPhoneReminder | null {
  if (!trial || trial.willRenew !== true) return null;
  const fireAt = instant(trial.reminderAt);
  const deadline = cancelByText(trial);
  const endDay = trialEndDayText(trial);
  if (!fireAt || !deadline || !endDay || fireAt.getTime() <= now.getTime())
    return null;
  const price = trialPriceText(trial);
  const choice = price
    ? `if you don't want to pay ${price}`
    : "if you don't want your subscription to start";
  return {
    fireAt,
    title: `Your free trial ends on ${endDay}`,
    body: `Cancel by ${deadline} ${choice}. Already cancelled? There's nothing to do.`,
  };
}

/** "today", "tomorrow" or "on Saturday", for a day within the week. */
export function relativeDayText(at: Date, now: Date): string {
  const day = localDateString(at);
  if (day === localDateString(now)) return "today";
  if (day === localDateString(addLocalDays(now, 1))) return "tomorrow";
  return `on ${at.toLocaleDateString("en-GB", { weekday: "long" })}`;
}

/**
 * Home's strip in a renewing trial's last two days: "Free trial ends
 * tomorrow, then £3.99 a month". Null at any other time, and once
 * renewal is off, since nothing will be charged.
 */
export function trialStripText(
  trial: SubscriptionTrial | null | undefined,
  now: Date
): string | null {
  const running = runningTrial(trial, now);
  if (!running || running.willRenew !== true) return null;
  const ends = instant(running.endsAt)!;
  if (ends.getTime() - now.getTime() > TRIAL_STRIP_LEAD_MS) return null;
  const price = trialPriceText(running);
  const when = `Free trial ends ${relativeDayText(ends, now)}`;
  return price ? `${when}, then ${price}` : when;
}
