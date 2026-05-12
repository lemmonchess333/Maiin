/**
 * Upgrade page — paywall behaviour tests.
 *
 * Pins the original bug fix: the page used to render plan tiles
 * that all opened ProModal (which defaulted to Yearly), so tapping
 * Monthly silently checked the user out at the Yearly price. After
 * the unification commit the page owns its own selection state +
 * direct purchase CTA, and ProModal is reserved for contextual
 * feature-gate paywalls.
 *
 * Required tests (per spec section 17):
 *   - yearly is selected by default
 *   - tapping Monthly selects Monthly on the same page
 *   - tapping Yearly selects Yearly on the same page
 *   - tapping plan cards does not render ProModal
 *   - CTA copy reflects the selected plan
 *   - checkout receives the selected plan
 *   - inline checkout error is visible
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

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "test-uid", email: "test@example.com" },
    profile: null,
    loading: false,
  }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const purchaseMock = vi.fn();
const manageSubscriptionMock = vi.fn();
const isNativeIOSMock = vi.fn();

vi.mock("@/lib/purchaseProvider", () => ({
  purchase: (...args: unknown[]) => purchaseMock(...args),
  restorePurchases: vi.fn(),
  manageSubscription: (...args: unknown[]) => manageSubscriptionMock(...args),
  isNativeIOS: () => isNativeIOSMock(),
}));

vi.mock("@/lib/subscription", async () => {
  const actual = await vi.importActual<typeof import("@/lib/subscription")>(
    "@/lib/subscription",
  );
  return {
    ...actual,
    useSubscription: () => ({
      tier: "free",
      isInTrial: false,
      trialDaysLeft: 0,
      isPro: false,
      features: actual.featureAccess.free,
    }),
  };
});

import Upgrade from "../Upgrade";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/upgrade"]}>
      <Upgrade />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  purchaseMock.mockReset();
  manageSubscriptionMock.mockReset();
  isNativeIOSMock.mockReset();
  isNativeIOSMock.mockReturnValue(false);
});

afterEach(cleanup);

describe("Upgrade — plan radiogroup (free user)", () => {
  it("renders both plans as radios", () => {
    renderPage();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
  });

  it("yearly is selected by default (recommended plan)", () => {
    renderPage();
    const radios = screen.getAllByRole("radio");
    const yearly = radios.find((r) => r.textContent?.includes("Yearly"));
    const monthly = radios.find((r) => r.textContent?.includes("Monthly"));
    expect(yearly?.getAttribute("aria-checked")).toBe("true");
    expect(monthly?.getAttribute("aria-checked")).toBe("false");
  });

  it("tapping Monthly selects Monthly on the same page (no modal opens)", () => {
    renderPage();
    const radios = screen.getAllByRole("radio");
    const monthly = radios.find((r) => r.textContent?.includes("Monthly"))!;
    fireEvent.click(monthly);
    expect(monthly.getAttribute("aria-checked")).toBe("true");
  });

  it("tapping Yearly after Monthly selects Yearly again", () => {
    renderPage();
    const radios = screen.getAllByRole("radio");
    const monthly = radios.find((r) => r.textContent?.includes("Monthly"))!;
    const yearly = radios.find((r) => r.textContent?.includes("Yearly"))!;
    fireEvent.click(monthly);
    fireEvent.click(yearly);
    expect(yearly.getAttribute("aria-checked")).toBe("true");
    expect(monthly.getAttribute("aria-checked")).toBe("false");
  });

  it("does NOT render a ProModal when plan cards are tapped", () => {
    // ProModal renders a "Close upgrade modal" button — its absence
    // is the regression guard. Tap both plans; that button must not
    // appear on the page (the page now owns selection directly).
    renderPage();
    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios.find((r) => r.textContent?.includes("Monthly"))!);
    fireEvent.click(radios.find((r) => r.textContent?.includes("Yearly"))!);
    expect(
      screen.queryByRole("button", { name: /Close upgrade modal/i }),
    ).toBeNull();
  });
});

describe("Upgrade — CTA copy reflects selected plan", () => {
  it("CTA reads 'Start Pro — £34.99/yr' by default (yearly)", () => {
    renderPage();
    expect(screen.getByText("Start Pro — £34.99/yr")).toBeTruthy();
  });

  it("CTA flips to 'Start Pro — £3.99/mo' after selecting Monthly", () => {
    renderPage();
    const monthly = screen
      .getAllByRole("radio")
      .find((r) => r.textContent?.includes("Monthly"))!;
    fireEvent.click(monthly);
    expect(screen.getByText("Start Pro — £3.99/mo")).toBeTruthy();
  });

  it("disclosure flips between monthly/annually with the selected plan", () => {
    renderPage();
    // Default yearly → "Renews annually"
    expect(screen.getByText(/Renews annually/)).toBeTruthy();
    const monthly = screen
      .getAllByRole("radio")
      .find((r) => r.textContent?.includes("Monthly"))!;
    fireEvent.click(monthly);
    expect(screen.getByText(/Renews monthly/)).toBeTruthy();
  });
});

describe("Upgrade — checkout uses selected plan (the original bug)", () => {
  it("default checkout sends 'yearly' (no plan change)", async () => {
    purchaseMock.mockResolvedValueOnce({ success: true });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Start Pro/ }));
    await waitFor(() => {
      expect(purchaseMock).toHaveBeenCalledTimes(1);
    });
    expect(purchaseMock.mock.calls[0][0]).toBe("yearly");
  });

  it("checkout sends 'monthly' after the user selects Monthly", async () => {
    // This is the regression test for the pre-fix bug: tapping
    // Monthly used to silently start a Yearly checkout because
    // the plan tile opened ProModal which defaulted to Yearly.
    purchaseMock.mockResolvedValueOnce({ success: true });
    renderPage();
    const monthly = screen
      .getAllByRole("radio")
      .find((r) => r.textContent?.includes("Monthly"))!;
    fireEvent.click(monthly);
    fireEvent.click(screen.getByRole("button", { name: /Start Pro/ }));
    await waitFor(() => {
      expect(purchaseMock).toHaveBeenCalledTimes(1);
    });
    expect(purchaseMock.mock.calls[0][0]).toBe("monthly");
  });

  it("inline error renders as role=alert when checkout fails", async () => {
    purchaseMock.mockResolvedValueOnce({
      success: false,
      error: "Card declined.",
    });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Start Pro/ }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Card declined.");
  });

  it("checkout passes entryPoint = upgrade", async () => {
    // After the server-synthesised-URL pivot, the client no longer
    // sends successPath / cancelPath strings; it sends a single
    // closed-set entryPoint token that the server resolves to a
    // full URL on its side.
    purchaseMock.mockResolvedValueOnce({ success: true });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Start Pro/ }));
    await waitFor(() => {
      expect(purchaseMock).toHaveBeenCalledTimes(1);
    });
    const options = purchaseMock.mock.calls[0][3];
    expect(options?.entryPoint).toBe("upgrade");
  });
});

describe("Upgrade — checkout return banner", () => {
  function renderWithQuery(query: string) {
    return render(
      <MemoryRouter initialEntries={[`/upgrade${query}`]}>
        <Upgrade />
      </MemoryRouter>,
    );
  }

  it("?checkout=success shows the success status banner", () => {
    renderWithQuery("?checkout=success");
    const banner = screen.getByRole("status");
    expect(banner.textContent).toContain("Payment received");
  });

  it("?checkout=cancelled shows the cancelled status banner", () => {
    renderWithQuery("?checkout=cancelled");
    const banner = screen.getByRole("status");
    expect(banner.textContent).toContain("Checkout cancelled");
  });
});
