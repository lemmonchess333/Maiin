/**
 * The first run's events (A6), for the cohorts a flow test will compare:
 * the welcome seen, setup started, the account made, setup done, the trial
 * offer seen, and a trial started.
 *
 *   - The welcome seen and setup started come before the person has met
 *     the analytics line on the health-details agreement, so they never go
 *     to Google (owner, 23 November 2026). They are counted on Tropos's own
 *     server as plain daily totals with nothing read from the phone
 *     (`setupCounts.ts`), each once a launch.
 *   - `account_created`, with its method: sent where the account's profile
 *     is first written (`auth.tsx`), which happens once per account. The
 *     server counts accounts made on its own too (onAuthUserCreated).
 *   - `onboarding_completed`: once per account, as setup saves (App1 Q17).
 *   - `trial_offer_viewed`: once per account, on this phone.
 *   - `trial_started`: the launch event, decided by the server and sent once
 *     per account by `launchEvents.ts`. Nothing here sends it again.
 *
 * The events go through the analytics layer, which sends nothing before
 * the line is met, nor from a phone that turned Share usage analytics off
 * (`analyticsProvider.ts`). The trial offer's once-only flag is set before
 * it is sent, whatever the switch says, so a phone with analytics off the
 * first time never sends it later either: a later showing is not the first.
 * Which version of a flow was shown comes from `flowVariant.ts`.
 */
import { readString, writeString } from "@/lib/localStore";
import { track } from "@/lib/lifecycleAnalytics";
import { countSetupStep } from "@/lib/setupCounts";

const trialOfferViewedKey = (uid: string) =>
  `tropos.firstRun.trialOfferViewed.${uid}`;

/** The welcome screen: counted on Tropos's server, never sent to Google. */
export function trackWelcomeViewed(): void {
  countSetupStep("welcome_viewed");
}

/** Setup's first question: counted on Tropos's server, never sent to
 *  Google. */
export function trackSetupStarted(): void {
  countSetupStep("setup_started");
}

/** The trial offer at the end of setup, once for this account. */
export function trackTrialOfferViewed(uid: string): void {
  if (!uid || readString(trialOfferViewedKey(uid)) === "1") return;
  writeString(trialOfferViewedKey(uid), "1");
  track("trial_offer_viewed");
}
