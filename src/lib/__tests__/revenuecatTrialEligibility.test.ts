import { describe, it, expect, vi, beforeEach } from "vitest";
import { capacitorPlugin } from "@/test/capacitorPlugin";
import { INTRO_ELIGIBILITY_STATUS } from "@revenuecat/purchases-typescript-internal-esm";

/**
 * The App Store's answer on the free trial (`rcTrialEligibility`), against a
 * plugin double on the native platform with the key stubbed, as
 * revenuecatPurchase.test.ts does for purchases.
 */
const mockPurchases = {
  configure: vi.fn(),
  checkTrialOrIntroductoryPriceEligibility: vi.fn(),
};

vi.mock("@revenuecat/purchases-capacitor", () => {
  return { Purchases: capacitorPlugin(mockPurchases) };
});

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
}));

const MONTHLY = "com.tropos.app.pro.monthly";
const YEARLY = "com.tropos.app.pro.yearly";

/** The module, with the SDK set up as sign-in sets it up. */
async function loadModule() {
  vi.resetModules();
  const mod = await import("../revenuecat");
  await mod.configureRevenueCat("u1");
  return mod;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VITE_REVENUECAT_IOS_KEY", "appl_test_key");
});

describe("rcTrialEligibility", () => {
  it("reads RevenueCat's statuses: no trial set up counts as none to offer", async () => {
    mockPurchases.checkTrialOrIntroductoryPriceEligibility.mockResolvedValue({
      [MONTHLY]: {
        status: INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE,
      },
      [YEARLY]: {
        status: INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_INELIGIBLE,
      },
    });
    const { rcTrialEligibility } = await loadModule();
    expect(await rcTrialEligibility([MONTHLY, YEARLY])).toEqual({
      [MONTHLY]: "eligible",
      [YEARLY]: "ineligible",
    });
    expect(
      mockPurchases.checkTrialOrIntroductoryPriceEligibility
    ).toHaveBeenCalledWith({ productIdentifiers: [MONTHLY, YEARLY] });

    mockPurchases.checkTrialOrIntroductoryPriceEligibility.mockResolvedValue({
      [MONTHLY]: {
        status:
          INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_NO_INTRO_OFFER_EXISTS,
      },
      [YEARLY]: {
        status: INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_UNKNOWN,
      },
    });
    expect(await rcTrialEligibility([MONTHLY, YEARLY])).toEqual({
      [MONTHLY]: "ineligible",
      [YEARLY]: "unknown",
    });
  });

  it("calls a product RevenueCat left out unknown", async () => {
    mockPurchases.checkTrialOrIntroductoryPriceEligibility.mockResolvedValue(
      {}
    );
    const { rcTrialEligibility } = await loadModule();
    expect(await rcTrialEligibility([MONTHLY])).toEqual({
      [MONTHLY]: "unknown",
    });
  });

  it("gives no answer when the check fails", async () => {
    mockPurchases.checkTrialOrIntroductoryPriceEligibility.mockRejectedValue(
      new Error("not configured")
    );
    const { rcTrialEligibility } = await loadModule();
    expect(await rcTrialEligibility([MONTHLY])).toBeNull();
  });

  it("waits for sign-in to set the SDK up before asking", async () => {
    // Asked before set-up, the SDK refuses, and an offer that mounted at
    // once kept "Try Pro free" for good.
    mockPurchases.checkTrialOrIntroductoryPriceEligibility.mockResolvedValue({
      [MONTHLY]: {
        status: INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_INELIGIBLE,
      },
    });
    vi.resetModules();
    const mod = await import("../revenuecat");
    const answer = mod.rcTrialEligibility([MONTHLY]);
    await Promise.resolve();
    expect(
      mockPurchases.checkTrialOrIntroductoryPriceEligibility
    ).not.toHaveBeenCalled();
    await mod.configureRevenueCat("u1");
    expect(await answer).toEqual({ [MONTHLY]: "ineligible" });
  });

  it("asks nothing without the key", async () => {
    vi.stubEnv("VITE_REVENUECAT_IOS_KEY", "");
    const { rcTrialEligibility } = await loadModule();
    expect(await rcTrialEligibility([MONTHLY])).toBeNull();
    expect(
      mockPurchases.checkTrialOrIntroductoryPriceEligibility
    ).not.toHaveBeenCalled();
  });

  it("matches RevenueCat's own status numbers", async () => {
    const { INTRO_STATUS } = await loadModule();
    expect(INTRO_STATUS).toEqual({
      ineligible: INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_INELIGIBLE,
      eligible: INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE,
      noIntroOffer:
        INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_NO_INTRO_OFFER_EXISTS,
    });
  });
});
