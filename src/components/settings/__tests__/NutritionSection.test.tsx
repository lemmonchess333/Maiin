/**
 * Settings pills cohesion. Pins that the Nutrition "Weekly pace" picker
 * renders through the shared SegmentedControl primitive (radiogroup) — not
 * the old bespoke purple-outline pills — and that picking a pace writes the
 * rate. Render-level (jsdom), no Firebase emulator.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import NutritionSection from "../NutritionSection";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";
import type { ActivityLevel } from "@/lib/tdee";
import type { GoalWeightPlan } from "@/lib/goalWeightPlan";
import { calculateTDEE } from "@/lib/tdee";
import { offsetFromWeeklyRate } from "@/lib/macroConstants";
import type { TDEEResult } from "@/lib/tdee";

afterEach(() => cleanup());

const goalPlan: GoalWeightPlan = {
  direction: "gain",
  fitnessGoal: "lean bulk",
  dailyOffset: 550,
  effectiveRateKgPerWeek: 0.5,
} as GoalWeightPlan;

const DEFAULT_TDEE: TDEEResult = {
  bmr: 1600,
  tdee: 2400,
  targetCalories: 2950,
  protein: 135,
  carbs: 462,
  fat: 88,
  deficit: 0,
  proteinCapped: false,
  proteinUncapped: 135,
};

function renderSection(weeklyRateKg = 0.5, tdee: TDEEResult = DEFAULT_TDEE) {
  const setWeeklyRateKg = vi.fn();
  render(
    <NutritionSection
      profile={
        { uid: "u-1", displayName: "T", email: "t@e.com" } as UserProfile
      }
      age={25}
      setAge={vi.fn()}
      activityLevel={"moderate" as ActivityLevel}
      setActivityLevel={vi.fn()}
      currentKg={75}
      goalWeightKg={76.5}
      setGoalWeightKg={vi.fn()}
      weeklyRateKg={weeklyRateKg}
      setWeeklyRateKg={setWeeklyRateKg}
      goalPlan={goalPlan}
      tdee={tdee}
      updateProfile={vi.fn(async () => ({ ok: true }) as UpdateProfileResult)}
      inline
    />
  );
  return { setWeeklyRateKg };
}

describe("NutritionSection — Weekly pace uses SegmentedControl", () => {
  it("renders the pace picker as a labelled radiogroup", () => {
    renderSection();
    expect(
      screen.getByRole("radiogroup", { name: "Weekly pace" })
    ).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Relaxed/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Steady/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Fast/ })).toBeTruthy();
  });

  it("reflects the selected rate via aria-checked", () => {
    renderSection(0.5);
    expect(
      screen.getByRole("radio", { name: /Steady/ }).getAttribute("aria-checked")
    ).toBe("true");
  });

  it("picking a pace writes the rate", () => {
    const { setWeeklyRateKg } = renderSection(0.5);
    fireEvent.click(screen.getByRole("radio", { name: /Fast/ }));
    expect(setWeeklyRateKg).toHaveBeenCalledWith(0.75);
  });
});

/**
 * The pace picker can hand out a target too small to hold bodyweight protein
 * alongside the essential fat floor, in which case protein is set to what
 * fits. Before this notice the macro triple was the only trace, and a 168 g
 * figure where the plan intends 242 g reads as a plan choice rather than a
 * shortfall.
 *
 * Both tdee fixtures here come from the real `calculateTDEE` rather than
 * hand-written flags, so the notice is pinned to a state the app can actually
 * produce — if the pace options, the calorie floor or the protein cap move
 * such that no reachable body trips it, the first test fails on its own
 * precondition instead of passing against a staged prop.
 */
const HEAVY_FAST_CUT = calculateTDEE(
  110,
  180,
  65,
  "sedentary",
  "cut",
  "female",
  offsetFromWeeklyRate(-0.75)
);

const ORDINARY_CUT = calculateTDEE(
  75,
  185,
  40,
  "moderate",
  "cut",
  "male",
  offsetFromWeeklyRate(-0.5)
);

describe("NutritionSection — capped-protein notice", () => {
  it("says so when the chosen pace cannot hold the plan's protein", () => {
    // Precondition, asserted rather than assumed: this body really is capped,
    // and its target cleared the 1200 safety floor rather than being clamped.
    expect(HEAVY_FAST_CUT.proteinCapped).toBe(true);
    expect(HEAVY_FAST_CUT.targetCalories).toBeGreaterThan(1200);

    renderSection(0.75, HEAVY_FAST_CUT);
    const notice = screen.getByText(/A slower pace holds protein/);
    // Both numbers are present: what fits, and what the plan wanted.
    expect(notice.textContent).toContain(String(HEAVY_FAST_CUT.protein));
    expect(notice.textContent).toContain(
      String(HEAVY_FAST_CUT.proteinUncapped)
    );
  });

  it("stays silent on a pace that fits", () => {
    expect(ORDINARY_CUT.proteinCapped).toBe(false);
    renderSection(0.5, ORDINARY_CUT);
    expect(screen.queryByText(/A slower pace holds protein/)).toBeNull();
  });
});
