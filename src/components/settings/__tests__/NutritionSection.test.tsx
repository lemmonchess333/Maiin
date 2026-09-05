/**
 * Settings pills cohesion. Pins that the Nutrition "Weekly pace" picker
 * renders through the shared SegmentedControl primitive (radiogroup) — not
 * the old bespoke purple-outline pills — and that picking a pace writes the
 * rate. Render-level (jsdom), no Firebase emulator.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";
import NutritionSection from "../NutritionSection";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";
import type { ActivityLevel } from "@/lib/tdee";
import type { GoalWeightPlan } from "@/lib/goalWeightPlan";
import { calculateTDEE } from "@/lib/tdee";
import {
  offsetFromWeeklyRate,
  MIN_TARGET_CALORIES,
} from "@/lib/macroConstants";
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

describe("NutritionSection — editing the calorie override", () => {
  function setup(customCalorieTarget?: number) {
    const updateProfile = vi.fn(
      async (_data: Partial<UserProfile>) =>
        ({ ok: true }) as UpdateProfileResult
    );
    const props = {
      profile: { uid: "u-1", customCalorieTarget } as UserProfile,
      age: 25,
      setAge: vi.fn(),
      activityLevel: "moderate" as ActivityLevel,
      setActivityLevel: vi.fn(),
      currentKg: 75,
      goalWeightKg: 76.5,
      setGoalWeightKg: vi.fn(),
      weeklyRateKg: 0.5,
      setWeeklyRateKg: vi.fn(),
      goalPlan,
      tdee: DEFAULT_TDEE,
      updateProfile,
      inline: true,
    };
    const view = render(<NutritionSection {...props} />);
    const input = screen.getByRole("spinbutton", {
      name: "Override daily target (optional)",
    });
    return { ...view, props, input, updateProfile };
  }

  it("keeps every typed digit visible before saving the complete value on blur", async () => {
    const { input, updateProfile } = setup();
    for (const value of ["2", "24", "240", "2400"]) {
      fireEvent.change(input, { target: { value } });
      expect(input).toHaveValue(Number(value));
    }
    expect(updateProfile).not.toHaveBeenCalled();
    await act(async () => fireEvent.blur(input));
    expect(updateProfile).toHaveBeenCalledTimes(1);
    expect(updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        customCalorieTarget: 2400,
        targetCalories: 2400,
      })
    );
    const patch = updateProfile.mock.calls[0][0] as Partial<UserProfile>;
    expect(
      Math.abs(
        patch.targetProtein! * 4 +
          patch.targetCarbs! * 4 +
          patch.targetFat! * 9 -
          2400
      )
    ).toBeLessThanOrEqual(10);
  });

  it("clears a stored override on blur", async () => {
    const { input, updateProfile } = setup(2400);
    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveValue(null);
    await act(async () => fireEvent.blur(input));
    expect(updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        customCalorieTarget: 0,
        targetCalories: expect.any(Number),
      })
    );
  });

  it("reset writes a persistent no-override value and restores calculated targets", async () => {
    const { updateProfile, props, rerender } = setup(2400);
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Reset to calculated" })
      )
    );
    const patch = updateProfile.mock.calls[0][0];
    expect(patch.customCalorieTarget).toBe(0);
    expect(patch.targetCalories).toBeGreaterThan(0);
    expect(patch.targetProtein).toBeGreaterThan(0);
    expect(patch.targetCarbs).toBeGreaterThan(0);
    expect(patch.targetFat).toBeGreaterThan(0);
    rerender(
      <NutritionSection {...props} profile={{ ...props.profile, ...patch }} />
    );
    expect(
      screen.getByRole("spinbutton", {
        name: "Override daily target (optional)",
      })
    ).toHaveValue(null);
    expect(
      screen.queryByRole("button", { name: "Reset to calculated" })
    ).toBeNull();
  });

  it("still permits a below-floor override without silently clamping it", async () => {
    const { input, updateProfile } = setup();
    fireEvent.change(input, { target: { value: "900" } });
    await act(async () => fireEvent.blur(input));
    expect(updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ customCalorieTarget: 900, targetCalories: 900 })
    );
  });

  it("does not write a pending edit after the section unmounts", async () => {
    vi.useFakeTimers();
    try {
      const { input, unmount, updateProfile } = setup();
      fireEvent.change(input, { target: { value: "2400" } });
      unmount();
      await act(async () => vi.advanceTimersByTimeAsync(1000));
      expect(updateProfile).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("restores the persisted target when saving is rejected", async () => {
    const { input, updateProfile } = setup(2400);
    updateProfile.mockResolvedValue({ ok: false } as UpdateProfileResult);
    fireEvent.change(input, { target: { value: "2600" } });
    await act(async () => fireEvent.blur(input));
    expect(updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        customCalorieTarget: 2600,
        targetCalories: 2600,
      })
    );
    expect(input).toHaveValue(2400);
  });

  it("an older save response cannot erase a newer draft", async () => {
    const { input, updateProfile } = setup(2400);
    let complete!: (value: UpdateProfileResult) => void;
    updateProfile.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      })
    );
    fireEvent.change(input, { target: { value: "2500" } });
    fireEvent.blur(input);
    fireEvent.change(input, { target: { value: "2600" } });
    await act(async () => complete({ ok: true } as UpdateProfileResult));
    expect(input).toHaveValue(2600);
  });

  it("does not carry an unsaved target across an account switch", () => {
    const { input, rerender, props } = setup(2400);
    fireEvent.change(input, { target: { value: "2600" } });
    rerender(
      <NutritionSection
        {...props}
        profile={{ uid: "u-2", customCalorieTarget: 1800 } as UserProfile}
      />
    );
    expect(
      screen.getByRole("spinbutton", {
        name: "Override daily target (optional)",
      })
    ).toHaveValue(1800);
  });
});

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

/**
 * The manual override can be set below the 1200 kcal floor the app enforces
 * on the rate-derived path — `floorTargetCalories` guards that path only, and
 * the field is bounded by the profile sanitizer alone (0..10000).
 *
 * Owner decision 2026-08-12: warn, don't clamp. It is the user's own number,
 * and blocking it just pushes them to lower their goal weight instead. But the
 * app enforcing a floor higher up the same screen while saying nothing here is
 * the dishonest option.
 */
describe("NutritionSection — sub-floor override notice", () => {
  const withOverride = (customCalorieTarget?: number) =>
    ({
      uid: "u-1",
      displayName: "T",
      email: "t@e.com",
      customCalorieTarget,
    }) as UserProfile;

  it("warns when the typed target is under the floor", () => {
    render(
      <NutritionSection
        profile={withOverride(900)}
        age={25}
        setAge={vi.fn()}
        activityLevel={"moderate" as ActivityLevel}
        setActivityLevel={vi.fn()}
        currentKg={75}
        goalWeightKg={70}
        setGoalWeightKg={vi.fn()}
        weeklyRateKg={0.5}
        setWeeklyRateKg={vi.fn()}
        goalPlan={goalPlan}
        tdee={DEFAULT_TDEE}
        updateProfile={vi.fn(async () => ({ ok: true }) as UpdateProfileResult)}
        inline
      />
    );
    const notice = screen.getByText(/cal floor Tropos uses everywhere else/);
    // Names the actual constant, not a hardcoded string that could drift.
    expect(notice.textContent).toContain(String(MIN_TARGET_CALORIES));
  });

  it("stays silent at or above the floor, and when no override is set", () => {
    for (const target of [MIN_TARGET_CALORIES, 2000, undefined]) {
      cleanup();
      render(
        <NutritionSection
          profile={withOverride(target)}
          age={25}
          setAge={vi.fn()}
          activityLevel={"moderate" as ActivityLevel}
          setActivityLevel={vi.fn()}
          currentKg={75}
          goalWeightKg={70}
          setGoalWeightKg={vi.fn()}
          weeklyRateKg={0.5}
          setWeeklyRateKg={vi.fn()}
          goalPlan={goalPlan}
          tdee={DEFAULT_TDEE}
          updateProfile={vi.fn(
            async () => ({ ok: true }) as UpdateProfileResult
          )}
          inline
        />
      );
      expect(
        screen.queryByText(/cal floor Tropos uses everywhere else/)
      ).toBeNull();
    }
  });
});

/**
 * A held calorie target decays into a slower plan as the body changes, while
 * the app keeps naming the original pace. Adaptive TDEE answers this but is
 * Pro-gated, so a free user gets nothing.
 *
 * Owner decision 2026-08-12: surface it, offer a recalculation, never move
 * the number silently. These drive the REAL detector rather than a stubbed
 * flag, so the notice is pinned to a state the app can actually produce.
 */
describe("NutritionSection — target drift notice", () => {
  /** Maintenance for the body in DEFAULT_TDEE's fixture. */
  const MAINTENANCE = 2875;
  /** Target set at 90 kg for −0.5 kg/wk, now held at 78 kg. */
  const HELD = 2325;

  const driftedTdee = { ...DEFAULT_TDEE, tdee: 2689 };

  function renderDrift(over: Partial<UserProfile>, onRecalculate = vi.fn()) {
    render(
      <NutritionSection
        profile={
          {
            uid: "u-1",
            displayName: "T",
            email: "t@e.com",
            targetCalories: HELD,
            weeklyRateKg: -0.5,
            ...over,
          } as UserProfile
        }
        age={35}
        setAge={vi.fn()}
        activityLevel={"moderate" as ActivityLevel}
        setActivityLevel={vi.fn()}
        currentKg={78}
        goalWeightKg={75}
        setGoalWeightKg={vi.fn()}
        weeklyRateKg={0.5}
        setWeeklyRateKg={vi.fn()}
        goalPlan={goalPlan}
        tdee={driftedTdee}
        updateProfile={vi.fn(async () => ({ ok: true }) as UpdateProfileResult)}
        onRecalculate={onRecalculate}
        inline
      />
    );
    return { onRecalculate };
  }

  it("names both paces — the real one and the chosen one", () => {
    renderDrift({});
    const notice = screen.getByText(/Your body has changed since this target/);
    expect(notice.textContent).toContain("-0.33 kg/wk"); // what it now is
    expect(notice.textContent).toContain("-0.50 kg/wk"); // what was picked
  });

  it("offers a recalculation that fires the owner's persist recipe", () => {
    /* The button must not write targets itself — SettingsNutrition owns the
       payload, so a recalculation and an ordinary edit cannot drift apart. */
    const { onRecalculate } = renderDrift({});
    fireEvent.click(screen.getByRole("button", { name: /Recalculate for 78/ }));
    expect(onRecalculate).toHaveBeenCalledTimes(1);
  });

  it("says nothing to a user who pinned their own number", () => {
    cleanup();
    renderDrift({ customCalorieTarget: 1900 });
    expect(
      screen.queryByText(/Your body has changed since this target/)
    ).toBeNull();
  });

  it("says nothing while an adaptive target is already tracking", () => {
    cleanup();
    renderDrift({
      adaptiveCapState: {
        lastApplied: 2500,
        lastAppliedAt: "2026-08-04T00:00:00.000Z",
      },
    } as Partial<UserProfile>);
    expect(
      screen.queryByText(/Your body has changed since this target/)
    ).toBeNull();
  });

  it("says nothing when the target still matches the body", () => {
    cleanup();
    render(
      <NutritionSection
        profile={
          {
            uid: "u-1",
            displayName: "T",
            email: "t@e.com",
            targetCalories: HELD,
            weeklyRateKg: -0.5,
          } as UserProfile
        }
        age={35}
        setAge={vi.fn()}
        activityLevel={"moderate" as ActivityLevel}
        setActivityLevel={vi.fn()}
        currentKg={90}
        goalWeightKg={75}
        setGoalWeightKg={vi.fn()}
        weeklyRateKg={0.5}
        setWeeklyRateKg={vi.fn()}
        goalPlan={goalPlan}
        tdee={{ ...DEFAULT_TDEE, tdee: MAINTENANCE }}
        updateProfile={vi.fn(async () => ({ ok: true }) as UpdateProfileResult)}
        onRecalculate={vi.fn()}
        inline
      />
    );
    expect(
      screen.queryByText(/Your body has changed since this target/)
    ).toBeNull();
  });
});

describe("the adapting status line is wired to the learned target", () => {
  /* A reachability check, and it exists because a mutation found the gap:
     `adaptiveCalorieStatusLabel`'s second parameter is OPTIONAL, so deleting
     the argument at this call site compiles cleanly, every unit test of the
     label keeps passing, and the line silently goes back to claiming the
     formula figure above it is the adapted one.

     Asserted against the source rather than a render because the branch only
     appears for a profile whose adaptive layer has engaged — which needs
     `adaptiveCapState.lastAppliedAt` seeded past the warmup gate, a fixture
     this file's harness does not build. The wire-up is the thing that broke;
     this is what holds it. */
  const src = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../NutritionSection.tsx"),
    "utf8"
  )
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");

  it("passes adaptiveCapState.lastApplied into the label", () => {
    expect(src).toMatch(
      /adaptiveCalorieStatusLabel\([\s\S]{0,200}?adaptiveCapState\?\.lastApplied/
    );
  });
});
