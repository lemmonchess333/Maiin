import { useEffect, useState } from "react";
import type { PlanId } from "@/lib/proPlans";
import { APPLE_PRODUCT_IDS } from "@/lib/purchaseProvider";
import {
  isRevenueCatEnabled,
  rcTrialEligibility,
  type StoreTrialEligibility,
} from "@/lib/revenuecat";

type ByPlan = Record<PlanId, StoreTrialEligibility>;

/** The App Store's answer, asked once and shared by every offer on screen,
 *  so two buttons on one page can never disagree while each waits for its
 *  own answer, and a page of offers makes one native call, not one each.
 *  A check that gave no answer, or "unknown" for either plan, is used by
 *  the offers that asked and then forgotten, so the next offer asks again:
 *  "unknown" is RevenueCat not being able to tell yet, not Apple's answer.
 *  A definite answer only changes when the Apple ID takes a trial, and a
 *  Pro member is offered none. */
let shared: Promise<ByPlan | null> | null = null;

function askStore(): Promise<ByPlan | null> {
  shared ??= rcTrialEligibility(Object.values(APPLE_PRODUCT_IDS)).then(
    (byProduct) => {
      if (!byProduct) {
        shared = null;
        return null;
      }
      const byPlan: ByPlan = {
        monthly: byProduct[APPLE_PRODUCT_IDS.monthly] ?? "unknown",
        yearly: byProduct[APPLE_PRODUCT_IDS.yearly] ?? "unknown",
      };
      if (byPlan.monthly === "unknown" || byPlan.yearly === "unknown") {
        shared = null;
      }
      return byPlan;
    }
  );
  return shared;
}

/** Tests only: forget the shared answer. */
export function forgetStoreTrialEligibility(): void {
  shared = null;
}

/**
 * The App Store's answer on each plan's free trial, on the RevenueCat build
 * (`rcTrialEligibility`): null on the web, while the check runs, or when it
 * fails. A paywall offers the trial only while the account's own record
 * allows it AND this answer isn't "ineligible", so it never promises a
 * trial Apple's sheet won't give.
 */
export function useStoreTrialEligibility(): ByPlan | null {
  const [eligibility, setEligibility] = useState<ByPlan | null>(null);

  useEffect(() => {
    if (!isRevenueCatEnabled()) return;
    let cancelled = false;
    void askStore().then((byPlan) => {
      if (!cancelled && byPlan) setEligibility(byPlan);
    });
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
