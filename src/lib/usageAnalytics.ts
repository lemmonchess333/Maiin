/**
 * Share usage analytics (Priv1 call 2): the switch in
 * Settings → Social & privacy that stops Google Analytics on the iPhone
 * and on the web. On by default. Since 5 February 2026 PECR lets analytics
 * used only to improve the service run without asking first, provided the
 * person is told and has a simple, free way to object; this is that way.
 *
 * The answer lives in two places, and this module holds the rules for both:
 *
 *   - **The account** (`users/{uid}.usageAnalytics`): false when the person
 *     turned it off, absent (or true) when on. It follows them to a new
 *     device. `firestore.rules` allows only a boolean (`usageAnalyticsValid`).
 *   - **This device** (`USAGE_ANALYTICS_OFF_KEY`): kept so the answer
 *     applies from launch, before any profile has loaded, on a device where
 *     it was turned off. Once a profile loads, the account's answer wins and
 *     is written here (`useAccountUsageAnalytics`).
 *
 * The device's answer is the device's, not an account's: it is what this
 * device was last told, and a signed-out launch reads it as well.
 * `analyticsProvider.setUsageAnalytics` is the one way to change it, since
 * the provider switches Google Analytics in the same step.
 *
 * Crash reports are not analytics and do not follow this switch.
 */
import { readString, remove, writeString } from "@/lib/localStore";

/** Set to "1" on a device whose last answer was off; absent when on. */
export const USAGE_ANALYTICS_OFF_KEY = "tropos.usageAnalytics.off";

/** The switch's line: what goes, from where, and what never does. Written
 *  from what the app sends (`analyticsHealthFigures.test.ts` holds the
 *  parameters): app actions and screen names, setup's choices (the goal,
 *  days a week) and counts of what was logged, never what was logged, a
 *  figure about the person or anything typed. The words are the owner's
 *  to approve, and `UsageAnalyticsGroup.test.tsx` holds them. */
export const USAGE_ANALYTICS_DESCRIPTION =
  "Sends how you use the app and your plan choices to Google Analytics, " +
  "tied to this device, not your account. No names, and not what you log, " +
  "only how often.";

/** The account's answer: on unless it says false. */
export function accountSharesUsageAnalytics(profile: {
  usageAnalytics?: boolean | null;
}): boolean {
  return profile.usageAnalytics !== false;
}

/** This device's last answer, read at launch. On unless it was turned off. */
export function usageAnalyticsOnThisDevice(): boolean {
  return readString(USAGE_ANALYTICS_OFF_KEY) !== "1";
}

/** Keep the answer for this device's next launch. */
export function rememberUsageAnalyticsOnThisDevice(on: boolean): void {
  if (on) remove(USAGE_ANALYTICS_OFF_KEY);
  else writeString(USAGE_ANALYTICS_OFF_KEY, "1");
}
