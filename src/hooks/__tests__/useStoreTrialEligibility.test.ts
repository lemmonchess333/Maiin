import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

/** The paywalls' App Store answer on the trial, by plan. */
const enabledMock = vi.fn(() => true);
const eligibilityMock = vi.fn();

vi.mock("@/lib/revenuecat", () => ({
  isRevenueCatEnabled: () => enabledMock(),
  rcTrialEligibility: (ids: string[]) => eligibilityMock(ids),
}));

import {
  __resetStoreTrialEligibilityForTests,
  offersTrial,
  useStoreTrialEligibility,
} from "../useStoreTrialEligibility";
import { APPLE_PRODUCT_IDS } from "@/lib/purchaseProvider";

beforeEach(() => {
  vi.clearAllMocks();
  enabledMock.mockReturnValue(true);
  __resetStoreTrialEligibilityForTests();
});

describe("useStoreTrialEligibility", () => {
  it("reads the App Store's answer for both plans", async () => {
    eligibilityMock.mockResolvedValue({
      [APPLE_PRODUCT_IDS.monthly]: "ineligible",
      [APPLE_PRODUCT_IDS.yearly]: "eligible",
    });
    const { result } = renderHook(() => useStoreTrialEligibility());
    expect(result.current).toBeNull();
    await waitFor(() =>
      expect(result.current).toEqual({
        monthly: "ineligible",
        yearly: "eligible",
      })
    );
    expect(eligibilityMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        APPLE_PRODUCT_IDS.monthly,
        APPLE_PRODUCT_IDS.yearly,
      ])
    );
  });

  it("stays null when the check gives no answer", async () => {
    eligibilityMock.mockResolvedValue(null);
    const { result } = renderHook(() => useStoreTrialEligibility());
    await waitFor(() => expect(eligibilityMock).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it("asks the App Store once for every offer on screen", async () => {
    eligibilityMock.mockResolvedValue({
      [APPLE_PRODUCT_IDS.monthly]: "eligible",
      [APPLE_PRODUCT_IDS.yearly]: "ineligible",
    });
    const first = renderHook(() => useStoreTrialEligibility());
    const second = renderHook(() => useStoreTrialEligibility());
    await waitFor(() =>
      expect(first.result.current?.yearly).toBe("ineligible")
    );
    await waitFor(() =>
      expect(second.result.current?.yearly).toBe("ineligible")
    );
    expect(eligibilityMock).toHaveBeenCalledTimes(1);
  });

  it("asks again after a check that gave no answer", async () => {
    eligibilityMock.mockResolvedValueOnce(null).mockResolvedValueOnce({
      [APPLE_PRODUCT_IDS.monthly]: "eligible",
      [APPLE_PRODUCT_IDS.yearly]: "eligible",
    });
    const first = renderHook(() => useStoreTrialEligibility());
    await waitFor(() => expect(eligibilityMock).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(first.result.current).toBeNull();
    const second = renderHook(() => useStoreTrialEligibility());
    await waitFor(() => expect(second.result.current?.yearly).toBe("eligible"));
    expect(eligibilityMock).toHaveBeenCalledTimes(2);
  });

  it("asks nothing on the web", () => {
    enabledMock.mockReturnValue(false);
    const { result } = renderHook(() => useStoreTrialEligibility());
    expect(result.current).toBeNull();
    expect(eligibilityMock).not.toHaveBeenCalled();
  });
});

describe("offersTrial", () => {
  const store = { monthly: "ineligible", yearly: "unknown" } as const;

  it("offers the trial only when the account allows it and the store hasn't said no", () => {
    expect(offersTrial(true, null, "yearly")).toBe(true);
    expect(offersTrial(true, store, "yearly")).toBe(true);
    expect(offersTrial(true, store, "monthly")).toBe(false);
    expect(offersTrial(false, null, "yearly")).toBe(false);
    expect(
      offersTrial(false, { monthly: "eligible", yearly: "eligible" }, "yearly")
    ).toBe(false);
  });
});
