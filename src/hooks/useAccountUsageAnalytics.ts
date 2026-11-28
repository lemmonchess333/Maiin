/**
 * Share usage analytics (Priv1 call 2): the account's answer wins on this
 * device. Called by AuthProvider with the profile it holds, so the answer
 * is applied as the profile loads (the device's cached copy first, then
 * the server's) and whenever it changes, and is kept on the device for its
 * next launch. With no profile (signed out, or not loaded yet) the device
 * keeps the answer it was last given, which `analyticsProvider` read at
 * launch. The rules for the answer are in `src/lib/usageAnalytics.ts`.
 *
 * It also tells the provider whether the account met the analytics line:
 * an account that carries the health-details agreement met it there, in
 * setup or on the agreement's own screen. With no profile it has not, and
 * Google Analytics waits for the agreement to be shown in this visit.
 *
 * An account still in setup with no answer of its own leaves the device's
 * answer alone. Sign-up writes the new profile before setup is saved, and
 * reading that profile as "on" would undo a Turn off tapped on the
 * agreement in signed-out setup, before the plan's save could carry the
 * device's answer onto the account (`completeOnboarding`).
 */
import { useEffect } from "react";
import {
  setAccountMetAnalyticsNotice,
  setUsageAnalytics,
} from "@/lib/analyticsProvider";
import { accountSharesUsageAnalytics } from "@/lib/usageAnalytics";
import { hasCurrentHealthConsent } from "@/lib/healthConsent";

export function useAccountUsageAnalytics(
  profile: {
    usageAnalytics?: boolean | null;
    healthDataConsent?: unknown;
    onboardingComplete?: boolean;
  } | null
): void {
  const hasOwnAnswer = typeof profile?.usageAnalytics === "boolean";
  const shares =
    profile && (hasOwnAnswer || profile.onboardingComplete !== false)
      ? accountSharesUsageAnalytics(profile)
      : null;
  const metNotice = profile
    ? hasCurrentHealthConsent(profile.healthDataConsent)
    : false;
  useEffect(() => {
    if (shares !== null) setUsageAnalytics(shares);
  }, [shares]);
  useEffect(() => {
    setAccountMetAnalyticsNotice(metNotice);
  }, [metNotice]);
}
