/**
 * FoodHeroCard on a day before the account began (Food10 (3)): no ring,
 * no Details and no macro tiles, since a target and an empty day would be
 * claims about a day the app knows nothing about. A day with food logged
 * on it keeps the ring.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import FoodHeroCard from "../FoodHeroCard";
import type { EffectiveTargets } from "@/hooks/useEffectiveTargets";

// The account began on 10 June 2026 (local noon, so no zone moves the day).
const createdAt = {
  toMillis: () => new Date(2026, 5, 10, 12).getTime(),
};

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ profile: { targetCalories: 2000, createdAt } }),
  useUid: () => null,
  useUidForStorageKey: () => "u-test",
}));

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

const dailyTargets = {
  finalTarget: 2000,
  protein: 150,
  carbs: 200,
  fat: 60,
  showWarmup: false,
} as unknown as EffectiveTargets;

const EMPTY = { calories: 0, protein: 0, carbs: 0, fat: 0 };

function renderHero(selectedDate: string, dailyTotals: typeof EMPTY = EMPTY) {
  return render(
    <MemoryRouter>
      <FoodHeroCard
        selectedDate={selectedDate}
        isToday={false}
        dailyTargets={dailyTargets}
        dailyTotals={dailyTotals}
        onTapDrillDown={() => {}}
      />
    </MemoryRouter>
  );
}

const RING = /toggle between calories left and calories logged/i;

describe("FoodHeroCard — before the account began", () => {
  it("says so in place of the ring, with no Details or tiles", () => {
    const { container } = renderHero("2026-06-09");
    expect(screen.getByText("Before you joined")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: RING })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /view nutrition breakdown/i })
    ).toBeNull();
    expect(container.querySelectorAll("[data-macro]")).toHaveLength(0);
  });

  it("draws the ring from the day the account began", () => {
    const { container } = renderHero("2026-06-10");
    expect(screen.queryByText("Before you joined")).toBeNull();
    expect(screen.getByRole("button", { name: RING })).toBeInTheDocument();
    expect(container.querySelectorAll("[data-macro]")).toHaveLength(3);
  });

  it("keeps the ring on an earlier day that has food logged", () => {
    renderHero("2026-06-09", {
      calories: 500,
      protein: 20,
      carbs: 60,
      fat: 15,
    });
    expect(screen.queryByText("Before you joined")).toBeNull();
    expect(screen.getByRole("button", { name: RING })).toBeInTheDocument();
  });
});
