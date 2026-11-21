/**
 * ProModal on the iPhone prints only the App Store's prices (launch audit,
 * 2026-11-18; Guideline 3.1.2). While they are on their way, and after
 * they could not be read, it shows no price and no checkout, and keeps the
 * ways out: the close button, Restore and the legal links.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ProPlan } from "@/lib/proPlans";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "test-uid", email: "test@example.com" },
    profile: { hasUsedTrial: false },
    loading: false,
  }),
  useUid: () => "test-uid",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/purchaseProvider", () => ({
  purchase: vi.fn(),
  restorePurchases: vi.fn(),
  isNativeIOS: () => true,
  canSellInThisBuild: () => true,
}));
vi.mock("@/hooks/useStoreTrialEligibility", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/hooks/useStoreTrialEligibility")
  >()),
  useStoreTrialEligibility: () => null,
}));

const plansMock = vi.fn<() => ProPlan[] | null>(() => null);
const failedMock = vi.fn(() => false);
const retryMock = vi.fn();
vi.mock("@/hooks/useProPlanPrices", () => ({
  useProPlanPrices: () => ({
    plans: plansMock(),
    failed: failedMock(),
    retry: retryMock,
  }),
}));

const trackMock = vi.fn();
vi.mock("@/lib/paywallAnalytics", () => ({
  track: (...args: unknown[]) => trackMock(...args),
}));

import ProModal from "../ProModal";

function renderModal() {
  return render(
    <MemoryRouter initialEntries={["/food"]}>
      <ProModal onClose={() => {}} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  plansMock.mockReturnValue(null);
  failedMock.mockReturnValue(false);
  retryMock.mockReset();
  trackMock.mockReset();
});
afterEach(cleanup);

describe("ProModal on the iPhone, before the App Store's prices", () => {
  it("prints no price and offers no checkout, and keeps the ways out", () => {
    const { container } = renderModal();
    expect(screen.getByText("Getting prices from the App Store")).toBeTruthy();
    expect(container.textContent).not.toMatch(/£/);
    expect(screen.queryByRole("button", { name: /^Start/ })).toBeNull();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(
      screen.getByRole("button", { name: "Close upgrade modal" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Restore purchases" })
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /^Terms/ })).toBeTruthy();
  });

  it("says when they couldn't be read, asks again on Try again, and counts it", () => {
    failedMock.mockReturnValue(true);
    const { container } = renderModal();
    expect(
      screen.getByText("Couldn’t get prices from the App Store.")
    ).toBeTruthy();
    expect(container.textContent).not.toMatch(/£/);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retryMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith(
      "paywall_prices_failed",
      expect.objectContaining({ platform: "ios" })
    );
  });
});
