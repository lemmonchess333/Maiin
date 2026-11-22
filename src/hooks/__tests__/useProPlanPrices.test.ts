/**
 * useProPlanPrices — the plans the paywall prints, priced by the App Store
 * on the RevenueCat build and in pounds everywhere else.
 *
 * What it must never do is put a pound figure beside a price in another
 * currency. It used to swap in Apple's price STRING and keep everything
 * else, so a US storefront read "$39.99/year" over "≈ £0.67/wk", the CTA
 * said "Start Pro — £34.99/yr" (it looked the price up by id), and a plan
 * missing from the offering stayed in pounds beside one in dollars. Nor may
 * the iPhone print the pound plans while it waits for the App Store, or
 * after the store didn't answer (launch audit, 2026-11-18): no price until
 * the store's, and a way to ask again.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  PRO_PLANS,
  findPlan,
  getCheckoutCtaLabel,
  getInlinePriceSummary,
  weeklyPriceLabel,
  type StorePrice,
} from "@/lib/proPlans";

vi.mock("@/lib/firebase", () => ({ functions: {} }));

const storePrices = vi.fn<() => Promise<Record<string, StorePrice> | null>>();
const onIPhone = vi.fn(() => true);
vi.mock("@/lib/revenuecat", () => ({
  isRevenueCatEnabled: () => onIPhone(),
  rcGetLocalizedPrices: () => storePrices(),
}));

import { APPLE_PRODUCT_IDS } from "@/lib/purchaseProvider";
import { useProPlanPrices } from "../useProPlanPrices";

const usd = (price: number): StorePrice => ({
  priceString: `$${price.toFixed(2)}`,
  price,
  currencyCode: "USD",
});

beforeEach(() => {
  storePrices.mockReset();
  onIPhone.mockReturnValue(true);
});

describe("useProPlanPrices", () => {
  it("prints no plans on the iPhone until the App Store answers", () => {
    storePrices.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useProPlanPrices());
    expect(result.current.plans).toBeNull();
    expect(result.current.failed).toBe(false);
  });

  it("prints the pound plans on the web from the first render, and asks no store", () => {
    onIPhone.mockReturnValue(false);
    const { result } = renderHook(() => useProPlanPrices());
    expect(result.current.plans).toBe(PRO_PLANS);
    expect(storePrices).not.toHaveBeenCalled();
  });

  it("says so when the App Store gives no prices, and asks again on retry", async () => {
    storePrices.mockResolvedValueOnce(null).mockResolvedValueOnce({
      [APPLE_PRODUCT_IDS.monthly]: usd(4.99),
      [APPLE_PRODUCT_IDS.yearly]: usd(39.99),
    });
    const { result } = renderHook(() => useProPlanPrices());
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.plans).toBeNull();

    act(() => result.current.retry());
    expect(result.current.failed).toBe(false);
    await waitFor(() =>
      expect(result.current.plans?.map((p) => p.price)).toEqual([
        "$4.99",
        "$39.99",
      ])
    );
    expect(storePrices).toHaveBeenCalledTimes(2);
  });

  it("prices every plan, and everything worked out from a price, in the storefront's currency", async () => {
    storePrices.mockResolvedValue({
      [APPLE_PRODUCT_IDS.monthly]: usd(4.99),
      [APPLE_PRODUCT_IDS.yearly]: usd(39.99),
    });
    const { result } = renderHook(() => useProPlanPrices());

    await waitFor(() => expect(result.current.plans).not.toBeNull());
    const plans = result.current.plans!;
    expect(findPlan(plans, "yearly").price).toBe("$39.99");
    expect(findPlan(plans, "monthly").price).toBe("$4.99");
    expect(getCheckoutCtaLabel(findPlan(plans, "yearly"))).toBe(
      "Start Pro — $39.99/yr"
    );
    expect(getInlinePriceSummary(plans)).toBe("$4.99 a month or $39.99 a year");
    for (const plan of plans) {
      expect(weeklyPriceLabel(plan)).toContain("$");
      expect(weeklyPriceLabel(plan)).not.toContain("£");
    }
    // The saving is these prices' own: $4.99 × 12 against $39.99.
    expect(findPlan(plans, "yearly").savingsLabel).toBe("Save 33%");
  });

  it("prints no pounds when the offering is missing a plan: it says the prices failed", async () => {
    let answer!: (prices: Record<string, StorePrice>) => void;
    storePrices.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      })
    );
    const { result } = renderHook(() => useProPlanPrices());

    // Settle the store's answer inside act, so whatever the hook does with
    // it has happened before the assertions below read the result.
    await act(async () => {
      answer({ [APPLE_PRODUCT_IDS.yearly]: usd(39.99) });
    });

    expect(storePrices).toHaveBeenCalledTimes(1);
    expect(result.current.plans).toBeNull();
    expect(result.current.failed).toBe(true);
  });
});
