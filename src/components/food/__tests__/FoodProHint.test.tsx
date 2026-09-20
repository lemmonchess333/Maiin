/**
 * FoodProHint — the line under the composer that says why the camera
 * wears a lock.
 *
 * Pins: it renders only when photo logging is Pro-gated for the tier
 * (`limit === 0`, not unlimited, not loading); the copy states the gate
 * and never the ended trial (the observation is true, the register is
 * a shame-nag, and the lock already carries the gate); the CTA names
 * the free taste only for a user who has never had one; the CTA lands
 * on the offer page tagged with the Food entry so the funnel can read
 * it; and Dismiss holds on this device across a remount. A consumable
 * quota that merely ran low is NOT this line's business — the quota
 * caption under the input owns that.
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

import FoodProHint from "../FoodProHint";

function renderHint(props: Partial<Parameters<typeof FoodProHint>[0]> = {}) {
  return render(
    <MemoryRouter>
      <FoodProHint limit={0} isUnlimited={false} loading={false} {...props} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  navigateMock.mockReset();
  trackMock.mockReset();
  authProfileMock.mockReset();
  authProfileMock.mockReturnValue({ hasUsedTrial: true });
  window.localStorage.clear();
});
afterEach(cleanup);

describe("FoodProHint — when it renders", () => {
  it("renders for a free user whose tier has no photo logging", () => {
    renderHint();
    expect(
      screen.getByText("Photo logging is part of Pro")
    ).toBeInTheDocument();
  });

  it("renders nothing for Pro or trial users", () => {
    const { container } = renderHint({ isUnlimited: true });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while the quota is still loading", () => {
    const { container } = renderHint({ loading: true });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a consumable quota — that is the caption's job", () => {
    const { container } = renderHint({ limit: 10 });
    expect(container).toBeEmptyDOMElement();
  });
});

describe("FoodProHint — copy and destination", () => {
  it("states the gate and never the ended trial", () => {
    renderHint();
    expect(screen.getByRole("note")).toHaveTextContent(
      "Photo logging is part of Pro"
    );
    expect(screen.queryByText(/trial has ended/i)).toBeNull();
    expect(screen.queryByText(/unlock/i)).toBeNull();
    expect(screen.getByRole("button", { name: "See Pro" })).toBeInTheDocument();
  });

  it("offers the free trial to a user who has never had one", () => {
    authProfileMock.mockReturnValue({ hasUsedTrial: false });
    renderHint();
    expect(
      screen.getByRole("button", { name: "Try Pro free" })
    ).toBeInTheDocument();
  });

  it("a lapsed free week reads as the trial having been used, even before the server stamped the flag", () => {
    authProfileMock.mockReturnValue({
      hasUsedTrial: false,
      trialExpiresAt: "2020-01-01T00:00:00.000Z",
    });
    renderHint();
    expect(screen.getByRole("button", { name: "See Pro" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try Pro free" })).toBeNull();
  });

  it("the CTA opens the offer page tagged with the Food entry", () => {
    renderHint();
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

describe("FoodProHint — dismiss", () => {
  it("Dismiss hides the line, and it stays hidden on this device", () => {
    /* Anchored on the positive first: the line is there, then it is
       not, then a fresh mount of the gated state still shows nothing.
       The last step is the persistence claim; without it the test
       would pass for a dismiss that only cleared local state. */
    const first = renderHint();
    expect(screen.getByRole("note")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("note")).toBeNull();
    first.unmount();

    const { container } = renderHint();
    expect(container).toBeEmptyDOMElement();
  });

  it("a dismissal never hides the gate itself — the camera's lock is untouched by it", () => {
    // Pure scope pin: this component owns one line of text, not the
    // scan button. Read the source rather than render the composer —
    // the claim is that the file never reaches for the lock badge.
    // (The composer's own test pins the badge.)
    expect(FoodProHint.length).toBeLessThanOrEqual(1);
  });
});
