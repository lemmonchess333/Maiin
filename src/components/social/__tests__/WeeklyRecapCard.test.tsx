import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// SOCIAL-RECAP-READS-01: the data hooks must NOT run until the user taps
// "Build recap". We mock them as spies and assert call counts.

const mockProfile = vi.hoisted(() => ({
  current: { uid: "me", displayName: "Al" },
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mockProfile.current, profile: mockProfile.current }),
}));

const useWorkoutsSpy = vi.hoisted(() => vi.fn(() => ({ workouts: [] })));
vi.mock("@/hooks/useWorkouts", () => ({
  useWorkouts: useWorkoutsSpy,
  workoutTonnageKg: () => 0,
}));

const useRunningStatsSpy = vi.hoisted(() =>
  vi.fn(() => ({ weeklyData: [], runs: [] }))
);
vi.mock("@/hooks/useRunningStats", () => ({
  useRunningStats: useRunningStatsSpy,
}));

vi.mock("@/features/streaks/useStreaks", () => ({
  useStreaks: () => ({ currentStreak: 3 }),
}));
vi.mock("@/components/share/ShareCardSheet", () => ({
  default: () => <div data-testid="share-sheet" />,
}));

import WeeklyRecapCard from "../WeeklyRecapCard";

describe("WeeklyRecapCard — SOCIAL-RECAP-READS-01 lazy hydration", () => {
  beforeEach(() => {
    useWorkoutsSpy.mockClear();
    useRunningStatsSpy.mockClear();
    mockProfile.current = { uid: "me", displayName: "Al" };
  });

  it("does NOT mount the data hooks before the Build recap tap", () => {
    render(<WeeklyRecapCard />);
    expect(
      screen.getByRole("button", { name: /build recap/i })
    ).toBeInTheDocument();
    expect(useWorkoutsSpy).not.toHaveBeenCalled();
    expect(useRunningStatsSpy).not.toHaveBeenCalled();
  });

  it("hydrates the sources only after the tap", () => {
    render(<WeeklyRecapCard />);
    fireEvent.click(screen.getByRole("button", { name: /build recap/i }));
    expect(useWorkoutsSpy).toHaveBeenCalled();
    expect(useRunningStatsSpy).toHaveBeenCalled();
  });

  it("a zero-session week shows an honest instruction, not silence", () => {
    render(<WeeklyRecapCard />);
    fireEvent.click(screen.getByRole("button", { name: /build recap/i }));
    // No workouts/runs mocked → zero sessions → calm empty copy.
    expect(
      screen.getByText(/no sessions logged this week yet/i)
    ).toBeInTheDocument();
  });
});
