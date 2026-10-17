import { useEffect, useState } from "react";
import type { PlanId } from "@/lib/proPlans";
import { APPLE_PRODUCT_IDS } from "@/lib/purchaseProvider";
import {
  isRevenueCatEnabled,
  rcTrialEligibility,
  type StoreTrialEligibility,
} from "@/lib/revenuecat";

/**
 * The App Store's answer on each plan's free trial, on the RevenueCat build
 * (`rcTrialEligibility`): null on the web, while the check runs, or when it
 * fails. A paywall offers the trial only while the account's own record
 * allows it AND this answer isn't "ineligible", so it never promises a
 * trial Apple's sheet won't give.
 */
export function useStoreTrialEligibility(): Record<
  PlanId,
  StoreTrialEligibility
> | null {
  const [eligibility, setEligibility] = useState<Record<
    PlanId,
    StoreTrialEligibility
  > | null>(null);

  useEffect(() => {
    if (!isRevenueCatEnabled()) return;
    let cancelled = false;
    void rcTrialEligibility(Object.values(APPLE_PRODUCT_IDS)).then(
      (byProduct) => {
        if (cancelled || !byProduct) return;
        setEligibility({
          monthly: byProduct[APPLE_PRODUCT_IDS.monthly] ?? "unknown",
          yearly: byProduct[APPLE_PRODUCT_IDS.yearly] ?? "unknown",
        });
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return eligibility;
}

/** Whether a paywall may offer the trial on `plan`: the account allows it
 *  and the App Store hasn't said no. */
export function offersTrial(
  accountEligible: boolean,
  store: Record<PlanId, StoreTrialEligibility> | null,
  plan: PlanId
): boolean {
  return accountEligible && store?.[plan] !== "ineligible";
}
