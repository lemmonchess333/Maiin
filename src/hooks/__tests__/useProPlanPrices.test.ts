/**
 * useProPlanPrices — the plans the paywall prints, priced by the App Store
 * on the RevenueCat build and in pounds everywhere else.
 *
 * What it must never do is put a pound figure beside a price in another
 * currency. It used to swap in Apple's price STRING and keep everything
 * else, so a US storefront read "$39.99/year" over "≈ £0.67/wk", the CTA
 * said "Start Pro — £34.99/yr" (it looked the price up by id), and a plan
 * missing from the offering stayed in pounds beside one in dollars.
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
vi.mock("@/lib/revenuecat", () => ({
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
});

describe("useProPlanPrices", () => {
  it("renders the pound plans until the App Store answers", () => {
    storePrices.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useProPlanPrices());
    expect(result.current).toBe(PRO_PLANS);
  });

  it("prices every plan, and everything worked out from a price, in the storefront's currency", async () => {
    storePrices.mockResolvedValue({
      [APPLE_PRODUCT_IDS.monthly]: usd(4.99),
      [APPLE_PRODUCT_IDS.yearly]: usd(39.99),
    });
    const { result } = renderHook(() => useProPlanPrices());

    await waitFor(() =>
      expect(findPlan(result.current, "yearly").price).toBe("$39.99")
    );
    const plans = result.current;
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

  it("keeps both plans in pounds when the offering is missing one", async () => {
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
    expect(result.current.map((p) => p.price)).toEqual(["£3.99", "£34.99"]);
    expect(result.current).toBe(PRO_PLANS);
  });
});
