/**
 * The trial offer that ends setup (Biz1 call 3, A6 call 2): one screen,
 * every way off it goes Home, one trial per account, and on the web build
 * the same screen with nothing to buy. Pins the names the journeys find it
 * by (`TRIAL_OFFER`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { PRO_PLANS } from "@/lib/proPlans";

const h = vi.hoisted(() => ({
  profile: {} as Record<string, unknown>,
  onSale: false,
  ios: false,
  plans: null as unknown,
  startCheckout: vi.fn(),
  restore: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "trial-uid", email: "t@example.com" },
    profile: h.profile,
  }),
}));
vi.mock("@/lib/purchaseProvider", () => ({
  canSellInThisBuild: () => h.onSale,
  isNativeIOS: () => h.ios,
  restorePurchases: () => h.restore(),
}));
vi.mock("@/hooks/useProPlanPrices", () => ({
  useProPlanPrices: () => ({ plans: h.plans, failed: false, retry: vi.fn() }),
}));
vi.mock("@/hooks/useStoreTrialEligibility", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/hooks/useStoreTrialEligibility")
  >()),
  useStoreTrialEligibility: () => null,
}));
vi.mock("@/hooks/useProCheckout", () => ({
  useProCheckout: () => ({
    loading: false,
    error: null,
    notice: null,
    startCheckout: h.startCheckout,
    requiresSignIn: false,
  }),
}));
vi.mock("@/lib/lifecycleAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/paywallAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import TrialOffer from "../TrialOffer";
import { track } from "@/lib/lifecycleAnalytics";
import { toast } from "@/lib/toast";
import { TRIAL_OFFER } from "@/test/journeyScreens";
import { PRO_FROM_DAY_ONE } from "@/components/paywall/proIncludesCopy";

function Where() {
  return <output aria-label="Current route">{useLocation().pathname}</output>;
}

const show = () =>
  render(
    <MemoryRouter initialEntries={["/trial-offer"]}>
      <Routes>
        <Route path="/trial-offer" element={<TrialOffer />} />
        <Route path="/" element={<p>Home</p>} />
      </Routes>
      <Where />
    </MemoryRouter>
  );

const atHome = () =>
  waitFor(() =>
    expect(screen.getByLabelText("Current route")).toHaveTextContent(/^\/$/)
  );

/** The iPhone build, with the App Store's plans in. */
function phone() {
  h.onSale = true;
  h.ios = true;
  h.plans = PRO_PLANS;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  window.scrollTo = vi.fn();
  h.profile = {};
  h.onSale = false;
  h.ios = false;
  h.plans = PRO_PLANS;
});
afterEach(cleanup);

describe("the trial offer at the end of setup", () => {
  it("names what Pro does from the first day, and the trial", () => {
    phone();
    show();
    expect(screen.getByText(TRIAL_OFFER.kicker)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Try Pro free for 7 days" })
    ).toBeInTheDocument();
    for (const line of PRO_FROM_DAY_ONE)
      expect(screen.getByText(line)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start free trial" })
    ).toBeInTheDocument();
    // The price and its period sit under the button (Guideline 3.1.2).
    expect(
      screen.getByText("7 days free, then £39.99 a year.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
  });

  it("Not now goes Home", async () => {
    phone();
    show();
    fireEvent.click(screen.getByRole("button", { name: TRIAL_OFFER.notNow }));
    await atHome();
    expect(h.startCheckout).not.toHaveBeenCalled();
  });

  it.each([
    ["the trial is started", { kind: "bought" }],
    ["the store's sheet is closed", { kind: "cancelled" }],
    [
      "the purchase fails",
      { kind: "failed", message: "Couldn’t start checkout. Try again." },
    ],
  ])("goes Home when %s, never stranding anyone", async (_, outcome) => {
    phone();
    h.startCheckout.mockResolvedValue(outcome);
    show();
    fireEvent.click(screen.getByRole("button", { name: "Start free trial" }));
    await atHome();
    expect(h.startCheckout).toHaveBeenCalledWith("yearly", {
      source: "onboarding",
      entryPoint: "upgrade",
      withTrial: true,
    });
  });

  it("a purchase waiting on approval goes Home and says so", async () => {
    phone();
    h.startCheckout.mockResolvedValue({ kind: "pending", pending: "approval" });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Start free trial" }));
    await atHome();
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining("waiting for approval")
    );
  });

  it("on the web build, renders with nothing to buy, and Not now still goes Home", async () => {
    show();
    // Nothing on sale, so no trial is promised.
    expect(
      screen.getByRole("heading", { name: "Add Pro to your plan" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Pro isn’t on sale in this version of the app yet/)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Start free trial" })
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: TRIAL_OFFER.notNow }));
    await atHome();
  });

  it("with the website's checkout, notes the offer so its return goes Home", async () => {
    h.onSale = true;
    h.startCheckout.mockResolvedValue({ kind: "redirected", url: "https://x" });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Start free trial" }));
    await waitFor(() => expect(h.startCheckout).toHaveBeenCalled());
    expect(
      sessionStorage.getItem("tropos.trialOffer.webCheckout.trial-uid")
    ).toBe("1");
    // The window has gone to the checkout: nothing more here.
    expect(screen.getByLabelText("Current route")).toHaveTextContent(
      "/trial-offer"
    );
  });

  it("with the website's checkout refused, forgets the note and goes Home", async () => {
    h.onSale = true;
    h.startCheckout.mockResolvedValue({ kind: "failed", message: "No." });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Start free trial" }));
    await atHome();
    expect(
      sessionStorage.getItem("tropos.trialOffer.webCheckout.trial-uid")
    ).toBeNull();
  });

  it("one trial per account: an account that has had one goes Home unshown", async () => {
    h.profile = { hasUsedTrial: true };
    show();
    await atHome();
    expect(screen.queryByText(TRIAL_OFFER.kicker)).toBeNull();
    expect(track).not.toHaveBeenCalledWith("trial_offer_viewed");
  });

  it("a Pro account goes Home unshown", async () => {
    h.profile = { subscriptionTier: "pro" };
    show();
    await atHome();
  });

  it("sends trial_offer_viewed once for the account", () => {
    show();
    cleanup();
    show();
    expect(
      vi.mocked(track).mock.calls.filter(([e]) => e === "trial_offer_viewed")
    ).toHaveLength(1);
  });
});
