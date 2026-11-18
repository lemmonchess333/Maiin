import { useCallback, useEffect, useState } from "react";
import { localizePlans, PRO_PLANS, type ProPlan } from "@/lib/proPlans";
import { APPLE_PRODUCT_IDS } from "@/lib/purchaseProvider";
import { isRevenueCatEnabled, rcGetLocalizedPrices } from "@/lib/revenuecat";

/** The plans a paywall prints, and whether the App Store's prices came. */
export interface ProPlanPrices {
  /** The plans to print, or null on the iPhone until the App Store's
   *  prices have arrived, and after they could not be read. */
  plans: ProPlan[] | null;
  /** The App Store's prices could not be read, or did not cover both
   *  plans in one currency. */
  failed: boolean;
  /** Ask the App Store again. */
  retry: () => void;
}

/**
 * Plan metadata with Apple-localized prices (IAP slice 3, #1099).
 *
 * On the RC-enabled native build, every price comes from the App Store:
 * each product's own `priceString`, with the number and currency behind
 * it, and everything worked out from a price (the per-week anchors, the
 * "Save N%" on the yearly card) in that currency (`localizePlans`). Until
 * those arrive the paywall prints no price at all, and if they can't be
 * read it says so and offers to try again. Pound plans printed meanwhile,
 * or kept when the store didn't answer, would let a reviewer on the US
 * storefront read "£34.99 a year" above a sheet charging dollars
 * (Guideline 3.1.2). A purchase needs the same offering, so a paywall
 * without its prices has nothing it could sell anyway.
 *
 * `appUserID` is the signed-in account. When RevenueCat isn't set up (its
 * set-up at sign-in failed and stopped trying), the read and Try again set
 * it up as that account, as a purchase does, so the paywall is not left
 * without prices, and so without a buy button, for the rest of the session.
 *
 * On the web the pound plans are the prices (RevenueCat runs only in the
 * iOS shell), from the first render.
 */
export function useProPlanPrices(appUserID?: string | null): ProPlanPrices {
  const fromStore = isRevenueCatEnabled();
  const [state, setState] = useState<{
    plans: ProPlan[] | null;
    failed: boolean;
  }>(() => ({ plans: fromStore ? null : PRO_PLANS, failed: false }));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!fromStore) return;
    let cancelled = false;
    void rcGetLocalizedPrices(appUserID).then((prices) => {
      if (cancelled) return;
      // `localizePlans` hands back the pound plans when the offering is
      // missing a plan or mixes currencies: no App Store price to print.
      const plans = prices
        ? localizePlans({
            monthly: prices[APPLE_PRODUCT_IDS.monthly],
            yearly: prices[APPLE_PRODUCT_IDS.yearly],
          })
        : null;
      setState(
        plans && plans !== PRO_PLANS
          ? { plans, failed: false }
          : { plans: null, failed: true }
      );
    });
    return () => {
      cancelled = true;
    };
  }, [fromStore, attempt, appUserID]);

  const retry = useCallback(() => {
    setState({ plans: null, failed: false });
    setAttempt((n) => n + 1);
  }, []);

  return { ...state, retry };
}
