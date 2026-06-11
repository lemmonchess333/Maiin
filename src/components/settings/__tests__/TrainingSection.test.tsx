/**
 * TrainingSection A1c contract — inline plan-structure controls.
 *
 * Pin the live-save shape: each stepper / picker tap immediately
 * writes the right field shape (count + regenerated weekSchedule +
 * runTargetWriteFields for run days) with throwOnError, and reverts
 * local state on failure.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import TrainingSection from "../TrainingSection";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";

// TrainingSection renders RunFitnessSection, whose Pace Insights hook pulls in
// auth/subscription/running-stats. Stub it — this suite tests the plan-structure
// controls, not Adaptive Paces (covered by runPaces + RunFitnessSection tests).
vi.mock("@/hooks/usePaceInsight", () => ({
  usePaceInsight: () => ({ insight: null, accept: vi.fn(), dismiss: vi.fn() }),
}));

// TrainingSection also renders HeartRateZonesSection, whose useHeartRate hook
// reads useAuth. Stub it — HR-zone maths is covered by hrZones tests.
vi.mock("@/hooks/useHeartRate", () => ({
  useHeartRate: () => ({
    maxHr: 188,
    maxHrSource: "estimate",
    zones: [],
    liveAvailable: false,
    bpm: null,
    zone: null,
  }),
}));

type UpdateProfileFn = (
  data: Partial<UserProfile>,
  opts?: { allowProtected?: boolean; throwOnError?: boolean }
) => Promise<UpdateProfileResult>;
type NavigateFn = (
  path: string,
  opts?: { state?: Record<string, unknown> }
) => void;
type RefreshRunScheduleFn = (overrides?: {
  weekSchedule?: unknown;
  weeklyRunDaysTarget?: number;
}) => Promise<void>;

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "u-1",
    displayName: "Test",
    email: "t@example.com",
    weeklyWorkoutsTarget: 4,
    weeklyRunDaysTarget: 2,
    weeklyRunsTarget: 2,
    preferredSplit: "ppl",
    ...overrides,
  } as UserProfile;
}

describe("TrainingSection — A1c plan-structure controls", () => {
  let updateProfile: ReturnType<typeof vi.fn> & UpdateProfileFn;
  let navigate: ReturnType<typeof vi.fn> & NavigateFn;
  let refreshRunSchedule: ReturnType<typeof vi.fn> & RefreshRunScheduleFn;
  let onOpenWeeklyLayout: ReturnType<typeof vi.fn> & (() => void);

  beforeEach(() => {
    updateProfile = vi.fn(
      async () => ({ ok: true }) as { ok: true }
    ) as ReturnType<typeof vi.fn> & UpdateProfileFn;
    navigate = vi.fn() as ReturnType<typeof vi.fn> & NavigateFn;
    refreshRunSchedule = vi.fn(async () => {}) as ReturnType<typeof vi.fn> &
      RefreshRunScheduleFn;
    onOpenWeeklyLayout = vi.fn() as ReturnType<typeof vi.fn> & (() => void);
  });

  it("renders steppers initialized from profile fields", () => {
    render(
      <TrainingSection
        profile={makeProfile({
          weeklyWorkoutsTarget: 5,
          weeklyRunDaysTarget: 3,
        })}
        updateProfile={updateProfile}
        refreshRunSchedule={refreshRunSchedule}
        navigate={navigate}
        onOpenWeeklyLayout={onOpenWeeklyLayout}
      />
    );
    // Lift stepper shows 5; run stepper shows 3.
    expect(screen.getAllByText("5").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
  });

  it("lift-days stepper writes weeklyWorkoutsTarget + a fresh weekSchedule with throwOnError", async () => {
    render(
      <TrainingSection
        profile={makeProfile({
          weeklyWorkoutsTarget: 4,
          weeklyRunDaysTarget: 2,
        })}
        updateProfile={updateProfile}
        refreshRunSchedule={refreshRunSchedule}
        navigate={navigate}
        onOpenWeeklyLayout={onOpenWeeklyLayout}
      />
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Increase lift days/i })
      );
    });
    expect(updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        weeklyWorkoutsTarget: 5,
        weekSchedule: expect.any(Array),
      }),
      expect.objectContaining({ throwOnError: true })
    );
  });

  it("run-days stepper writes BOTH legacy and v2 run-target fields + a regenerated schedule", async () => {
    render(
      <TrainingSection
        profile={makeProfile({ weeklyRunDaysTarget: 2, weeklyRunsTarget: 2 })}
        updateProfile={updateProfile}
        refreshRunSchedule={refreshRunSchedule}
        navigate={navigate}
        onOpenWeeklyLayout={onOpenWeeklyLayout}
      />
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Increase run days/i })
      );
    });
    expect(updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        weeklyRunDaysTarget: 3,
        weeklyRunsTarget: 3,
        weekSchedule: expect.any(Array),
      }),
      expect.objectContaining({ throwOnError: true })
    );
  });

  it("split picker uses radiogroup semantics and writes preferredSplit", async () => {
    render(
      <TrainingSection
        profile={makeProfile({ preferredSplit: "ppl" })}
        updateProfile={updateProfile}
        refreshRunSchedule={refreshRunSchedule}
        navigate={navigate}
        onOpenWeeklyLayout={onOpenWeeklyLayout}
      />
    );
    const group = screen.getByRole("radiogroup", { name: /lift split/i });
    expect(group).toBeInTheDocument();
    // Tap "Upper / Lower".
    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: /Upper \/ Lower/i }));
    });
    expect(updateProfile).toHaveBeenCalledWith(
      { preferredSplit: "upper_lower" },
      expect.objectContaining({ throwOnError: true })
    );
  });

  it("stepper hits the min bound at 2 (lift) and disables Decrease", () => {
    render(
      <TrainingSection
        profile={makeProfile({ weeklyWorkoutsTarget: 2 })}
        updateProfile={updateProfile}
        refreshRunSchedule={refreshRunSchedule}
        navigate={navigate}
        onOpenWeeklyLayout={onOpenWeeklyLayout}
      />
    );
    const dec = screen.getByRole("button", {
      name: /Decrease lift days/i,
    }) as HTMLButtonElement;
    expect(dec.disabled).toBe(true);
  });

  it("stepper hits the min bound at 0 (run) and disables Decrease", () => {
    render(
      <TrainingSection
        profile={makeProfile({ weeklyRunDaysTarget: 0, weeklyRunsTarget: 0 })}
        updateProfile={updateProfile}
        refreshRunSchedule={refreshRunSchedule}
        navigate={navigate}
        onOpenWeeklyLayout={onOpenWeeklyLayout}
      />
    );
    const dec = screen.getByRole("button", {
      name: /Decrease run days/i,
    }) as HTMLButtonElement;
    expect(dec.disabled).toBe(true);
  });

  it("stepper hits the max bound at 7 and disables Increase", () => {
    render(
      <TrainingSection
        profile={makeProfile({ weeklyWorkoutsTarget: 7 })}
        updateProfile={updateProfile}
        refreshRunSchedule={refreshRunSchedule}
        navigate={navigate}
        onOpenWeeklyLayout={onOpenWeeklyLayout}
      />
    );
    const inc = screen.getByRole("button", {
      name: /Increase lift days/i,
    }) as HTMLButtonElement;
    expect(inc.disabled).toBe(true);
  });

  it("reverts local state when updateProfile rejects", async () => {
    updateProfile.mockImplementationOnce(async () => {
      throw new Error("permission-denied");
    });
    render(
      <TrainingSection
        profile={makeProfile({ weeklyWorkoutsTarget: 4 })}
        updateProfile={updateProfile}
        refreshRunSchedule={refreshRunSchedule}
        navigate={navigate}
        onOpenWeeklyLayout={onOpenWeeklyLayout}
      />
    );
    // Tap +, optimistic state shows 5 then reverts to 4 after rejection.
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Increase lift days/i })
      );
    });
    // Final visible value is back to 4 (the saved profile value).
    // jsdom microtask flush via the act above covers the catch path.
    const liftRow = screen.getByText(/Lift days \/ week/i).closest("div");
    expect(liftRow?.textContent).toContain("4");
  });
});
