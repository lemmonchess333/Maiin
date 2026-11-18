/**
 * "Try Pro free" only while a trial is on the table (Guideline 3.1.2(a)).
 *
 * The button used to read the account's record alone, so an Apple ID that
 * had the trial under another Tropos account, as App Review's sandbox
 * accounts often have, was told "free" and then shown a price. The App
 * Store's answer, the one the paywall already asks, now takes it off.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

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
import { forgetStoreTrialEligibility } from "../useStoreTrialEligibility";
import { APPLE_PRODUCT_IDS } from "@/lib/purchaseProvider";

function cleanupAndForget() {
  forgetStoreTrialEligibility();
  eligibilityMock.mockReset();
}

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
  forgetStoreTrialEligibility();
});

/** Let the store's answer reach the hook's state before reading it, so a
 *  label read here is the one after the answer, not the one before. */
async function answered() {
  await waitFor(() => expect(eligibilityMock).toHaveBeenCalled());
  await act(async () => {});
}

describe("useProCtaLabel", () => {
  it("offers the trial to a new account the App Store will give it to", async () => {
    storeSays("eligible");
    const { result } = renderHook(() => useProCtaLabel());
    await answered();
    expect(result.current).toBe("Try Pro free");
  });

  it("says See Pro when the App Store won't give this Apple ID the trial", async () => {
    storeSays("ineligible");
    const { result } = renderHook(() => useProCtaLabel());
    await waitFor(() => expect(result.current).toBe("See Pro"));
  });

  it("asks about the plan the Pro page opens on, the yearly", async () => {
    // Yearly says no, monthly yes: the button leads to the yearly plan.
    storeSays("ineligible", "eligible");
    const { result } = renderHook(() => useProCtaLabel());
    await waitFor(() => expect(result.current).toBe("See Pro"));
    cleanupAndForget();
    // And the other way round, the yearly's yes wins.
    storeSays("eligible", "ineligible");
    const again = renderHook(() => useProCtaLabel());
    await answered();
    expect(again.result.current).toBe("Try Pro free");
  });

  it("leaves the account's record to decide when the store can't tell", async () => {
    storeSays("unknown");
    const { result } = renderHook(() => useProCtaLabel());
    await answered();
    expect(result.current).toBe("Try Pro free");
  });

  it("says See Pro once the account has had its trial, whatever the store says", async () => {
    profileMock.mockReturnValue({ hasUsedTrial: true });
    storeSays("eligible");
    const { result } = renderHook(() => useProCtaLabel());
    await answered();
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
