/**
 * The trial reminder's price, filled in when the purchase's own sync
 * missed it (Sub1, STATUS 2026-10-06): sent once per trial, only while the
 * record has none and renewal is on.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const reportTrialPrice = vi.fn(async (_productId: string) => true);
vi.mock("@/lib/purchaseProvider", () => ({
  reportTrialPrice: (productId: string) => reportTrialPrice(productId),
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

let mockProfile: Record<string, unknown> | null = null;
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ profile: mockProfile }),
}));

import { useTrialPriceReport } from "../useTrialPriceReport";

const MONTHLY = "com.tropos.app.pro.monthly";
function withTrial(overrides: Record<string, unknown> = {}) {
  return {
    subscriptionTrial: {
      productId: MONTHLY,
      endsAt: "2026-10-10T13:30:00.000Z",
      willRenew: true,
      price: null,
      ...overrides,
    },
  };
}

beforeEach(() => {
  reportTrialPrice.mockClear();
  mockProfile = null;
});

describe("useTrialPriceReport", () => {
  it("reports the store's price once for a trial recorded without one", () => {
    mockProfile = withTrial();
    const { rerender } = renderHook(() => useTrialPriceReport());
    rerender();
    mockProfile = withTrial();
    rerender();
    expect(reportTrialPrice).toHaveBeenCalledTimes(1);
    expect(reportTrialPrice).toHaveBeenCalledWith(MONTHLY);
  });

  it("reports again for a different trial", () => {
    mockProfile = withTrial();
    const { rerender } = renderHook(() => useTrialPriceReport());
    mockProfile = withTrial({ endsAt: "2026-11-10T13:30:00.000Z" });
    rerender();
    expect(reportTrialPrice).toHaveBeenCalledTimes(2);
  });

  it("sends nothing when the record has a price, when renewal is off, or without a trial", () => {
    mockProfile = withTrial({
      price: { amount: 3.99, currencyCode: "GBP", display: "£3.99" },
    });
    const { rerender } = renderHook(() => useTrialPriceReport());
    mockProfile = withTrial({ willRenew: false });
    rerender();
    mockProfile = { subscriptionTrial: null };
    rerender();
    mockProfile = null;
    rerender();
    expect(reportTrialPrice).not.toHaveBeenCalled();
  });
});
