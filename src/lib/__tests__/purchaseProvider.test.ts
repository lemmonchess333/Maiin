// @vitest-environment jsdom — needs window.location and navigator; the rest of this directory runs in the fast node environment (audit batch 2).
/**
 * purchaseProvider — which store a purchase, a restore and "Manage
 * subscription" go to.
 *
 * The iPad bug this pins: `isNativeIOS()` used to test the user agent for
 * iPhone|iPad|iPod. An iPad's WKWebView reports a DESKTOP Mac user agent
 * (Capacitor's default content mode, "recommended", is desktop-class on
 * iPad), so inside the iOS app on an iPad every purchase took the Stripe
 * path, Restore was hidden and the paywall printed the web's renewal
 * wording. App Review runs the iPhone build on an iPad as well, so that is
 * the device the review would have found it on.
 *
 * The platform now comes from Capacitor's native bridge, which says "ios"
 * on an iPhone and an iPad alike and "web" in mobile Safari.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const platform = vi.fn<() => string>(() => "web");
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => platform(),
    isNativePlatform: () => platform() !== "web",
  },
}));

vi.mock("@/lib/firebase", () => ({ functions: {} }));
const syncEntitlement = vi.fn(async () => ({ data: {} }));
vi.mock("firebase/functions", () => ({
  httpsCallable: () => syncEntitlement,
}));

const rcEnabled = vi.fn(() => true);
const rcPurchase = vi.fn();
const rcRestore = vi.fn();
const rcGetLocalizedPrices = vi.fn();
vi.mock("@/lib/revenuecat", () => ({
  isRevenueCatEnabled: () => rcEnabled(),
  rcPurchase: (...args: unknown[]) => rcPurchase(...args),
  rcRestore: () => rcRestore(),
  rcGetLocalizedPrices: () => rcGetLocalizedPrices(),
}));

import {
  APPLE_PRODUCT_IDS,
  isNativeIOS,
  manageSubscription,
  purchase,
  reportTrialPrice,
  restorePurchases,
} from "../purchaseProvider";

/** What Safari and WKWebView report on an iPad (desktop-class browsing). */
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)";
const IPHONE_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";

function onDevice(shell: "ios" | "android" | "web", userAgent: string) {
  platform.mockReturnValue(shell);
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(userAgent);
}

const realLocation = window.location;
const fetchSpy = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  rcEnabled.mockReturnValue(true);
  vi.stubGlobal("fetch", fetchSpy);
  // purchase / manage navigate by assigning location.href; jsdom cannot
  // navigate, so the page's location is a plain object for these tests.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...realLocation, href: realLocation.href },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: realLocation,
  });
});

describe("isNativeIOS — the shell, not the user agent", () => {
  it("is true on an iPad in the iOS app, whose user agent reads as a Mac", () => {
    onDevice("ios", IPAD_UA);
    expect(isNativeIOS()).toBe(true);
  });

  it("is true on an iPhone in the iOS app", () => {
    onDevice("ios", IPHONE_SAFARI_UA);
    expect(isNativeIOS()).toBe(true);
  });

  it("is false in mobile Safari on an iPhone (the web build)", () => {
    onDevice("web", IPHONE_SAFARI_UA);
    expect(isNativeIOS()).toBe(false);
  });

  it("is false in the Android shell", () => {
    onDevice("android", ANDROID_UA);
    expect(isNativeIOS()).toBe(false);
  });
});

describe("on an iPad in the iOS app", () => {
  beforeEach(() => onDevice("ios", IPAD_UA));

  it("a purchase goes to the App Store, not Stripe", async () => {
    rcPurchase.mockResolvedValue({ success: true, isProActive: true });

    const result = await purchase("yearly", "uid-1", "a@example.com", {
      withTrial: true,
    });

    expect(result).toEqual({ success: true });
    expect(rcPurchase).toHaveBeenCalledWith(APPLE_PRODUCT_IDS.yearly);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends the price Apple showed to the sync, for the trial reminder's email", async () => {
    rcPurchase.mockResolvedValue({
      success: true,
      isProActive: true,
      price: { priceString: "£34.99", price: 34.99, currencyCode: "GBP" },
    });
    await purchase("yearly", "uid-1", "a@example.com");
    expect(syncEntitlement).toHaveBeenCalledWith({
      price: {
        productId: APPLE_PRODUCT_IDS.yearly,
        amount: 34.99,
        currencyCode: "GBP",
        display: "£34.99",
      },
    });

    syncEntitlement.mockClear();
    rcPurchase.mockResolvedValue({ success: true, isProActive: true });
    await purchase("yearly", "uid-1", "a@example.com");
    expect(syncEntitlement).toHaveBeenCalledWith({});
  });

  it("fills in a trial's missing price from the store's own prices", async () => {
    rcGetLocalizedPrices.mockResolvedValue({
      [APPLE_PRODUCT_IDS.monthly]: {
        priceString: "$4.99",
        price: 4.99,
        currencyCode: "USD",
      },
    });
    expect(await reportTrialPrice(APPLE_PRODUCT_IDS.monthly)).toBe(true);
    expect(syncEntitlement).toHaveBeenCalledWith({
      price: {
        productId: APPLE_PRODUCT_IDS.monthly,
        amount: 4.99,
        currencyCode: "USD",
        display: "$4.99",
      },
    });

    syncEntitlement.mockClear();
    expect(await reportTrialPrice("com.other.product")).toBe(false);
    expect(syncEntitlement).not.toHaveBeenCalled();
  });

  it("Restore restores through the App Store", async () => {
    rcRestore.mockResolvedValue({ success: true, isProActive: true });

    expect(await restorePurchases()).toEqual({ success: true });
    expect(rcRestore).toHaveBeenCalledTimes(1);
  });

  it("Manage subscription opens Apple's subscriptions page", async () => {
    const result = await manageSubscription("uid-1");

    expect(result).toEqual({
      success: true,
      redirectUrl: "https://apps.apple.com/account/subscriptions",
    });
    expect(window.location.href).toBe(
      "https://apps.apple.com/account/subscriptions"
    );
  });
});

describe("in mobile Safari on an iPhone (the web build)", () => {
  beforeEach(() => onDevice("web", IPHONE_SAFARI_UA));

  it("a purchase goes to Stripe Checkout, not the App Store", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://checkout.stripe.test/session" }),
    });

    const result = await purchase("monthly", "uid-1", "a@example.com");

    expect(result).toEqual({ success: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe("https://checkout.stripe.test/session");
    expect(rcPurchase).not.toHaveBeenCalled();
  });

  it("Restore says it is an iOS action", async () => {
    expect(await restorePurchases()).toEqual({
      success: false,
      error: "Restore is only available on iOS.",
    });
    expect(rcRestore).not.toHaveBeenCalled();
  });
});
