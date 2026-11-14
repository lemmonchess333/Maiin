import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import FoodHeroCard from "../FoodHeroCard";
import { PersonalTargetOffer } from "../PersonalTargetCard";
import type { EffectiveTargets } from "@/hooks/useEffectiveTargets";

const h = vi.hoisted(() => ({
  profile: {} as Record<string, unknown>,
  store: null as Record<string, string> | null,
  track: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "u1" }, profile: h.profile }),
  useUid: () => "u1",
  useUidForStorageKey: () => "u1",
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/paywallAnalytics", () => ({ track: h.track }));
vi.mock("@/hooks/useStoreTrialEligibility", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/hooks/useStoreTrialEligibility")
  >()),
  useStoreTrialEligibility: () => h.store,
}));

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function renderOffer(personalTarget = 2340, currentTarget = 2500) {
  return render(
    <MemoryRouter initialEntries={["/food"]}>
      <Routes>
        <Route
          path="/food"
          element={
            <PersonalTargetOffer
              personalTarget={personalTarget}
              currentTarget={currentTarget}
            />
          }
        />
        <Route path="/upgrade" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  h.profile = { targetCalories: 2500 };
  h.store = null;
  h.track.mockClear();
});

describe("PersonalTargetOffer (whole-app grill Q49, Q71, Q87)", () => {
  it("tells a free account its target and offers the trial then", () => {
    renderOffer();
    expect(
      screen.getByRole("region", { name: "Your personal target is ready" })
    ).toBeInTheDocument();
    expect(screen.getByText(/160 less than your target now/)).toBeVisible();
    expect(screen.getByText(/The first 7 days are free/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try Pro free" }));
    expect(h.track).toHaveBeenCalledWith("paywall_cta_clicked", {
      source: "personal_target",
      featureKey: "adaptive_tdee",
    });
    expect(screen.getByTestId("where")).toHaveTextContent(
      "/upgrade?from=personal_target"
    );
  });

  it("offers the plans, not a trial, to an account that has had one", () => {
    h.profile = { targetCalories: 2500, hasUsedTrial: true };
    renderOffer();
    expect(screen.getByRole("button", { name: "See Pro" })).toBeVisible();
    expect(screen.queryByText(/7 days/)).toBeNull();
  });

  it("offers the plans when the App Store says the trial is used", () => {
    h.store = { monthly: "ineligible", yearly: "ineligible" };
    renderOffer();
    expect(screen.getByRole("button", { name: "See Pro" })).toBeVisible();
  });

  it("Not now hides it, and it stays hidden for this account", () => {
    const first = renderOffer();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(
      screen.queryByRole("region", { name: "Your personal target is ready" })
    ).toBeNull();
    first.unmount();
    renderOffer();
    expect(
      screen.queryByRole("region", { name: "Your personal target is ready" })
    ).toBeNull();
  });
});

describe("FoodHeroCard draws it under the wheel, today only", () => {
  const base = {
    finalTarget: 2500,
    protein: 150,
    carbs: 250,
    fat: 70,
    showWarmup: false,
    warmupFraction: 1,
    adaptiveStalled: false,
  };
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };

  function hero(targets: Partial<EffectiveTargets>, isToday = true) {
    return render(
      <MemoryRouter>
        <FoodHeroCard
          selectedDate="2026-11-13"
          isToday={isToday}
          dailyTargets={{ ...base, ...targets } as unknown as EffectiveTargets}
          dailyTotals={totals}
        />
      </MemoryRouter>
    );
  }

  it("shows the card for a free account whose target is ready", () => {
    hero({ personalTarget: 2340 });
    expect(
      screen.getByRole("region", { name: "Your personal target is ready" })
    ).toBeInTheDocument();
  });

  it("shows nothing before it is ready, or on another day", () => {
    hero({ personalTarget: null });
    expect(
      screen.queryByRole("region", { name: "Your personal target is ready" })
    ).toBeNull();
    hero({ personalTarget: 2340 }, false);
    expect(
      screen.queryByRole("region", { name: "Your personal target is ready" })
    ).toBeNull();
  });
});
