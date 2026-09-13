/**
 * Where a new subscriber lands, and what greets them there.
 *
 * A purchase sheet dismissing back onto the offer page is a dead end:
 * the thing they just paid for is one tab away. Both purchase surfaces
 * send a successful checkout to the Food page with this context, where
 * the composer's camera is the first thing on screen, a one-line chip
 * says Pro is on, and — when the checkout started a trial — one ask for
 * notification permission so the day-5 reminder can actually fire
 * (Apple and Stripe send nothing before a trial converts).
 */
export const PRO_START_CONTEXT = "pro-start";

export function proStartPath(options: { withTrial: boolean }): string {
  const params = new URLSearchParams({ context: PRO_START_CONTEXT });
  if (options.withTrial) params.set("trial", "1");
  return `/food?${params.toString()}`;
}

/** Local-store key: the reminder ask is made once per account. */
export function trialReminderAskKey(uid: string): string {
  return `tropos.trialReminderAsked.${uid}`;
}
