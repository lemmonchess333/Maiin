/**
 * AdaptiveTDEECard — Sub2c pin #3 surface gating tests.
 *
 * Sub2c pin #3 (locked) splits the card by tier:
 *   - Header (TDEE number + label): visible to all tiers
 *   - Confidence badge + adaptive callouts: Pro-only
 *   - Apply Suggested Targets: Pro-only; replaced for free users by
 *     a single "Unlock adaptive adjustments with Pro" CTA that opens
 *     ProModal with featureKey="adaptive_tdee".
 *
 * Pre-Sub2c-#3 the entire card was wrapped in <ProGate> — free users
 * saw a blurred preview + a wholesale "Unlock with Pro" overlay
 * button. These tests pin the new partial-gating behaviour so a
 * regression to the wholesale wrapper trips the suite.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  fetchBodyweightLogs: vi.fn(async () => []),
}));

// ProModal is the paywall surface — mock it as an inert marker so
// the test pins the contract (CTA opens ProModal with the right
// featureKey) without coupling to ProModal's full setup (Stripe
// checkout, purchase provider, BottomSheet portal, etc.).
vi.mock("@/components/ProModal", () => ({
  default: ({
    featureKey,
    onClose,
  }: {
    featureKey?: string;
    onClose: () => void;
  }) => (
    <div data-testid="pro-modal" data-feature-key={featureKey ?? ""}>
      <button type="button" onClick={onClose}>
        close-paywall
      </button>
    </div>
  ),
}));

vi.mock("@/hooks/useMeals", () => ({
  useMeals: () => ({ meals: [] }),
}));

vi.mock("@/lib/adaptiveTDEE", () => ({
  // Predictable result so assertions can pin exact rendered copy.
  // High confidence so the Apply button condition is met under the
  // pre-refactor branch — guarantees the test would have surfaced
  // the wholesale-gate state.
  calculateAdaptiveTDEE: () => ({
    estimatedTDEE: 2400,
    adjustedCalories: 2350,
    adjustedProtein: 175,
    adjustedCarbs: 260,
    adjustedFat: 65,
    confidence: "high" as const,
    weeklyWeightChange: -0.1,
    targetWeightChange: -0.25,
  }),
}));

const updateProfileMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  useAuth: () => useAuthMock(),
}));

import { AdaptiveTDEECard } from "../AdaptiveTDEECard";

function asFreeUser() {
  useAuthMock.mockReturnValue({
    user: { uid: "free-uid" },
    profile: {
      // No subscriptionTier + no trialExpiresAt → free per
      // subscription.ts getSubscriptionInfo
      weightKg: 75,
      targetCalories: 2200,
      targetProtein: 160,
      targetCarbs: 250,
      targetFat: 60,
      tdeeBase: 2200,
      program: { goal: "recomp" },
    },
    updateProfile: updateProfileMock,
    loading: false,
  });
}

function asProUser() {
  useAuthMock.mockReturnValue({
    user: { uid: "pro-uid" },
    profile: {
      subscriptionTier: "pro",
      weightKg: 75,
      targetCalories: 2200,
      targetProtein: 160,
      targetCarbs: 250,
      targetFat: 60,
      tdeeBase: 2200,
      program: { goal: "recomp" },
    },
    updateProfile: updateProfileMock,
    loading: false,
  });
}

beforeEach(() => {
  updateProfileMock.mockReset();
  useAuthMock.mockReset();
});

afterEach(cleanup);

describe("AdaptiveTDEECard — Sub2c pin #3 free-user header", () => {
  it("renders the estimated TDEE number for a free user without a wholesale paywall overlay", () => {
    asFreeUser();
    render(<AdaptiveTDEECard />);

    // Header value renders cleanly — not behind a blurred preview.
    expect(screen.getByText("2400 cal/day")).toBeInTheDocument();

    // Pre-refactor regression guard: the wholesale ProGate overlay
    // rendered a "Unlock with Pro" button at the card level. After
    // Sub2c pin #3 the only unlock CTA lives inside the expanded
    // section with different copy ("Unlock adaptive adjustments
    // with Pro"), so the exact phrase below must not appear in the
    // default collapsed render.
    expect(
      screen.queryByRole("button", { name: "Unlock with Pro" })
    ).not.toBeInTheDocument();
  });

  it("hides the confidence badge from a free user", () => {
    asFreeUser();
    render(<AdaptiveTDEECard />);

    // Confidence is one of the "adaptive callouts" Sub2c pin #3
    // moves behind the Pro line. The badge text matches the
    // tdeeResult.confidence value from the mock ("high").
    expect(screen.queryByText("high")).not.toBeInTheDocument();
  });

  it("free expanded view replaces Apply Suggested Targets with an unlock CTA", () => {
    asFreeUser();
    render(<AdaptiveTDEECard />);

    // Tap the header to expand. The header button's accessible name
    // is derived from its text content ("Adaptive TDEE" + value).
    fireEvent.click(screen.getByRole("button", { name: /Adaptive TDEE/i }));

    // The Apply Suggested Targets button is the adaptive-callout
    // surface Sub2c pin #3 gates — it must NOT appear for free users.
    expect(
      screen.queryByRole("button", { name: /Apply Suggested Targets/i })
    ).not.toBeInTheDocument();

    // In its place, free users see a single unlock CTA that explains
    // what they'd get with Pro.
    expect(
      screen.getByRole("button", {
        name: /Unlock adaptive adjustments with Pro/i,
      })
    ).toBeInTheDocument();
  });

  it("tapping the unlock CTA opens ProModal with the adaptive_tdee feature key", async () => {
    asFreeUser();
    render(<AdaptiveTDEECard />);

    fireEvent.click(screen.getByRole("button", { name: /Adaptive TDEE/i }));
    fireEvent.click(
      screen.getByRole("button", {
        name: /Unlock adaptive adjustments with Pro/i,
      })
    );

    // ProModal mounts via React.lazy → use findByTestId so the
    // suspense round-trip resolves before assertion.
    const modal = await screen.findByTestId("pro-modal");
    expect(modal).toHaveAttribute("data-feature-key", "adaptive_tdee");
  });
});

describe("AdaptiveTDEECard — Pro user regression guard", () => {
  it("Pro user sees confidence badge + Apply Suggested Targets, no unlock CTA", () => {
    asProUser();
    render(<AdaptiveTDEECard />);

    // Confidence badge — gated to Pro per Sub2c pin #3.
    expect(screen.getByText("high")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Adaptive TDEE/i }));

    // Full adaptive callout surface present.
    expect(
      screen.getByRole("button", { name: /Apply Suggested Targets/i })
    ).toBeInTheDocument();

    // The free-only unlock CTA must NOT appear for Pro users.
    expect(
      screen.queryByRole("button", {
        name: /Unlock adaptive adjustments with Pro/i,
      })
    ).not.toBeInTheDocument();
  });
});
