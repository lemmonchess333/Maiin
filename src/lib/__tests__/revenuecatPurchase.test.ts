import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Slice 3 (#1099) — enabled-path tests for purchase / restore / prices.
 *
 * The slice-2 file (revenuecat.test.ts) pins the web/no-key no-op guard with
 * isNativePlatform() → false; this file is its counterpart with the platform
 * mocked native and the key stubbed, so the real flows run against a plugin
 * double. revenuecat.ts reads VITE_REVENUECAT_IOS_KEY at module scope, so
 * each test stubs the env and re-imports via vi.resetModules().
 */
const mockPurchases = {
  configure: vi.fn(),
  logIn: vi.fn(),
  logOut: vi.fn(),
  getOfferings: vi.fn(),
  purchasePackage: vi.fn(),
  restorePurchases: vi.fn(),
};

vi.mock("@revenuecat/purchases-capacitor", () => ({
  Purchases: mockPurchases,
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
}));

const PID = "com.tropos.app.pro.monthly";

function offeringsWith(packages: unknown[]) {
  return { current: { availablePackages: packages } };
}

const proActiveInfo = { entitlements: { active: { pro: {} } } };
const proInactiveInfo = { entitlements: { active: {} } };

async function loadModule() {
  vi.resetModules();
  return await import("../revenuecat");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VITE_REVENUECAT_IOS_KEY", "appl_test_key");
});

describe("rcPurchase", () => {
  it("purchases the matching package and reports the active pro entitlement, with the price Apple showed", async () => {
    mockPurchases.getOfferings.mockResolvedValue(
      offeringsWith([
        {
          product: {
            identifier: PID,
            priceString: "£3.99",
            price: 3.99,
            currencyCode: "GBP",
          },
        },
      ])
    );
    mockPurchases.purchasePackage.mockResolvedValue({
      customerInfo: proActiveInfo,
    });
    const { rcPurchase } = await loadModule();

    const outcome = await rcPurchase(PID);
    // The price goes to the server for the trial reminder's email.
    expect(outcome).toEqual({
      success: true,
      isProActive: true,
      price: { priceString: "£3.99", price: 3.99, currencyCode: "GBP" },
    });
    expect(mockPurchases.purchasePackage).toHaveBeenCalledWith({
      aPackage: expect.objectContaining({
        product: expect.objectContaining({ identifier: PID }),
      }),
    });
  });

  it("treats a dismissed sheet as cancellation, not an error", async () => {
    mockPurchases.getOfferings.mockResolvedValue(
      offeringsWith([{ product: { identifier: PID, priceString: "£3.99" } }])
    );
    mockPurchases.purchasePackage.mockRejectedValue({ userCancelled: true });
    const { rcPurchase } = await loadModule();

    const outcome = await rcPurchase(PID);
    expect(outcome.userCancelled).toBe(true);
    expect(outcome.success).toBe(false);
  });

  it("fails plainly when the product is missing from the current offering", async () => {
    mockPurchases.getOfferings.mockResolvedValue(offeringsWith([]));
    const { rcPurchase } = await loadModule();

    const outcome = await rcPurchase(PID);
    expect(outcome.success).toBe(false);
    expect(outcome.error).toBeTruthy();
    expect(mockPurchases.purchasePackage).not.toHaveBeenCalled();
  });

  it("does not report success when the entitlement is absent post-purchase", async () => {
    mockPurchases.getOfferings.mockResolvedValue(
      offeringsWith([{ product: { identifier: PID, priceString: "£3.99" } }])
    );
    mockPurchases.purchasePackage.mockResolvedValue({
      customerInfo: proInactiveInfo,
    });
    const { rcPurchase } = await loadModule();

    const outcome = await rcPurchase(PID);
    expect(outcome).toEqual({ success: false, isProActive: false });
  });

  it("is a guarded no-op without the public key", async () => {
    vi.stubEnv("VITE_REVENUECAT_IOS_KEY", "");
    const { rcPurchase, isRevenueCatEnabled } = await loadModule();

    expect(isRevenueCatEnabled()).toBe(false);
    const outcome = await rcPurchase(PID);
    expect(outcome.success).toBe(false);
    expect(mockPurchases.getOfferings).not.toHaveBeenCalled();
  });
});

describe("rcRestore", () => {
  it("succeeds when restore returns an active pro entitlement", async () => {
    mockPurchases.restorePurchases.mockResolvedValue({
      customerInfo: proActiveInfo,
    });
    const { rcRestore } = await loadModule();

    expect(await rcRestore()).toEqual({ success: true, isProActive: true });
  });

  it("reports no prior purchases when the entitlement is inactive", async () => {
    mockPurchases.restorePurchases.mockResolvedValue({
      customerInfo: proInactiveInfo,
    });
    const { rcRestore } = await loadModule();

    const outcome = await rcRestore();
    expect(outcome.success).toBe(false);
    expect(outcome.error).toMatch(/no prior purchases/i);
  });
});

describe("rcGetLocalizedPrices", () => {
  it("maps product ids to Apple's price string, with the number and currency behind it", async () => {
    // The number and the currency are what the paywall works its per-week
    // figures and its saving out from; with the string alone it could only
    // do that in pounds.
    mockPurchases.getOfferings.mockResolvedValue(
      offeringsWith([
        {
          product: {
            identifier: PID,
            priceString: "$4.99",
            price: 4.99,
            currencyCode: "USD",
            pricePerWeekString: "$1.24",
          },
        },
        {
          product: {
            identifier: "com.tropos.app.pro.yearly",
            priceString: "$44.99",
            price: 44.99,
            currencyCode: "USD",
          },
        },
      ])
    );
    const { rcGetLocalizedPrices } = await loadModule();

    expect(await rcGetLocalizedPrices()).toEqual({
      [PID]: { priceString: "$4.99", price: 4.99, currencyCode: "USD" },
      "com.tropos.app.pro.yearly": {
        priceString: "$44.99",
        price: 44.99,
        currencyCode: "USD",
      },
    });
  });

  it("returns null when offerings are empty and when disabled", async () => {
    mockPurchases.getOfferings.mockResolvedValue(offeringsWith([]));
    const { rcGetLocalizedPrices } = await loadModule();
    expect(await rcGetLocalizedPrices()).toBeNull();

    vi.stubEnv("VITE_REVENUECAT_IOS_KEY", "");
    const disabled = await loadModule();
    expect(await disabled.rcGetLocalizedPrices()).toBeNull();
  });
});
