import { useEffect, useState } from "react";
import { localizePlans, PRO_PLANS, type ProPlan } from "@/lib/proPlans";
import { APPLE_PRODUCT_IDS } from "@/lib/purchaseProvider";
import { rcGetLocalizedPrices } from "@/lib/revenuecat";

/**
 * Plan metadata with Apple-localized prices (IAP slice 3, #1099).
 *
 * On the RC-enabled native build, the App Store's own `priceString` for each
 * product replaces the hardcoded GBP string from proPlans — so what the
 * paywall shows always matches what Apple's purchase sheet will charge, in
 * the user's storefront currency (a review flag when they differ). The
 * number and currency come with it, and everything worked out from a price
 * (the per-week anchors, the "Save N%" on the yearly card) is worked out
 * from those, in that currency (`localizePlans`).
 *
 * On web, or before offerings resolve, or on any fetch failure, or when the
 * offering is missing a plan, the hardcoded pound plans render unchanged —
 * the paywall is never priceless, never blocks on the network, and never
 * prices one plan in pounds beside another in the storefront's currency.
 */
export function useProPlanPrices(): ProPlan[] {
  const [plans, setPlans] = useState<ProPlan[]>(PRO_PLANS);

  useEffect(() => {
    let cancelled = false;
    void rcGetLocalizedPrices().then((prices) => {
      if (cancelled || !prices) return;
      setPlans(
        localizePlans({
          monthly: prices[APPLE_PRODUCT_IDS.monthly],
          yearly: prices[APPLE_PRODUCT_IDS.yearly],
        })
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return plans;
}
