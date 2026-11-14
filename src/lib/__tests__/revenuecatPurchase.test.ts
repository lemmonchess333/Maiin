import { describe, it, expect, vi, beforeEach } from "vitest";
import { capacitorPlugin } from "@/test/capacitorPlugin";

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
  getAppUserID: vi.fn(),
  logIn: vi.fn(),
  logOut: vi.fn(),
  getOfferings: vi.fn(),
  purchasePackage: vi.fn(),
  restorePurchases: vi.fn(),
};

vi.mock("@revenuecat/purchases-capacitor", () => {
  return { Purchases: capacitorPlugin(mockPurchases) };
});

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
}));

const PID = "com.tropos.app.pro.monthly";
/** The signed-in account, as RevenueCat's App User ID (ADR-0006). */
const UID = "u1";

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
  // RevenueCat is this account unless a test says otherwise.
  mockPurchases.getAppUserID.mockResolvedValue({ appUserID: UID });
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

    const outcome = await rcPurchase(PID, UID);
    // The price goes to the server for the trial reminder's email.
    expect(outcome).toEqual({
      kind: "bought",
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

    expect(await rcPurchase(PID, UID)).toEqual({ kind: "cancelled" });
  });

  it("a failed purchase says so in the app's words, and keeps the SDK's for the log", async () => {
    mockPurchases.getOfferings.mockResolvedValue(
      offeringsWith([{ product: { identifier: PID, priceString: "£3.99" } }])
    );
    mockPurchases.purchasePackage.mockRejectedValue(
      new Error("There was a problem with the App Store.")
    );
    const { rcPurchase } = await loadModule();

    expect(await rcPurchase(PID, UID)).toEqual({
      kind: "failed",
      message: "Couldn’t complete the purchase. Try again.",
      detail: "There was a problem with the App Store.",
    });
  });

  it("fails plainly when the product is missing from the current offering", async () => {
    mockPurchases.getOfferings.mockResolvedValue(offeringsWith([]));
    const { rcPurchase } = await loadModule();

    const outcome = await rcPurchase(PID, UID);
    expect(outcome).toEqual({
      kind: "failed",
      message: "This plan isn’t available right now. Try again later.",
    });
    expect(mockPurchases.purchasePackage).not.toHaveBeenCalled();
  });

  it("a purchase the store took without Pro yet is pending, not failed", async () => {
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
      customerInfo: proInactiveInfo,
    });
    const { rcPurchase } = await loadModule();

    // No `error`: "Couldn't complete the purchase. Try again." would ask the person to
    // pay for something the store already has. The price still goes out,
    // for the sync that asks RevenueCat again.
    const outcome = await rcPurchase(PID, UID);
    expect(outcome).toEqual({
      kind: "pending",
      pending: "entitlement",
      price: { priceString: "£3.99", price: 3.99, currencyCode: "GBP" },
    });
  });

  it("a payment held for approval is pending, not failed", async () => {
    mockPurchases.getOfferings.mockResolvedValue(
      offeringsWith([{ product: { identifier: PID, priceString: "£3.99" } }])
    );
    // What the plugin rejects with when Ask to Buy holds the payment.
    mockPurchases.purchasePackage.mockRejectedValue(
      Object.assign(new Error("The payment is pending."), { code: "20" })
    );
    const { rcPurchase } = await loadModule();

    const outcome = await rcPurchase(PID, UID);
    expect(outcome).toEqual({ kind: "pending", pending: "approval" });
  });

  it("reads the pending code the SDK really uses", async () => {
    // The plugin re-exports this package's list; the plugin itself cannot
    // load here, where @capacitor/core is a double.
    const sdk = await vi.importActual<
      typeof import("@revenuecat/purchases-capacitor")
    >("@revenuecat/purchases-typescript-internal-esm");
    mockPurchases.getOfferings.mockResolvedValue(
      offeringsWith([{ product: { identifier: PID, priceString: "£3.99" } }])
    );
    mockPurchases.purchasePackage.mockRejectedValue(
      Object.assign(new Error("The payment is pending."), {
        code: sdk.PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR,
      })
    );
    const { rcPurchase } = await loadModule();

    expect(await rcPurchase(PID, UID)).toEqual({
      kind: "pending",
      pending: "approval",
    });
  });

  it("any other store error is still a failure", async () => {
    mockPurchases.getOfferings.mockResolvedValue(
      offeringsWith([{ product: { identifier: PID, priceString: "£3.99" } }])
    );
    mockPurchases.purchasePackage.mockRejectedValue(
      Object.assign(new Error("There was a problem with the App Store."), {
        code: "2",
      })
    );
    const { rcPurchase } = await loadModule();

    expect(await rcPurchase(PID, UID)).toMatchObject({
      kind: "failed",
      message: "Couldn’t complete the purchase. Try again.",
    });
  });

  it("is a guarded no-op without the public key", async () => {
    vi.stubEnv("VITE_REVENUECAT_IOS_KEY", "");
    const { rcPurchase, isRevenueCatEnabled } = await loadModule();

    expect(isRevenueCatEnabled()).toBe(false);
    const outcome = await rcPurchase(PID, UID);
    expect(outcome.kind).toBe("failed");
    expect(mockPurchases.getOfferings).not.toHaveBeenCalled();
  });
});

/**
 * App1 Q20: the sheet opens only once RevenueCat is the account buying.
 * A failed log-in at sign-in left it on an anonymous id, and a purchase
 * made then did not reach the account (`docs/state-machines.md`).
 */
describe("rcPurchase — the account before the sheet", () => {
  const ANONYMOUS = "$RCAnonymousID:1234";

  beforeEach(() => {
    mockPurchases.getOfferings.mockResolvedValue(
      offeringsWith([{ product: { identifier: PID, priceString: "£3.99" } }])
    );
    mockPurchases.purchasePackage.mockResolvedValue({
      customerInfo: proActiveInfo,
    });
  });

  it("buys at once when RevenueCat is already this account", async () => {
    const { rcPurchase } = await loadModule();
    expect((await rcPurchase(PID, UID)).kind).toBe("bought");
    expect(mockPurchases.logIn).not.toHaveBeenCalled();
  });

  it("sets RevenueCat up as this account when it never was", async () => {
    const { rcPurchase } = await loadModule();
    await rcPurchase(PID, UID);
    expect(mockPurchases.configure).toHaveBeenCalledExactlyOnceWith({
      apiKey: "appl_test_key",
      appUserID: UID,
    });
  });

  it("logs an anonymous RevenueCat in as this account first, then buys", async () => {
    mockPurchases.getAppUserID
      .mockResolvedValueOnce({ appUserID: ANONYMOUS })
      .mockResolvedValueOnce({ appUserID: UID });
    const { rcPurchase } = await loadModule();

    expect((await rcPurchase(PID, UID)).kind).toBe("bought");
    expect(mockPurchases.logIn).toHaveBeenCalledExactlyOnceWith({
      appUserID: UID,
    });
    expect(mockPurchases.logIn.mock.invocationCallOrder[0]).toBeLessThan(
      mockPurchases.purchasePackage.mock.invocationCallOrder[0]
    );
  });

  it("never opens the sheet while RevenueCat stays anonymous", async () => {
    mockPurchases.getAppUserID.mockResolvedValue({ appUserID: ANONYMOUS });
    const { rcPurchase } = await loadModule();

    expect(await rcPurchase(PID, UID)).toEqual({
      kind: "failed",
      message: "Couldn’t start checkout. Try again.",
      detail: "RevenueCat is not signed in as this account",
    });
    expect(mockPurchases.purchasePackage).not.toHaveBeenCalled();
    expect(mockPurchases.getOfferings).not.toHaveBeenCalled();
  });

  it("never opens the sheet when the log-in fails", async () => {
    mockPurchases.getAppUserID.mockResolvedValue({ appUserID: "someone-else" });
    mockPurchases.logIn.mockRejectedValueOnce(new Error("offline"));
    const { rcPurchase } = await loadModule();

    expect((await rcPurchase(PID, UID)).kind).toBe("failed");
    expect(mockPurchases.purchasePackage).not.toHaveBeenCalled();
  });

  it("never opens the sheet when RevenueCat could not be set up", async () => {
    mockPurchases.configure.mockRejectedValueOnce(new Error("SDK unavailable"));
    const { rcPurchase } = await loadModule();

    expect((await rcPurchase(PID, UID)).kind).toBe("failed");
    expect(mockPurchases.purchasePackage).not.toHaveBeenCalled();
  });
});

describe("rcRestore", () => {
  it("a failed restore says so in the app's words", async () => {
    mockPurchases.restorePurchases.mockRejectedValue(
      new Error("Error performing request.")
    );
    const { rcRestore } = await loadModule();

    const outcome = await rcRestore();
    expect(outcome.error).toBe("Couldn’t restore your purchases.");
    expect(outcome.detail).toBe("Error performing request.");
  });

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
