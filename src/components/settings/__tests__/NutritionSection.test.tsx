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

afterEach(() => cleanup());

const goalPlan: GoalWeightPlan = {
  direction: "gain",
  fitnessGoal: "lean bulk",
  dailyOffset: 550,
  effectiveRateKgPerWeek: 0.5,
} as GoalWeightPlan;

function renderSection(weeklyRateKg = 0.5) {
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
      mealsTarget={10}
      setMealsTarget={vi.fn()}
      tdee={{
        bmr: 1600,
        tdee: 2400,
        targetCalories: 2950,
        protein: 135,
        carbs: 462,
        fat: 88,
        deficit: 0,
      }}
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
