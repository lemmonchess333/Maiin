/**
 * The first run's events (A6), each sent once, for the cohorts a flow test
 * will compare: the welcome seen, setup started, the account made, setup
 * done, the trial offer seen, and a trial started.
 *
 *   - `welcome_viewed` and `setup_started`: once per phone. There is no
 *     account yet, so the phone is what can be counted.
 *   - `account_created`, with its method: sent where the account's profile
 *     is first written (`auth.tsx`), which happens once per account.
 *   - `onboarding_completed`: once per account, as setup saves (App1 Q17).
 *   - `trial_offer_viewed`: once per account, on this phone.
 *   - `trial_started`: the launch event, decided by the server and sent once
 *     per account by `launchEvents.ts`. Nothing here sends it again.
 *
 * All go through the analytics layer, so a phone that turned Share usage
 * analytics off sends none of them (`analyticsProvider.ts`, Priv1 call 2).
 * Each one's once-only flag is set before it is sent, whatever the switch
 * says, so a phone with analytics off the first time never sends it later
 * either: a later showing is not the first.
 * Which version of a flow was shown comes from `flowVariant.ts`.
 */
import { readString, writeString } from "@/lib/localStore";
import { track } from "@/lib/lifecycleAnalytics";

const WELCOME_VIEWED_KEY = "tropos.firstRun.welcomeViewed";
const SETUP_STARTED_KEY = "tropos.firstRun.setupStarted";
const trialOfferViewedKey = (uid: string) =>
  `tropos.firstRun.trialOfferViewed.${uid}`;

/** The welcome screen, the first time this phone shows it. */
export function trackWelcomeViewed(returningDevice: boolean): void {
  if (readString(WELCOME_VIEWED_KEY) === "1") return;
  writeString(WELCOME_VIEWED_KEY, "1");
  track("welcome_viewed", { returningDevice });
}

/** Setup's first question, the first time this phone shows it. */
export function trackSetupStarted(signedIn: boolean): void {
  if (readString(SETUP_STARTED_KEY) === "1") return;
  writeString(SETUP_STARTED_KEY, "1");
  track("setup_started", { signedIn });
}

/** The trial offer at the end of setup, once for this account. */
export function trackTrialOfferViewed(uid: string): void {
  if (!uid || readString(trialOfferViewedKey(uid)) === "1") return;
  writeString(trialOfferViewedKey(uid), "1");
  track("trial_offer_viewed");
}
