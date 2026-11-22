/**
 * The trial offer that ends setup (Biz1 call 3, Q72; A6 call 2): one
 * screen, after the plan is built and before Home, naming what Pro does
 * from the first day, the trial, and a plain Not now.
 *
 * One trial per account: an account that has had one, or is Pro, goes
 * straight to Home. The server holds the real line (`checkoutTrial.js`);
 * the App Store holds its own for the Apple ID, and the screen offers the
 * price without a trial where Apple says no (`offersTrial`). Someone who
 * says Not now meets Pro again on day 14, when their personal target is
 * ready (Q87), and wherever a Pro feature is.
 */
import { flowVariant } from "@/lib/flowVariant";
import {
  getSubscriptionInfo,
  isCheckoutTrialEligible,
} from "@/lib/subscription";
import type { UserProfile } from "@/lib/auth";
import { TRIAL_DAYS } from "@/lib/proPlans";
import { PRO_FROM_DAY_ONE } from "@/components/paywall/proIncludesCopy";

/** The offer's own page, full screen like setup. */
export const TRIAL_OFFER_PATH = "/trial-offer";

/** Whether this account meets the offer: the flow shows it, and the
 *  account can still take a trial. */
export function meetsTrialOffer(profile: UserProfile | null): boolean {
  return (
    flowVariant("setupTrialOffer") === "offer" &&
    isCheckoutTrialEligible(profile) &&
    !getSubscriptionInfo(profile).isPro
  );
}

/** Where setup goes once the plan is built. */
export function pathAfterSetup(profile: UserProfile | null): string {
  return meetsTrialOffer(profile) ? TRIAL_OFFER_PATH : "/";
}

/** The offer's words. */
export const TRIAL_OFFER_COPY = {
  kicker: "Your plan is ready",
  /** With the trial, and where the App Store gives this Apple ID none. */
  title: (withTrial: boolean) =>
    withTrial ? `Try Pro free for ${TRIAL_DAYS} days` : "Add Pro to your plan",
  lead: "Your plan is free. From your first day, Pro adds:",
  dayOne: PRO_FROM_DAY_ONE,
  start: "Start free trial",
  notNow: "Not now",
} as const;
