/**
 * FoodProStrip — the row that says why the camera is locked.
 *
 * Pins: it renders only when photo logging is Pro-gated for the tier
 * (`limit === 0`, not unlimited, not loading); the copy names the trial
 * having ended when it has, and the free taste when it has not; the CTA
 * lands on the offer page tagged with the Food entry so the funnel can
 * read it. A consumable quota that merely ran low is NOT this strip's
 * business — the quota caption under the input owns that.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom"
    );
  return { ...actual, useNavigate: () => navigateMock };
});

const authProfileMock = vi.fn<() => Record<string, unknown> | null>(() => null);
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "u-1" },
    profile: authProfileMock(),
    loading: false,
  }),
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

const trackMock = vi.fn();
vi.mock("@/lib/paywallAnalytics", () => ({
  track: (...args: unknown[]) => trackMock(...args),
}));

import FoodProStrip from "../FoodProStrip";

function renderStrip(props: Partial<Parameters<typeof FoodProStrip>[0]> = {}) {
  return render(
    <MemoryRouter>
      <FoodProStrip limit={0} isUnlimited={false} loading={false} {...props} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  navigateMock.mockReset();
  trackMock.mockReset();
  authProfileMock.mockReset();
  authProfileMock.mockReturnValue({ hasUsedTrial: true });
});
afterEach(cleanup);

describe("FoodProStrip — when it renders", () => {
  it("renders for a free user whose tier has no photo logging", () => {
    renderStrip();
    expect(
      screen.getByText("Photo logging is a Pro feature")
    ).toBeInTheDocument();
  });

  it("renders nothing for Pro or trial users", () => {
    const { container } = renderStrip({ isUnlimited: true });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while the quota is still loading", () => {
    const { container } = renderStrip({ loading: true });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a consumable quota — that is the caption's job", () => {
    const { container } = renderStrip({ limit: 10 });
    expect(container).toBeEmptyDOMElement();
  });
});

describe("FoodProStrip — copy and destination", () => {
  it("names the ended trial, and what still works, once the trial is used", () => {
    renderStrip();
    expect(
      screen.getByText(
        "Your free trial has ended. Typing and search still work."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See Pro" })).toBeInTheDocument();
  });

  it("offers the free trial to a user who has never had one", () => {
    authProfileMock.mockReturnValue({ hasUsedTrial: false });
    renderStrip();
    expect(
      screen.getByRole("button", { name: "Try Pro free" })
    ).toBeInTheDocument();
    expect(screen.queryByText(/trial has ended/)).toBeNull();
  });

  it("a lapsed free week reads as the trial having ended, even before the server stamped the flag", () => {
    authProfileMock.mockReturnValue({
      hasUsedTrial: false,
      trialExpiresAt: "2020-01-01T00:00:00.000Z",
    });
    renderStrip();
    expect(
      screen.getByText(
        "Your free trial has ended. Typing and search still work."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See Pro" })).toBeInTheDocument();
    expect(
      screen.queryByText(/Snap the plate|Try Pro free|Keep Pro/)
    ).toBeNull();
  });

  it("a live free week never shows the strip's lapsed copy (the camera is open)", () => {
    // limit === 0 cannot coincide with a live trial in production
    // (isUnlimited would be true); pin the copy branch anyway so the
    // helper's boundary, not the quota, is what decides.
    authProfileMock.mockReturnValue({
      hasUsedTrial: false,
      trialExpiresAt: "2999-01-01T00:00:00.000Z",
    });
    renderStrip();
    expect(screen.queryByText(/free week has ended/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Try Pro free" })
    ).toBeInTheDocument();
  });

  it("the CTA opens the offer page tagged with the Food entry", () => {
    renderStrip();
    fireEvent.click(screen.getByRole("button", { name: "See Pro" }));
    expect(navigateMock).toHaveBeenCalledWith("/upgrade?from=food");
    expect(trackMock).toHaveBeenCalledWith(
      "paywall_cta_clicked",
      expect.objectContaining({
        source: "food_page",
        featureKey: "ai_food_logging",
      })
    );
  });
});
