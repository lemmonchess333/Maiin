/**
 * ProModal — paywall behaviour tests.
 *
 * Pins the conversion-critical contract:
 *   - Renders text that's actually readable (no white-on-white)
 *   - Plan tiles are a proper radiogroup with role=radio + aria-checked
 *   - Default-selected plan is the recommended plan (yearly)
 *   - Tapping the monthly tile updates aria-checked AND the CTA copy
 *   - CTA copy reflects the currently-selected plan's price
 *   - Disclosure copy reflects the currently-selected plan's billing
 *     frequency ("monthly" vs "annually")
 *   - Restore-purchases is hidden on web (where restorePurchases()
 *     fails) — only shown on native iOS
 *   - Checkout failure surfaces an inline alert above the CTA, not
 *     just a fading toast
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "test-uid", email: "test@example.com" },
    profile: null,
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

beforeEach(() => {
  purchaseMock.mockReset();
  restoreMock.mockReset();
  isNativeIOSMock.mockReset();
  // Default: web (most common case)
  isNativeIOSMock.mockReturnValue(false);
});

afterEach(cleanup);

describe("ProModal — visible copy (no white-on-white regression)", () => {
  it("renders the visible hero title with text-foreground (not text-white)", () => {
    // The string "Upgrade to Pro" appears twice in the rendered DOM:
    // once as the sr-only Drawer.Title (BottomSheet emits it for the
    // aria-labelledby contract even when hideHeader is set), and
    // once as the visible h2 in the hero. Target the visible one
    // by filtering to the non-sr-only heading.
    render(<ProModal onClose={() => {}} />);
    const headings = screen.getAllByRole("heading", { name: "Upgrade to Pro" });
    const visible = headings.find((h) => !h.className.includes("sr-only"));
    expect(visible).toBeTruthy();
    expect(visible!.className).toContain("text-foreground");
    expect(visible!.className).not.toContain("text-white");
  });

  it("renders the feature list labels as visible text", () => {
    render(<ProModal onClose={() => {}} />);
    expect(screen.getByText("Performance Engine")).toBeTruthy();
    expect(screen.getByText("Unlimited AI food photo logging")).toBeTruthy();
    expect(screen.getByText("Adaptive macros")).toBeTruthy();
    expect(screen.getByText("Advanced insights")).toBeTruthy();
  });
});

describe("ProModal — plan radiogroup", () => {
  it("renders the plan radiogroup with both plans", () => {
    render(<ProModal onClose={() => {}} />);
    const group = screen.getByRole("radiogroup", { name: /billing plan/i });
    expect(group).toBeTruthy();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
  });

  it("yearly is selected by default (recommended plan)", () => {
    render(<ProModal onClose={() => {}} />);
    const radios = screen.getAllByRole("radio");
    const yearly = radios.find((r) => r.textContent?.includes("Yearly"));
    const monthly = radios.find((r) => r.textContent?.includes("Monthly"));
    expect(yearly?.getAttribute("aria-checked")).toBe("true");
    expect(monthly?.getAttribute("aria-checked")).toBe("false");
  });

  it("tapping Monthly updates aria-checked", () => {
    render(<ProModal onClose={() => {}} />);
    const radios = screen.getAllByRole("radio");
    const monthly = radios.find((r) => r.textContent?.includes("Monthly"))!;
    fireEvent.click(monthly);
    expect(monthly.getAttribute("aria-checked")).toBe("true");
    const yearly = radios.find((r) => r.textContent?.includes("Yearly"))!;
    expect(yearly.getAttribute("aria-checked")).toBe("false");
  });

  it("CTA copy updates to reflect the selected plan's price", () => {
    render(<ProModal onClose={() => {}} />);
    // Default = yearly
    expect(screen.getByText("Start Pro — £34.99/yr")).toBeTruthy();
    // Switch to monthly
    const radios = screen.getAllByRole("radio");
    const monthly = radios.find((r) => r.textContent?.includes("Monthly"))!;
    fireEvent.click(monthly);
    expect(screen.getByText("Start Pro — £3.99/mo")).toBeTruthy();
  });

  it("disclosure copy updates to reflect the billing frequency", () => {
    render(<ProModal onClose={() => {}} />);
    // Default = yearly → "annually"
    expect(screen.getByText(/Renews annually/)).toBeTruthy();
    // Switch to monthly → "monthly"
    const radios = screen.getAllByRole("radio");
    const monthly = radios.find((r) => r.textContent?.includes("Monthly"))!;
    fireEvent.click(monthly);
    expect(screen.getByText(/Renews monthly/)).toBeTruthy();
  });
});

describe("ProModal — checkout", () => {
  it("calls purchase() with the currently-selected plan on CTA tap", async () => {
    purchaseMock.mockResolvedValueOnce({ success: true });
    render(<ProModal onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Start Pro/ }));
    await waitFor(() => {
      expect(purchaseMock).toHaveBeenCalledTimes(1);
    });
    expect(purchaseMock).toHaveBeenCalledWith("yearly", "test-uid", "test@example.com");
  });

  it("calls purchase() with monthly after the user switches plan", async () => {
    purchaseMock.mockResolvedValueOnce({ success: true });
    render(<ProModal onClose={() => {}} />);
    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios.find((r) => r.textContent?.includes("Monthly"))!);
    fireEvent.click(screen.getByRole("button", { name: /Start Pro/ }));
    await waitFor(() => {
      expect(purchaseMock).toHaveBeenCalledTimes(1);
    });
    expect(purchaseMock).toHaveBeenCalledWith("monthly", "test-uid", "test@example.com");
  });

  it("surfaces an inline error when purchase() fails", async () => {
    purchaseMock.mockResolvedValueOnce({
      success: false,
      error: "Card declined.",
    });
    render(<ProModal onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Start Pro/ }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Card declined.");
  });
});

describe("ProModal — restore purchases visibility", () => {
  it("hides Restore purchases on web (where restore is a no-op)", () => {
    isNativeIOSMock.mockReturnValue(false);
    render(<ProModal onClose={() => {}} />);
    expect(screen.queryByText("Restore purchases")).toBeNull();
  });

  it("shows Restore purchases on native iOS", () => {
    isNativeIOSMock.mockReturnValue(true);
    render(<ProModal onClose={() => {}} />);
    expect(screen.getByText("Restore purchases")).toBeTruthy();
  });
});

describe("ProModal — close button", () => {
  it("close button has an accessible name", () => {
    render(<ProModal onClose={() => {}} />);
    expect(
      screen.getByRole("button", { name: /Close upgrade modal/i }),
    ).toBeTruthy();
  });

  it("close button calls onClose", () => {
    const onClose = vi.fn();
    render(<ProModal onClose={onClose} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Close upgrade modal/i }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
