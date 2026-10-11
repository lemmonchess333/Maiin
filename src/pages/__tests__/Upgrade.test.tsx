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
import { formatWeekdayDayMonth } from "@/utils/formatters";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  within,
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

// The plans the page prints. The pound plans by default, which is what the
// real hook returns on the web; a storefront in another currency where a
// test says so (`localizePlans`, what the hook does with Apple's prices).
const plansMock = vi.fn<() => ProPlan[]>();
vi.mock("@/hooks/useProPlanPrices", () => ({
  useProPlanPrices: () => plansMock(),
}));

import Upgrade from "../Upgrade";
// The E2E journeys end setup on these two (src/test/journeyScreens.ts).
import { OFFER } from "@/test/journeyScreens";
import { PRO_PLANS, localizePlans, type ProPlan } from "@/lib/proPlans";

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
  plansMock.mockReset();
  plansMock.mockReturnValue(PRO_PLANS);
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

describe("Upgrade — the buttons are the app's primary button", () => {
  it("Continue and checkout carry no gradient", () => {
    renderPage();
    const next = screen.getByRole("button", { name: "Continue" });
    // Both were purple-to-teal gradients (2026-09-29).
    expect(next.className).toContain("bg-primary-strong");
    expect(next.getAttribute("style") ?? "").not.toMatch(/gradient/);
    fireEvent.click(next);
    const checkout = screen.getByRole("button", {
      name: "Start Pro — £34.99/yr",
    });
    expect(checkout.className).toContain("bg-primary-strong");
    expect(checkout.getAttribute("style") ?? "").not.toMatch(/gradient/);
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

  it("disclosure flips between the yearly and monthly price with the selected plan", () => {
    renderPlans();
    // Default yearly: what is charged, that it renews, and how to stop it.
    expect(
      screen.getByText(
        "£34.99 a year. Renews automatically until cancelled. Cancel any time."
      )
    ).toBeTruthy();
    const monthly = screen
      .getAllByRole("radio")
      .find((r) => r.textContent?.includes("Monthly"))!;
    fireEvent.click(monthly);
    expect(
      screen.getByText(
        "£3.99 a month. Renews automatically until cancelled. Cancel any time."
      )
    ).toBeTruthy();
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
      screen.getByRole("heading", { name: "Log a meal from a photo" })
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

  it("leads a trial-eligible offer with what is billed after the trial, above 'No payment due today'", () => {
    // Guideline 3.1.2: the amount billed at least as prominent as the free
    // trial. "No payment due today" used to be the bold line, with no price
    // anywhere on the screen.
    authProfileMock.mockReturnValue({ hasUsedTrial: false });
    renderPage();
    const lead = screen.getByText("7 days free, then £34.99 a year");
    expect(lead.className).toContain("font-bold");
    expect(lead.className).toContain("text-base");
    const reassurance = screen.getByText("No payment due today");
    expect(reassurance.className).not.toContain("font-bold");
    expect(reassurance.className).toContain("text-muted-foreground");
    // The price comes first in reading order.
    expect(
      lead.compareDocumentPosition(reassurance) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    // And the renewal terms are on this beat too.
    expect(
      screen.getByText(/Renews automatically until cancelled\./)
    ).toBeInTheDocument();
  });

  it("the offer's price follows the plan picked on the plans beat", () => {
    authProfileMock.mockReturnValue({ hasUsedTrial: false });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(
      screen
        .getAllByRole("radio")
        .find((r) => r.textContent?.includes("Monthly"))!
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Back to the Pro overview" })
    );
    expect(
      screen.getByText("7 days free, then £3.99 a month")
    ).toBeInTheDocument();
  });

  it("the trial CTA has the post-trial price directly beneath it, and the timeline names it", () => {
    authProfileMock.mockReturnValue({ hasUsedTrial: false });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const cta = screen.getByRole("button", {
      name: "Start your 7-day free trial",
    });
    const beneath = cta.nextElementSibling as HTMLElement;
    expect(beneath.textContent).toBe(
      "7 days free, then £34.99 a year. Renews automatically until cancelled. Cancel any time."
    );
    // As loud as the trial: the price line takes the button label's own
    // size and weight.
    const priceLine = within(beneath).getByText(
      "7 days free, then £34.99 a year."
    );
    for (const cls of ["text-base", "font-semibold"]) {
      expect(cta.className).toContain(cls);
      expect(priceLine.className).toContain(cls);
    }
    expect(
      screen.getByRole("list", { name: "How your free trial works" })
        .textContent
    ).toContain("Day 7 — Your subscription starts at £34.99 a year");
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
    expect(
      screen.getByText("£3.99 a month or £34.99 a year")
    ).toBeInTheDocument();
    expect(screen.queryByText("No payment due today")).toBeNull();
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

  it("from onboarding, the offer is headed by the plan just made", () => {
    renderPage("/upgrade?from=onboarding");
    expect(
      screen.getByRole("heading", { name: OFFER.ready })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/^Pro logs your meals from a photo/)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Log a meal from a photo" })
    ).toBeNull();
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

  it("on iOS, both beats say where to cancel: the Apple Account", () => {
    isNativeIOSMock.mockReturnValue(true);
    renderPage();
    expect(
      screen.getByText(
        "Renews automatically until cancelled. Manage or cancel in your Apple Account subscriptions."
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByText(
        "£34.99 a year. Renews automatically until cancelled. Manage or cancel in your Apple Account subscriptions."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/Apple ID/)).toBeNull();
  });
});

describe("Upgrade — a storefront that does not charge in pounds", () => {
  const US = () =>
    localizePlans({
      monthly: { priceString: "$4.99", price: 4.99, currencyCode: "USD" },
      yearly: { priceString: "$39.99", price: 39.99, currencyCode: "USD" },
    });

  it("trial offer and plans: every figure in dollars, none in pounds", () => {
    plansMock.mockReturnValue(US());
    authProfileMock.mockReturnValue({ hasUsedTrial: false });
    const { container } = renderPage();
    expect(
      screen.getByText("7 days free, then $39.99 a year")
    ).toBeInTheDocument();
    expect(container.textContent).not.toContain("£");

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    // Anchor on the dollar figures before reading for a pound sign.
    expect(
      screen.getByText("7 days free, then $39.99 a year.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "How your free trial works" })
        .textContent
    ).toContain("$39.99 a year");
    const cards = screen.getAllByRole("radio");
    expect(cards.map((c) => c.textContent)).toEqual([
      expect.stringContaining("$4.99/month"),
      expect.stringContaining("$39.99/year"),
    ]);
    // The per-week anchors and the saving are this storefront's own.
    for (const card of cards) expect(card.textContent).toMatch(/\/wk/);
    expect(cards[1].textContent).toContain("Save 33%");
    expect(container.textContent).not.toContain("£");
  });

  it("post-trial: the CTA and the summary are the store's prices, not the pound ones", () => {
    plansMock.mockReturnValue(US());
    const { container } = renderPage();
    expect(
      screen.getByText("$4.99 a month or $39.99 a year")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("button", { name: "Start Pro — $39.99/yr" })
    ).toBeInTheDocument();
    expect(container.textContent).not.toContain("£");
  });
});

describe("Upgrade — where 'not now' goes", () => {
  /* The offer is scrolled to reach its button on a small phone, and the
     app keeps a page's scroll across a route change, so going forward
     has to start the next screen at its top. */
  let scrollTo: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  });
  afterEach(() => {
    scrollTo.mockRestore();
  });

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

  it("from onboarding, 'Continue with Free' lands where it was sent, at the top", () => {
    renderWithProbe("?from=onboarding", { next: "/program?tab=run" });
    fireEvent.click(screen.getByRole("button", { name: OFFER.free }));
    expect(screen.getByLabelText("Current route")).toHaveTextContent(
      "/program?tab=run"
    );
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("from onboarding with the handoff state lost, it lands on Home rather than nowhere", () => {
    renderWithProbe("?from=onboarding");
    fireEvent.click(screen.getByRole("button", { name: "Continue with Free" }));
    expect(screen.getByLabelText("Current route")).toHaveTextContent(/^\/$/);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("from anywhere else, 'Not now' goes back, where the page it left keeps its place", () => {
    renderWithProbe("?from=food");
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.getByLabelText("Current route")).toHaveTextContent(
      "/settings"
    );
    expect(scrollTo).not.toHaveBeenCalled();
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

  it("checkout from Home's Pro strip is attributed to it", async () => {
    purchaseMock.mockResolvedValueOnce({ success: true });
    renderPage("/upgrade?from=home_strip");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: /Start Pro/ }));
    await waitFor(() => expect(purchaseMock).toHaveBeenCalledTimes(1));
    expect(purchaseMock.mock.calls[0][3]?.source).toBe("home_strip");
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
    // Apple's current name for the account.
    expect(
      screen.getByText(/Manage your subscription in your Apple Account\./)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Apple ID/)).toBeNull();
    // No checkout CTA visible (no double-charging path).
    expect(screen.queryByRole("button", { name: /Start Pro/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Start your 7-day free trial/ })
    ).toBeNull();
  });

  it("a store trial says when it ends and what it then costs, in the app and on the web", () => {
    // Sub1, STATUS 2026-10-06. Dates from the clock, so every run's
    // trial is still running.
    const now = Date.now();
    const ends = new Date(now + 3 * 86_400_000);
    authProfileMock.mockReturnValue({
      hasUsedTrial: true,
      subscriptionSource: "ios_iap",
      subscriptionTrial: {
        productId: "com.tropos.app.pro.monthly",
        store: "app_store",
        period: "month",
        startedAt: new Date(now - 4 * 86_400_000).toISOString(),
        endsAt: ends.toISOString(),
        cancelBy: new Date(ends.getTime() - 86_400_000).toISOString(),
        reminderAt: new Date(now + 86_400_000).toISOString(),
        willRenew: true,
        price: { amount: 3.99, currencyCode: "GBP", display: "£3.99" },
        reminderEmailedAt: null,
      },
    });
    useSubscriptionMock.mockReturnValue({
      tier: "pro",
      isInTrial: false,
      trialDaysLeft: 0,
      isPro: true,
    });
    const line = `Free trial until ${formatWeekdayDayMonth(ends)}.`;
    for (const native of [true, false]) {
      isNativeIOSMock.mockReturnValue(native);
      const view = renderPage();
      expect(screen.getByText(line), String(native)).toBeInTheDocument();
      expect(
        screen.getByText(/^Then £3\.99 a month, unless you cancel by /)
      ).toBeInTheDocument();
      view.unmount();
    }
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
