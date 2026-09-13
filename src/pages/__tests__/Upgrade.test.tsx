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
import { MemoryRouter, useLocation } from "react-router-dom";

// Sub1a P1 — default profile to `hasUsedTrial: true` so the
// plan-priced CTA ("Start Pro — £X/yr") is the rendered baseline
// for the existing tests (which all predate the trial-eligibility
// branching). Sub1 P2 — same hoisted-ref pattern as ProModal so
// trial + cross-platform cycles can override per-test.
const authProfileMock = vi.fn<() => Record<string, unknown> | null>(() => ({
  hasUsedTrial: true,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "test-uid", email: "test@example.com" },
    profile: authProfileMock(),
    loading: false,
  }),
  useUid: () =>
    ({
      user: { uid: "test-uid", email: "test@example.com" },
      profile: authProfileMock(),
      loading: false,
    }).user?.uid ?? null,
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

const useSubscriptionMock = vi.fn<
  () => {
    tier: "free" | "pro";
    isInTrial: boolean;
    trialDaysLeft: number;
    isPro: boolean;
  }
>(() => ({
  tier: "free",
  isInTrial: false,
  trialDaysLeft: 0,
  isPro: false,
}));

vi.mock("@/lib/subscription", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/subscription")>(
      "@/lib/subscription"
    );
  return {
    ...actual,
    useSubscription: () => useSubscriptionMock(),
  };
});

import Upgrade from "../Upgrade";

function renderPage(entry = "/upgrade", state?: Record<string, unknown>) {
  return render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: "/upgrade",
          search: entry.replace(/^\/upgrade/, ""),
          state,
        },
      ]}
    >
      <Upgrade />
    </MemoryRouter>
  );
}

/** The page opens on the offer beat; the plan picker sits behind
 *  "Continue". Every plan / checkout pin below goes through this. */
function renderPlans() {
  const view = renderPage();
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  return view;
}

beforeEach(() => {
  purchaseMock.mockReset();
  manageSubscriptionMock.mockReset();
  isNativeIOSMock.mockReset();
  authProfileMock.mockReset();
  useSubscriptionMock.mockReset();
  isNativeIOSMock.mockReturnValue(false);
  // Baseline: free user on web with the post-trial flag set (so the
  // existing pricing-page tests rendering "Start Pro — £X" still pass).
  authProfileMock.mockReturnValue({ hasUsedTrial: true });
  useSubscriptionMock.mockReturnValue({
    tier: "free",
    isInTrial: false,
    trialDaysLeft: 0,
    isPro: false,
  });
});

afterEach(cleanup);

describe("Upgrade — plan radiogroup (free user)", () => {
  it("renders both plans as radios", () => {
    renderPlans();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
  });

  it("yearly is selected by default (recommended plan)", () => {
    renderPlans();
    const radios = screen.getAllByRole("radio");
    const yearly = radios.find((r) => r.textContent?.includes("Yearly"));
    const monthly = radios.find((r) => r.textContent?.includes("Monthly"));
    expect(yearly?.getAttribute("aria-checked")).toBe("true");
    expect(monthly?.getAttribute("aria-checked")).toBe("false");
  });

  it("tapping Monthly selects Monthly on the same page (no modal opens)", () => {
    renderPlans();
    const radios = screen.getAllByRole("radio");
    const monthly = radios.find((r) => r.textContent?.includes("Monthly"))!;
    fireEvent.click(monthly);
    expect(monthly.getAttribute("aria-checked")).toBe("true");
  });

  it("tapping Yearly after Monthly selects Yearly again", () => {
    renderPlans();
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
    renderPlans();
    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios.find((r) => r.textContent?.includes("Monthly"))!);
    fireEvent.click(radios.find((r) => r.textContent?.includes("Yearly"))!);
    expect(
      screen.queryByRole("button", { name: /Close upgrade modal/i })
    ).toBeNull();
  });
});

describe("Upgrade — CTA copy reflects selected plan", () => {
  it("CTA reads 'Start Pro — £34.99/yr' by default (yearly)", () => {
    renderPlans();
    expect(screen.getByText("Start Pro — £34.99/yr")).toBeTruthy();
  });

  it("CTA flips to 'Start Pro — £3.99/mo' after selecting Monthly", () => {
    renderPlans();
    const monthly = screen
      .getAllByRole("radio")
      .find((r) => r.textContent?.includes("Monthly"))!;
    fireEvent.click(monthly);
    expect(screen.getByText("Start Pro — £3.99/mo")).toBeTruthy();
  });

  it("disclosure flips between monthly/annually with the selected plan", () => {
    renderPlans();
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
    renderPlans();
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
    renderPlans();
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
    renderPlans();
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
    renderPlans();
    fireEvent.click(screen.getByRole("button", { name: /Start Pro/ }));
    await waitFor(() => {
      expect(purchaseMock).toHaveBeenCalledTimes(1);
    });
    const options = purchaseMock.mock.calls[0][3];
    expect(options?.entryPoint).toBe("upgrade");
  });
});

describe("Upgrade — the offer beat (what the page opens on)", () => {
  it("leads with the product, not the price list", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: "Log a meal from a photo." })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "What Pro looks like" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Continue" })
    ).toBeInTheDocument();
  });

  it("tells a trial-eligible user nothing is due today, and when billing starts", () => {
    authProfileMock.mockReturnValue({ hasUsedTrial: false });
    renderPage();
    expect(screen.getByText("No payment due today")).toBeInTheDocument();
    expect(
      screen.getByText(/Billing starts when your free trial ends/)
    ).toBeInTheDocument();
  });

  it("after the onboarding free week the page shows the price — one trial per account, flag stamped or not", () => {
    authProfileMock.mockReturnValue({
      hasUsedTrial: false,
      trialExpiresAt: "2020-01-01T00:00:00.000Z",
    });
    renderPage();
    expect(screen.queryByText("No payment due today")).toBeNull();
    expect(screen.queryByText(/free week/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByText("Both plans include everything in Pro.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Start Pro — £/ })
    ).toBeInTheDocument();
    expect(screen.queryByText(/free trial/i)).toBeNull();
  });

  it("a live free week also reads as the trial already taken", () => {
    authProfileMock.mockReturnValue({
      hasUsedTrial: false,
      trialExpiresAt: "2999-01-01T00:00:00.000Z",
      subscriptionTier: "free",
    });
    renderPage();
    expect(screen.queryByText("No payment due today")).toBeNull();
  });

  it("a first-timer — no free week ever held — is offered the trial", () => {
    authProfileMock.mockReturnValue({
      hasUsedTrial: false,
      trialExpiresAt: null,
    });
    renderPage();
    expect(screen.getByText("No payment due today")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("button", { name: /Start your 7-day free trial/ })
    ).toBeInTheDocument();
  });

  it("shows a post-trial user the prices instead of a trial promise", () => {
    renderPage();
    expect(screen.queryByText("No payment due today")).toBeNull();
    expect(
      screen.getAllByText(/£3\.99\/month or £34\.99\/year/).length
    ).toBeGreaterThan(0);
  });

  it("Continue opens the plans; Back returns to the offer", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(
      screen.getByRole("heading", { name: "Choose your plan" })
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Back to the Pro overview" })
    );
    expect(screen.queryByRole("radio")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Continue" })
    ).toBeInTheDocument();
  });

  it("from onboarding, the offer acknowledges the plan just made", () => {
    renderPage("/upgrade?from=onboarding");
    expect(screen.getByText(/^Your plan is ready\./)).toBeInTheDocument();
    expect(screen.queryByText(/^Pro reads the plate/)).toBeNull();
  });

  it("the rail leads with the scan from Food and from the plain entry alike", () => {
    renderPage("/upgrade?from=food");
    let frames = screen.getAllByRole("img");
    expect(frames[0].getAttribute("aria-label")).toMatch(/meal photo/);
    cleanup();
    renderPage();
    frames = screen.getAllByRole("img");
    expect(frames[0].getAttribute("aria-label")).toMatch(/meal photo/);
  });

  it("carries the legal links on the offer beat too (Guideline 3.1.2)", () => {
    renderPage();
    expect(screen.getByRole("link", { name: "Terms" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy" })).toBeInTheDocument();
  });

  it("offers Restore only on iOS, as 'Already purchased?'", () => {
    renderPage();
    expect(screen.queryByText(/Already purchased/)).toBeNull();
    cleanup();
    isNativeIOSMock.mockReturnValue(true);
    renderPage();
    expect(screen.getByText(/Already purchased/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
  });
});

describe("Upgrade — where 'not now' goes", () => {
  function Probe() {
    const location = useLocation();
    return (
      <output aria-label="Current route">
        {location.pathname}
        {location.search}
      </output>
    );
  }
  function renderWithProbe(search: string, state?: Record<string, unknown>) {
    return render(
      <MemoryRouter
        initialEntries={[
          { pathname: "/settings" },
          { pathname: "/upgrade", search, state },
        ]}
        initialIndex={1}
      >
        <Upgrade />
        <Probe />
      </MemoryRouter>
    );
  }

  it("from onboarding, 'Continue with Free' lands on the first activity it was handed", () => {
    renderWithProbe("?from=onboarding", { next: "/program?tab=run" });
    fireEvent.click(screen.getByRole("button", { name: "Continue with Free" }));
    expect(screen.getByLabelText("Current route")).toHaveTextContent(
      "/program?tab=run"
    );
  });

  it("from onboarding with the handoff state lost, it lands on Home rather than nowhere", () => {
    renderWithProbe("?from=onboarding");
    fireEvent.click(screen.getByRole("button", { name: "Continue with Free" }));
    expect(screen.getByLabelText("Current route")).toHaveTextContent(/^\/$/);
  });

  it("from anywhere else, 'Not now' goes back", () => {
    renderWithProbe("?from=food");
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.getByLabelText("Current route")).toHaveTextContent(
      "/settings"
    );
  });

  it("checkout from the trial-ended prompt is attributed to it", async () => {
    purchaseMock.mockResolvedValueOnce({ success: true });
    renderPage("/upgrade?from=trial_end");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: /Start Pro/ }));
    await waitFor(() => expect(purchaseMock).toHaveBeenCalledTimes(1));
    expect(purchaseMock.mock.calls[0][3]?.source).toBe("trial_end");
  });

  it("checkout from Home's trial countdown strip is attributed to it", async () => {
    purchaseMock.mockResolvedValueOnce({ success: true });
    renderPage("/upgrade?from=trial_strip");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: /Start Pro/ }));
    await waitFor(() => expect(purchaseMock).toHaveBeenCalledTimes(1));
    expect(purchaseMock.mock.calls[0][3]?.source).toBe("trial_strip");
  });

  it("checkout from a Settings entry is attributed to Settings", async () => {
    purchaseMock.mockResolvedValueOnce({ success: true });
    renderPage("/upgrade?from=settings");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: /Start Pro/ }));
    await waitFor(() => expect(purchaseMock).toHaveBeenCalledTimes(1));
    expect(purchaseMock.mock.calls[0][3]?.source).toBe("settings");
  });

  it("checkout from the Food entry is attributed to the Food page", async () => {
    purchaseMock.mockResolvedValueOnce({ success: true });
    renderPage("/upgrade?from=food");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: /Start Pro/ }));
    await waitFor(() => expect(purchaseMock).toHaveBeenCalledTimes(1));
    expect(purchaseMock.mock.calls[0][3]?.source).toBe("food_page");
  });
});

describe("Upgrade — checkout return banner", () => {
  function renderWithQuery(query: string) {
    return render(
      <MemoryRouter initialEntries={[`/upgrade${query}`]}>
        <Upgrade />
      </MemoryRouter>
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

describe("Upgrade — Sub1 P2 cross-platform Pro guard", () => {
  it("Cycle 8: iOS-IAP Pro user on web sees a 'manage on App Store' notice and NO checkout CTA", () => {
    // User purchased Pro via Apple IAP on iOS; now opens the web
    // Upgrade page in a browser. Without the guard, the page would
    // either offer a Stripe checkout (double-charge risk) or send
    // them to the Stripe billing portal (which has no record of
    // their IAP sub). The guard surfaces the platform of record.
    authProfileMock.mockReturnValue({
      hasUsedTrial: true,
      subscriptionSource: "ios_iap",
    });
    useSubscriptionMock.mockReturnValue({
      tier: "pro",
      isInTrial: false,
      trialDaysLeft: 0,
      isPro: true,
    });
    isNativeIOSMock.mockReturnValue(false); // web
    renderPage();
    // The cross-platform notice text — must reference Apple/App Store
    // so the user recognises where to go. `getAllByText` because the
    // copy mentions "App Store" multiple times across heading + body.
    expect(screen.getAllByText(/App Store/i).length).toBeGreaterThan(0);
    // No checkout CTA visible (no double-charging path).
    expect(screen.queryByRole("button", { name: /Start Pro/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Start your 7-day free trial/ })
    ).toBeNull();
  });

  it("Cycle 9: Stripe Pro user on web sees the standard Manage subscription button (no cross-platform notice)", () => {
    // Regression guard for the same-platform case — Stripe Pro on
    // web is the canonical path. The cross-platform notice must NOT
    // appear; the existing Manage subscription button drives the
    // billing portal.
    authProfileMock.mockReturnValue({
      hasUsedTrial: true,
      subscriptionSource: "stripe",
    });
    useSubscriptionMock.mockReturnValue({
      tier: "pro",
      isInTrial: false,
      trialDaysLeft: 0,
      isPro: true,
    });
    isNativeIOSMock.mockReturnValue(false);
    renderPage();
    expect(
      screen.getByRole("button", { name: /Manage subscription/ })
    ).toBeTruthy();
    // The cross-platform notice copy says "App Store" — must NOT
    // render for a stripe-Pro user on web.
    expect(screen.queryByText(/App Store/i)).toBeNull();
  });

  it("Cycle 10: Stripe Pro user opening the iOS shell sees the 'manage on web' notice", () => {
    // Inverse of cycle 8. User bought Pro on the web, now opens the
    // iOS app — Apple's IAP store has nothing for them. The notice
    // routes them back to the web account.
    authProfileMock.mockReturnValue({
      hasUsedTrial: true,
      subscriptionSource: "stripe",
    });
    useSubscriptionMock.mockReturnValue({
      tier: "pro",
      isInTrial: false,
      trialDaysLeft: 0,
      isPro: true,
    });
    isNativeIOSMock.mockReturnValue(true); // native iOS
    renderPage();
    // Notice mentions the web origin so the user knows where to go.
    expect(
      screen.getAllByText(/tropos\.app|on the web/i).length
    ).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Start Pro/ })).toBeNull();
  });
});
