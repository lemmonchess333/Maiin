/**
 * "Try Pro free" only while a trial is on the table (Guideline 3.1.2(a)).
 *
 * The button used to read the account's record alone, so an Apple ID that
 * had the trial under another Tropos account, as App Review's sandbox
 * accounts often have, was told "free" and then shown a price. The App
 * Store's answer, the one the paywall already asks, now takes it off.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const profileMock = vi.fn<() => Record<string, unknown> | null>(() => ({}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ profile: profileMock() }),
}));

const enabledMock = vi.fn(() => true);
const eligibilityMock = vi.fn();
vi.mock("@/lib/revenuecat", () => ({
  isRevenueCatEnabled: () => enabledMock(),
  rcTrialEligibility: (ids: string[]) => eligibilityMock(ids),
}));

import { useProCtaLabel } from "../useProCtaLabel";
import { APPLE_PRODUCT_IDS } from "@/lib/purchaseProvider";

function storeSays(yearly: string, monthly = yearly) {
  eligibilityMock.mockResolvedValue({
    [APPLE_PRODUCT_IDS.monthly]: monthly,
    [APPLE_PRODUCT_IDS.yearly]: yearly,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  profileMock.mockReturnValue({});
  enabledMock.mockReturnValue(true);
});

describe("useProCtaLabel", () => {
  it("offers the trial to a new account the App Store will give it to", async () => {
    storeSays("eligible");
    const { result } = renderHook(() => useProCtaLabel());
    await waitFor(() => expect(eligibilityMock).toHaveBeenCalled());
    expect(result.current).toBe("Try Pro free");
  });

  it("says See Pro when the App Store won't give this Apple ID the trial", async () => {
    storeSays("ineligible");
    const { result } = renderHook(() => useProCtaLabel());
    await waitFor(() => expect(result.current).toBe("See Pro"));
  });

  it("asks about the plan the Pro page opens on, the yearly", async () => {
    storeSays("eligible", "ineligible");
    const { result } = renderHook(() => useProCtaLabel());
    await waitFor(() => expect(eligibilityMock).toHaveBeenCalled());
    expect(result.current).toBe("Try Pro free");
  });

  it("leaves the account's record to decide when the store can't tell", async () => {
    storeSays("unknown");
    const { result } = renderHook(() => useProCtaLabel());
    await waitFor(() => expect(eligibilityMock).toHaveBeenCalled());
    expect(result.current).toBe("Try Pro free");
  });

  it("says See Pro once the account has had its trial, whatever the store says", async () => {
    profileMock.mockReturnValue({ hasUsedTrial: true });
    storeSays("eligible");
    const { result } = renderHook(() => useProCtaLabel());
    await waitFor(() => expect(eligibilityMock).toHaveBeenCalled());
    expect(result.current).toBe("See Pro");
  });

  it("counts a lapsed onboarding free week as the trial", () => {
    enabledMock.mockReturnValue(false);
    profileMock.mockReturnValue({ trialExpiresAt: "2020-01-01T00:00:00Z" });
    const { result } = renderHook(() => useProCtaLabel());
    expect(result.current).toBe("See Pro");
  });

  it("on the web, asks no store and offers the trial from the record", () => {
    enabledMock.mockReturnValue(false);
    const { result } = renderHook(() => useProCtaLabel());
    expect(result.current).toBe("Try Pro free");
    expect(eligibilityMock).not.toHaveBeenCalled();
  });
});
