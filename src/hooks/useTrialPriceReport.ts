import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { reportTrialPrice } from "@/lib/purchaseProvider";
import { logger } from "@/lib/logger";

/**
 * Fills in the price on a store trial whose record has none (Sub1, STATUS
 * 2026-10-06).
 *
 * The reminder email names the amount, and the renewal price exists only
 * in the store, on the device: RevenueCat keeps none for a trial. The sync
 * after a purchase carries it; when that sync never lands, the webhook
 * records the trial without one, and this sends it the next time the app
 * runs. Once per session for each trial, and only on the iOS build
 * (`reportTrialPrice` does nothing elsewhere).
 */
export function useTrialPriceReport(): void {
  const { profile } = useAuth();
  const trial = profile?.subscriptionTrial ?? null;
  const productId =
    trial && trial.willRenew && !trial.price ? trial.productId : null;
  const key = productId && trial ? `${productId}|${trial.endsAt}` : null;
  const reported = useRef<string | null>(null);

  useEffect(() => {
    if (!productId || !key || reported.current === key) return;
    reported.current = key;
    reportTrialPrice(productId).catch((err) => {
      logger.warn("[TrialPrice] report failed", err);
    });
  }, [productId, key]);
}
