/**
 * ProModal — paywall behaviour tests.
 *
 * Pins the conversion-critical contract after the unification:
 *   - Renders visible copy (no white-on-white regression)
 *   - Plan tiles are a proper radiogroup with role=radio + aria-checked
 *   - Default-selected plan is the recommended plan (yearly)
 *   - initialPlan="monthly" opens with Monthly pre-selected
 *   - Tapping a tile updates aria-checked AND the CTA copy AND the
 *     disclosure copy
 *   - Checkout receives the selected plan (test-pinned both for
 *     the default and after a tile switch)
 *   - featureKey="adaptive_tdee" renders the registry's title
 *   - Restore-purchases is hidden on web, shown on native iOS
 *   - Checkout failure surfaces an inline role="alert" above the CTA
 *   - Close button has an accessible name and fires onClose
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Sub1a P1 — tests below vary `profile.hasUsedTrial` to exercise the
// trial vs no-trial CTA paths. The hoisted ref pattern (mirroring
// purchaseMock below) lets each test override the profile shape via
// authProfileMock.mockReturnValueOnce(...).
const authProfileMock = vi.fn<() => Record<string, unknown> | null>(() => null);

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "test-uid", email: "test@example.com" },
    profile: authProfileMock(),
    loading: false,
  }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const purchaseMock = vi.fn();
const restoreMock = vi.fn();
const isNativeIOSMock = vi.fn();

vi.mock("@/lib/purchaseProvider", () => ({
  purchase: (...args: unknown[]) => purchaseMock(...args),
  restorePurchases: (...args: unknown[]) => restoreMock(...args),
  isNativeIOS: () => isNativeIOSMock(),
}));

import ProModal from "../ProModal";

function renderModal(props: Parameters<typeof ProModal>[0]) {
  return render(
    <MemoryRouter initialEntries={["/upgrade"]}>
      <ProModal {...props} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  purchaseMock.mockReset();
  restoreMock.mockReset();
  isNativeIOSMock.mockReset();
  authProfileMock.mockReset();
  // Default: web (most common case)
  isNativeIOSMock.mockReturnValue(false);
  // Sub1a P1 — default profile to a post-trial user so the
  // plan-priced "Start Pro — £X" CTA is the rendered baseline.
  // Pre-#P1 tests in this file all expect the priced CTA. Trial-
  // eligibility cycles explicitly set `hasUsedTrial: false` or
  // `null` to cover the trial path.
  authProfileMock.mockReturnValue({ hasUsedTrial: true });
});

afterEach(cleanup);

describe("ProModal — visible copy (no white-on-white regression)", () => {
  it("renders the visible hero title with text-foreground (not text-white)", () => {
    // "Upgrade to Pro" appears twice in the rendered DOM: as the
    // sr-only Drawer.Title and as the visible h2 hero. Target the
    // visible one by filtering to the non-sr-only heading.
    renderModal({ onClose: () => {} });
    const headings = screen.getAllByRole("heading", { name: "Upgrade to Pro" });
    const visible = headings.find((h) => !h.className.includes("sr-only"));
    expect(visible).toBeTruthy();
    expect(visible!.className).toContain("text-foreground");
    expect(visible!.className).not.toContain("text-white");
  });

  it("renders the feature list labels as visible text", () => {
    renderModal({ onClose: () => {} });
    expect(screen.getByText("Performance Engine")).toBeTruthy();
    expect(screen.getByText("Unlimited AI food photo logging")).toBeTruthy();
    expect(screen.getByText("Adaptive macros")).toBeTruthy();
    expect(screen.getByText("Advanced insights")).toBeTruthy();
  });
});

describe("ProModal — plan radiogroup", () => {
  it("renders the plan radiogroup with both plans", () => {
    renderModal({ onClose: () => {} });
    const group = screen.getByRole("radiogroup", { name: /billing plan/i });
    expect(group).toBeTruthy();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
  });

  it("yearly is selected by default (recommended plan)", () => {
    renderModal({ onClose: () => {} });
    const radios = screen.getAllByRole("radio");
    const yearly = radios.find((r) => r.textContent?.includes("Yearly"));
    const monthly = radios.find((r) => r.textContent?.includes("Monthly"));
    expect(yearly?.getAttribute("aria-checked")).toBe("true");
    expect(monthly?.getAttribute("aria-checked")).toBe("false");
  });

  it("tapping Monthly updates aria-checked", () => {
    renderModal({ onClose: () => {} });
    const radios = screen.getAllByRole("radio");
    const monthly = radios.find((r) => r.textContent?.includes("Monthly"))!;
    fireEvent.click(monthly);
    expect(monthly.getAttribute("aria-checked")).toBe("true");
    const yearly = radios.find((r) => r.textContent?.includes("Yearly"))!;
    expect(yearly.getAttribute("aria-checked")).toBe("false");
  });

  it("CTA copy updates to reflect the selected plan's price", () => {
    renderModal({ onClose: () => {} });
    expect(screen.getByText("Start Pro — £34.99/yr")).toBeTruthy();
    const radios = screen.getAllByRole("radio");
    const monthly = radios.find((r) => r.textContent?.includes("Monthly"))!;
    fireEvent.click(monthly);
    expect(screen.getByText("Start Pro — £3.99/mo")).toBeTruthy();
  });

  it("disclosure copy updates to reflect the billing frequency", () => {
    renderModal({ onClose: () => {} });
    expect(screen.getByText(/Renews annually/)).toBeTruthy();
    const radios = screen.getAllByRole("radio");
    const monthly = radios.find((r) => r.textContent?.includes("Monthly"))!;
    fireEvent.click(monthly);
    expect(screen.getByText(/Renews monthly/)).toBeTruthy();
  });
});

describe("ProModal — initialPlan", () => {
  it("opens with Monthly pre-selected when initialPlan='monthly'", () => {
    renderModal({ onClose: () => {}, initialPlan: "monthly" });
    const radios = screen.getAllByRole("radio");
    const monthly = radios.find((r) => r.textContent?.includes("Monthly"));
    const yearly = radios.find((r) => r.textContent?.includes("Yearly"));
    expect(monthly?.getAttribute("aria-checked")).toBe("true");
    expect(yearly?.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("Start Pro — £3.99/mo")).toBeTruthy();
  });

  it("opens with Yearly pre-selected when initialPlan='yearly'", () => {
    renderModal({ onClose: () => {}, initialPlan: "yearly" });
    const radios = screen.getAllByRole("radio");
    const yearly = radios.find((r) => r.textContent?.includes("Yearly"));
    expect(yearly?.getAttribute("aria-checked")).toBe("true");
  });

  it("falls back to DEFAULT_PLAN (yearly) when initialPlan is omitted", () => {
    renderModal({ onClose: () => {} });
    expect(screen.getByText("Start Pro — £34.99/yr")).toBeTruthy();
  });
});

describe("ProModal — feature-specific hero", () => {
  it("renders the registry's title for featureKey='adaptive_tdee'", () => {
    renderModal({ onClose: () => {}, featureKey: "adaptive_tdee" });
    // Visible hero h2 should match the registry's `title` value —
    // pre-unification this used to silently fall back to the generic
    // "Upgrade to Pro" hero because the lookup key didn't match.
    const headings = screen.getAllByRole("heading", {
      name: "Unlock Adaptive TDEE",
    });
    const visible = headings.find((h) => !h.className.includes("sr-only"));
    expect(visible).toBeTruthy();
  });

  // Sub2 (Pro scope shrinkage): performance_engine + advanced_insights
  // removed from the registry. PI + insights are free for everyone;
  // a featureKey value of those strings would now fail at compile
  // time. The remaining Pro keys (adaptive_tdee covered above) carry
  // the registry-title contract.
});

describe("ProModal — checkout", () => {
  it("calls purchase() with the currently-selected plan on CTA tap", async () => {
    purchaseMock.mockResolvedValueOnce({ success: true });
    renderModal({ onClose: () => {} });
    fireEvent.click(screen.getByRole("button", { name: /Start Pro/ }));
    await waitFor(() => {
      expect(purchaseMock).toHaveBeenCalledTimes(1);
    });
    // First arg is plan id; remaining args carry uid, email, options.
    expect(purchaseMock.mock.calls[0][0]).toBe("yearly");
    expect(purchaseMock.mock.calls[0][1]).toBe("test-uid");
  });

  it("calls purchase() with monthly after the user switches plan", async () => {
    purchaseMock.mockResolvedValueOnce({ success: true });
    renderModal({ onClose: () => {} });
    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios.find((r) => r.textContent?.includes("Monthly"))!);
    fireEvent.click(screen.getByRole("button", { name: /Start Pro/ }));
    await waitFor(() => {
      expect(purchaseMock).toHaveBeenCalledTimes(1);
    });
    expect(purchaseMock.mock.calls[0][0]).toBe("monthly");
  });

  it("surfaces an inline error when purchase() fails", async () => {
    purchaseMock.mockResolvedValueOnce({
      success: false,
      error: "Card declined.",
    });
    renderModal({ onClose: () => {} });
    fireEvent.click(screen.getByRole("button", { name: /Start Pro/ }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Card declined.");
  });
});

describe("ProModal — Sub1a P1 trial CTA", () => {
  it("Cycle 5 (tracer): free user with hasUsedTrial=false sees 'Start your 7-day free trial' CTA", () => {
    authProfileMock.mockReturnValue({ hasUsedTrial: false });
    renderModal({ onClose: () => {} });
    expect(
      screen.getByRole("button", { name: /Start your 7-day free trial/ })
    ).toBeTruthy();
  });

  it("Cycle 6: user with hasUsedTrial=true sees standard 'Start Pro — £X/mo' CTA (no trial language)", () => {
    authProfileMock.mockReturnValue({ hasUsedTrial: true });
    renderModal({ onClose: () => {} });
    const ctaButton = screen.getByRole("button", { name: /Start Pro/ });
    expect(ctaButton).toBeTruthy();
    expect(ctaButton.textContent).not.toMatch(/free trial/i);
    expect(ctaButton.textContent).not.toMatch(/7-day/i);
  });

  it("Cycle 7: tapping the trial CTA passes withTrial=true to purchase()", async () => {
    authProfileMock.mockReturnValue({ hasUsedTrial: false });
    purchaseMock.mockResolvedValueOnce({ success: true });
    renderModal({ onClose: () => {} });
    fireEvent.click(
      screen.getByRole("button", { name: /Start your 7-day free trial/ })
    );
    await waitFor(() => {
      expect(purchaseMock).toHaveBeenCalledTimes(1);
    });
    const callArgs = purchaseMock.mock.calls[0];
    // Signature: purchase(plan, uid, email, options)
    expect(callArgs[3]).toBeTruthy();
    expect((callArgs[3] as { withTrial?: boolean }).withTrial).toBe(true);
  });

  it("Cycle 8: tapping the no-trial CTA passes withTrial=false to purchase()", async () => {
    authProfileMock.mockReturnValue({ hasUsedTrial: true });
    purchaseMock.mockResolvedValueOnce({ success: true });
    renderModal({ onClose: () => {} });
    fireEvent.click(screen.getByRole("button", { name: /Start Pro/ }));
    await waitFor(() => {
      expect(purchaseMock).toHaveBeenCalledTimes(1);
    });
    const callArgs = purchaseMock.mock.calls[0];
    expect(callArgs[3]).toBeTruthy();
    expect((callArgs[3] as { withTrial?: boolean }).withTrial).toBe(false);
  });

  it("Cycle 8 guard: missing profile (cold-start) defaults to trial CTA (treats unknown as never-used)", () => {
    // Lock-out defence: if the profile hasn't loaded yet, surface
    // the more generous offer rather than silently downgrading. The
    // server-side `hasUsedTrial` check is authoritative — a stale
    // client offer can't bypass the lifetime-trial guard.
    authProfileMock.mockReturnValue(null);
    renderModal({ onClose: () => {} });
    expect(
      screen.getByRole("button", { name: /Start your 7-day free trial/ })
    ).toBeTruthy();
  });
});

describe("ProModal — restore purchases visibility", () => {
  it("hides Restore purchases on web (where restore is a no-op)", () => {
    isNativeIOSMock.mockReturnValue(false);
    renderModal({ onClose: () => {} });
    expect(screen.queryByText("Restore purchases")).toBeNull();
  });

  it("shows Restore purchases on native iOS", () => {
    isNativeIOSMock.mockReturnValue(true);
    renderModal({ onClose: () => {} });
    expect(screen.getByText("Restore purchases")).toBeTruthy();
  });
});

describe("ProModal — close button", () => {
  it("close button has an accessible name", () => {
    renderModal({ onClose: () => {} });
    expect(
      screen.getByRole("button", { name: /Close upgrade modal/i })
    ).toBeTruthy();
  });

  it("close button calls onClose", () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.click(
      screen.getByRole("button", { name: /Close upgrade modal/i })
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
