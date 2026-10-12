/**
 * The trial reminder knows how often each product renews — and so does
 * every surface that reads the trial record.
 *
 * functions/lib/trialReminder.js names a period for each Pro product
 * (PRODUCT_PERIODS) and stores it on `subscriptionTrial.period`, which the
 * reminder email, the phone notification, Home's strip and the Upgrade page
 * all print as "every month" or "a year". The app sells the products in
 * APPLE_PRODUCT_IDS. A product missing from the server's list still gets
 * its reminder, but one that cannot say how often it charges.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

vi.mock("@/lib/firebase", () => ({ functions: {} }));
vi.mock("@/lib/revenuecat", () => ({
  isRevenueCatEnabled: () => false,
  rcPurchase: vi.fn(),
  rcRestore: vi.fn(),
  rcGetLocalizedPrices: vi.fn(),
}));

import { APPLE_PRODUCT_IDS } from "@/lib/purchaseProvider";

const require = createRequire(import.meta.url);
const server = require("../../../functions/lib/trialReminder.js");

describe("trial periods — the products the app sells", () => {
  it("names every product the app sells, with the period its plan bills", () => {
    expect(server.periodFor(APPLE_PRODUCT_IDS.monthly)).toBe("month");
    expect(server.periodFor(APPLE_PRODUCT_IDS.yearly)).toBe("year");
    expect(Object.keys(server.PRODUCT_PERIODS).sort()).toEqual(
      Object.values(APPLE_PRODUCT_IDS).sort()
    );
  });
});
