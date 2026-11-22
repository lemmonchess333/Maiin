import { useAuth } from "@/lib/auth";
import { DEFAULT_PLAN } from "@/lib/proPlans";
import { hasLapsedOnboardingTrial } from "@/lib/subscription";
import { useStoreTrialEligibility } from "@/hooks/useStoreTrialEligibility";

/**
 * The words on a Pro offer's button: "Try Pro free" while a free trial is
 * on the table, "See Pro" once it isn't.
 *
 * Two things can take the trial off the table:
 *  - the account has had it. One trial per account: a lapsed onboarding
 *    free week counts as the trial even on a profile stamped before the
 *    server recorded it;
 *  - the App Store says this Apple ID can't have it. Apple gives one
 *    introductory offer per subscription group to an Apple ID, whichever
 *    Tropos account is signed in, so an Apple ID that had the trial under
 *    another account is charged at once. The button leads to the Pro page,
 *    which opens on the recommended plan, so that plan's answer is the one
 *    asked (`useStoreTrialEligibility`, the paywall's own check). Until the
 *    App Store answers, and on the web, the account's record decides, as
 *    the paywall does (Guideline 3.1.2(a): no "free" over a charge).
 *
 * Shared by the Pro line under the Food composer, the scanner's photo
 * tabs, the pace card and the run plan's Pro line, so offers on one screen
 * can never disagree about whether a trial is on the table.
 */
export function useProCtaLabel(): "Try Pro free" | "See Pro" {
  const { profile } = useAuth();
  const store = useStoreTrialEligibility();
  const trialUsed =
    !!profile?.hasUsedTrial || hasLapsedOnboardingTrial(profile);
  const storeSaysNo = store?.[DEFAULT_PLAN] === "ineligible";
  return trialUsed || storeSaysNo ? "See Pro" : "Try Pro free";
}
