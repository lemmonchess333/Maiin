/**
 * Share usage analytics (Priv1 call 2): the account's answer wins on this
 * device. Called by AuthProvider with the profile it holds, so the answer
 * is applied as the profile loads (the device's cached copy first, then
 * the server's) and whenever it changes, and is kept on the device for its
 * next launch. With no profile (signed out, or not loaded yet) the device
 * keeps the answer it was last given, which `analyticsProvider` read at
 * launch. The rules for the answer are in `src/lib/usageAnalytics.ts`.
 */
import { useEffect } from "react";
import { setUsageAnalytics } from "@/lib/analyticsProvider";
import { accountSharesUsageAnalytics } from "@/lib/usageAnalytics";

export function useAccountUsageAnalytics(
  profile: { usageAnalytics?: boolean | null } | null
): void {
  const shares = profile ? accountSharesUsageAnalytics(profile) : null;
  useEffect(() => {
    if (shares !== null) setUsageAnalytics(shares);
  }, [shares]);
}
