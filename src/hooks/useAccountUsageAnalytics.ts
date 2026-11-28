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
  } | null
): void {
  const shares = profile ? accountSharesUsageAnalytics(profile) : null;
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
