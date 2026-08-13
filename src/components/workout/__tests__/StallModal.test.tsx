/**
 * The plateau nudge's "+150 cal" action.
 *
 * There was no test file for this modal at all, and the two things it got
 * wrong were the two things a test would have pinned:
 *
 *   1. It based the bump on `profile.targetCalories` — the FORMULA anchor,
 *      which deliberately never moves once the adaptive layer engages —
 *      rather than the target the user is being shown. Because writing a
 *      manual override also switches adaptive OFF, a Pro user on a learned
 *      2919 tapped "+150" and landed on 2500: a 419 kcal DECREASE, under a
 *      success toast reading "Calorie target increased by 150".
 *
 *   2. It wrote `customCalorieTarget` alone. Nothing derives the mirrors
 *      from it, so `targetCalories` and all three macro targets kept their
 *      previous values — the failure `buildGoalWeightPersistPayload`'s own
 *      history comment describes ("a profile storing 1400 alongside a triple
 *      summing to 2209").
 *
 * Both assertions are on the WRITE, because that is where the damage was:
 * the modal rendered correctly throughout.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

/* Typed param, not bare `vi.fn(async () => …)`: without it the mock's
   argument tuple infers as `[]` and every `mock.calls[0][0]` read below is a
   type error. vitest runs it happily either way — `tsc -b` is the gate. */
const updateProfile = vi.fn(
  async (_patch: Record<string, number>) => ({ ok: true })
);
const profile = {
  weightKg: 80,
  heightCm: 180,
  age: 30,
  sex: "male" as const,
  activityLevel: "moderate" as const,
  targetCalories: 2500,
  program: { goal: "cut" },
};

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ profile, updateProfile }),
  // The stall cooldown key is uid-scoped — exercise names are global, so an
  // unscoped key let one account's cooldown suppress another's prompt.
  useUidForStorageKey: () => "u-test",
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

/* The learned target the user is actually looking at — deliberately
   DIFFERENT from profile.targetCalories, which is the whole point. */
const finalTarget = vi.fn(() => 2919);
vi.mock("@/hooks/useEffectiveTargets", () => ({
  useEffectiveTargets: () => ({ finalTarget: finalTarget() }),
}));

import StallModal from "../StallModal";

const EXERCISE = { name: "Bench Press", weight: 80 };

beforeEach(() => {
  vi.clearAllMocks();
  updateProfile.mockResolvedValue({ ok: true });
  finalTarget.mockReturnValue(2919);
  localStorage.clear();
});
afterEach(() => cleanup());

function open() {
  render(<StallModal exercise={EXERCISE} onClose={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /adjust|increase|yes/i }));
}

describe("StallModal — the +150 action", () => {
  it("bumps the target the user is SHOWN, not the formula anchor", async () => {
    open();
    await waitFor(() => expect(updateProfile).toHaveBeenCalled());

    const patch = updateProfile.mock.calls[0][0];
    // 2919 + 150. Pre-fix this was 2650 (2500 + 150) — below the target
    // already on screen, so the "increase" showed up as a drop.
    expect(patch.customCalorieTarget).toBe(3069);
  });

  it("writes the mirrors in the same patch", async () => {
    open();
    await waitFor(() => expect(updateProfile).toHaveBeenCalled());

    const patch = updateProfile.mock.calls[0][0];
    // Pre-fix the patch was `{ customCalorieTarget }` and nothing else, so
    // every display surface kept rendering the old numbers.
    expect(patch.targetCalories).toBe(3069);
    expect(patch.targetProtein).toBeGreaterThan(0);
    expect(patch.targetCarbs).toBeGreaterThan(0);
    expect(patch.targetFat).toBeGreaterThan(0);
  });

  it("writes macros that reconcile to the new target", async () => {
    open();
    await waitFor(() => expect(updateProfile).toHaveBeenCalled());

    const p = updateProfile.mock.calls[0][0];
    const kcal = p.targetProtein * 4 + p.targetCarbs * 4 + p.targetFat * 9;
    expect(Math.abs(kcal - 3069)).toBeLessThanOrEqual(10);
  });

  it("still bumps correctly for a user with no adaptive layer", async () => {
    // The free / not-yet-engaged case, where the shown target IS the formula
    // one. The paired control: without it, a fix that simply hard-coded a
    // different base would pass the first test.
    finalTarget.mockReturnValue(2500);
    open();
    await waitFor(() => expect(updateProfile).toHaveBeenCalled());

    const patch = updateProfile.mock.calls[0][0];
    expect(patch.customCalorieTarget).toBe(2650);
    expect(patch.targetCalories).toBe(2650);
  });

  it("does not stamp the suppression key when the write fails", async () => {
    // Pre-existing behaviour worth keeping honest: a failed write must leave
    // the nudge retryable rather than silently suppressed for this lift.
    updateProfile.mockResolvedValue({ ok: false });
    open();
    await waitFor(() => expect(updateProfile).toHaveBeenCalled());

    expect(localStorage.getItem(`tropos_stall_${EXERCISE.name}`)).toBeNull();
  });
});
