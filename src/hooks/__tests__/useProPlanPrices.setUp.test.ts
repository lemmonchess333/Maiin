/**
 * useProPlanPrices against the real RevenueCat module, on a paywall opened
 * after sign-in's set-up failed and stopped trying (`useRevenueCatIdentity`
 * tries four times in five minutes). The price read only waited for that
 * set-up, so every paywall open waited out the budget, said "Couldn’t get
 * prices from the App Store." and Try again did the same, with no buy
 * button for the rest of the session.
 */
import { describe, it, expect, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const rc = vi.hoisted(() => {
  vi.stubEnv("VITE_REVENUECAT_IOS_KEY", "appl_test_key");
  return {
    configure: vi.fn(),
    getOfferings: vi.fn(),
  };
});

vi.mock("@revenuecat/purchases-capacitor", async () => {
  const { capacitorPlugin } = await import("@/test/capacitorPlugin");
  return { Purchases: capacitorPlugin(rc) };
});
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" },
}));
vi.mock("@/lib/firebase", () => ({ functions: {} }));

import { useProPlanPrices } from "../useProPlanPrices";
import { rcLogIn } from "@/lib/revenuecat";
import { APPLE_PRODUCT_IDS } from "@/lib/purchaseProvider";

const UID = "u1";

function storePackage(identifier: string, price: number) {
  return {
    product: {
      identifier,
      priceString: `$${price.toFixed(2)}`,
      price,
      currencyCode: "USD",
    },
  };
}

describe("useProPlanPrices when sign-in's RevenueCat set-up gave up", () => {
  it("sets RevenueCat up as the account on Try again, and shows the prices", async () => {
    rc.configure.mockRejectedValue(new Error("network"));
    rc.getOfferings.mockResolvedValue({
      current: {
        availablePackages: [
          storePackage(APPLE_PRODUCT_IDS.monthly, 4.99),
          storePackage(APPLE_PRODUCT_IDS.yearly, 39.99),
        ],
      },
    });
    // Sign-in's four tries, every one failed: it has stopped.
    for (let attempt = 0; attempt < 4; attempt++) {
      expect(await rcLogIn(UID)).toBe(false);
    }

    // The paywall's own read sets up too, and the store is still down.
    const { result } = renderHook(() => useProPlanPrices(UID));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.plans).toBeNull();
    expect(rc.getOfferings).not.toHaveBeenCalled();

    // The store is back; Try again sets RevenueCat up as this account.
    rc.configure.mockResolvedValue(undefined);
    act(() => result.current.retry());
    await waitFor(() =>
      expect(result.current.plans?.map((p) => p.price)).toEqual([
        "$4.99",
        "$39.99",
      ])
    );
    expect(result.current.failed).toBe(false);
    expect(rc.configure).toHaveBeenLastCalledWith({
      apiKey: "appl_test_key",
      appUserID: UID,
    });
  });
});
