import { useAuth } from "@/lib/auth";
import { hasLapsedOnboardingTrial } from "@/lib/subscription";

/**
 * The words on a Pro offer's button: "Try Pro free" while the account
 * still has its one free trial, "See Pro" once it has had it.
 *
 * One trial per account: a lapsed onboarding free week counts as the
 * trial even on a profile stamped before the server recorded it.
 *
 * Shared by the Pro line under the Food composer and the scanner's photo
 * tabs, so the two offers on one screen can never disagree about whether
 * a trial is on the table.
 */
export function useProCtaLabel(): "Try Pro free" | "See Pro" {
  const { profile } = useAuth();
  const trialUsed =
    !!profile?.hasUsedTrial || hasLapsedOnboardingTrial(profile);
  return trialUsed ? "See Pro" : "Try Pro free";
}
