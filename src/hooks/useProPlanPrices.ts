import { useEffect, useState } from "react";
import { PRO_PLANS, type ProPlan } from "@/lib/proPlans";
import { APPLE_PRODUCT_IDS } from "@/lib/purchaseProvider";
import { rcGetLocalizedPrices } from "@/lib/revenuecat";

/**
 * Plan metadata with Apple-localized display prices (IAP slice 3, #1099).
 *
 * On the RC-enabled native build, the App Store's own `priceString` for each
 * product replaces the hardcoded GBP string from proPlans — so what the
 * paywall shows always matches what Apple's purchase sheet will charge, in
 * the user's storefront currency (a review flag when they differ). On web,
 * or before offerings resolve, or on any fetch failure, the hardcoded
 * proPlans strings render unchanged — the paywall is never priceless and
 * never blocks on the network.
 *
 * `savingsLabel` stays as authored: Apple price tiers track the same ratio
 * closely enough that "Save 27%" remains honest across storefronts.
 */
export function useProPlanPrices(): ProPlan[] {
  const [plans, setPlans] = useState<ProPlan[]>(PRO_PLANS);

  useEffect(() => {
    let cancelled = false;
    void rcGetLocalizedPrices().then((prices) => {
      if (cancelled || !prices) return;
      setPlans(
        PRO_PLANS.map((plan) => {
          const localized = prices[APPLE_PRODUCT_IDS[plan.id]];
          return localized ? { ...plan, price: localized } : plan;
        })
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return plans;
}
