/**
 * FoodHeroCard — single shared display mode invariant.
 *
 * The hero used to split its left⇄eaten framing across two owners: the
 * calorie ring carried `mode`, while each macro tile tracked its own
 * independent state. That let the ring read "… kcal LEFT" while all three
 * tiles read "…g eaten" — two opposite framings on one card. This suite
 * pins the unification: the ring AND all three macro tiles share ONE mode,
 * tapping the ring OR any tile flips all four together, and the choice
 * persists under the calorie-ring storage key.
 *
 * isToday={false} keeps the test on the mode wiring only — it skips the
 * glance line, warmup bar, and celebration sequence, none of which are
 * relevant to the shared-mode contract.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import FoodHeroCard from "../FoodHeroCard";
import type { EffectiveTargets } from "@/hooks/useEffectiveTargets";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ profile: { targetCalories: 2000 } }),
}));

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

const MODE_STORAGE_KEY = "tropos.food.calorieRingMode";

// Under-target totals so the macro tiles read "left" (not "over") in left mode.
const dailyTotals = { calories: 1000, protein: 50, carbs: 80, fat: 20 };

const dailyTargets = {
  finalTarget: 2000,
  protein: 150,
  carbs: 200,
  fat: 60,
  showWarmup: false,
} as unknown as EffectiveTargets;

function renderHero(
  opts: { isToday?: boolean; targets?: Partial<EffectiveTargets> } = {}
) {
  const { isToday = false, targets } = opts;
  return render(
    <MemoryRouter>
      <FoodHeroCard
        selectedDate="2026-06-09"
        isToday={isToday}
        dailyTargets={
          (targets
            ? { ...dailyTargets, ...targets }
            : dailyTargets) as EffectiveTargets
        }
        dailyTotals={dailyTotals}
      />
    </MemoryRouter>
  );
}

// The three macro tiles render as <button data-macro="…">. Their label
// (<p>left</p> / <p>eaten</p>) is the per-tile framing we assert on.
function tileModes(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("[data-macro]")).map((btn) => {
    const text = btn.textContent ?? "";
    if (text.includes("eaten")) return "eaten";
    if (text.includes("over")) return "over";
    if (text.includes("left")) return "left";
    return "?";
  });
}

// The ring is the only button carrying the toggle aria-label.
function ringButton() {
  return screen.getByRole("button", {
    name: /toggle between calories left and calories eaten/i,
  });
}

describe("FoodHeroCard — single shared display mode", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to 'left' for the ring and all three tiles", () => {
    const { container } = renderHero();
    expect(tileModes(container)).toEqual(["left", "left", "left"]);
    expect(ringButton().getAttribute("aria-label")).toMatch(/remaining/i);
  });

  it("tapping a macro tile flips the ring AND all three tiles to 'eaten'", () => {
    const { container } = renderHero();

    const proteinTile = within(container).getByRole("button", {
      name: /protein/i,
    });
    fireEvent.click(proteinTile);

    // All three tiles flipped together — not just the tapped one.
    expect(tileModes(container)).toEqual(["eaten", "eaten", "eaten"]);
    // The ring flipped too.
    expect(ringButton().getAttribute("aria-label")).toMatch(/eaten/i);
    // Persisted under the shared key.
    expect(window.localStorage.getItem(MODE_STORAGE_KEY)).toBe("eaten");
  });

  it("tapping the ring flips all three tiles too", () => {
    const { container } = renderHero();

    fireEvent.click(ringButton());

    expect(tileModes(container)).toEqual(["eaten", "eaten", "eaten"]);
    expect(window.localStorage.getItem(MODE_STORAGE_KEY)).toBe("eaten");

    // …and back again — ring + tiles stay in lockstep.
    fireEvent.click(ringButton());
    expect(tileModes(container)).toEqual(["left", "left", "left"]);
    expect(window.localStorage.getItem(MODE_STORAGE_KEY)).toBe("left");
  });

  it("hydrates the shared mode from the persisted calorie-ring key", () => {
    window.localStorage.setItem(MODE_STORAGE_KEY, "eaten");
    const { container } = renderHero();
    expect(tileModes(container)).toEqual(["eaten", "eaten", "eaten"]);
    expect(ringButton().getAttribute("aria-label")).toMatch(/eaten/i);
  });
});

describe("FoodHeroCard — carb-periodization rationale", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  const TRAINING_ANNOTATION =
    "Lift + Run day — extra carbs for fuel & recovery";

  it("renders the rationale clause on a training day, today", () => {
    renderHero({
      isToday: true,
      targets: { dayType: "both", annotation: TRAINING_ANNOTATION },
    });
    // The "<day> — " prefix is stripped (the day label is already shown by the
    // ring caption); only the rationale clause is surfaced, capitalised.
    expect(
      screen.getByText("Extra carbs for fuel & recovery")
    ).toBeInTheDocument();
    // …and it does NOT re-render the raw day-label prefix as the line.
    expect(screen.queryByText(TRAINING_ANNOTATION)).not.toBeInTheDocument();
  });

  it("suppresses the rationale on rest days", () => {
    renderHero({
      isToday: true,
      targets: { dayType: "rest", annotation: "Rest day — baseline targets" },
    });
    expect(screen.queryByText(/baseline targets/i)).not.toBeInTheDocument();
  });

  it("suppresses the rationale on past/future diary views (not today)", () => {
    renderHero({
      isToday: false,
      targets: { dayType: "both", annotation: TRAINING_ANNOTATION },
    });
    expect(screen.queryByText(/extra carbs for fuel/i)).not.toBeInTheDocument();
  });

  it("suppresses the rationale when the annotation is empty", () => {
    const { container } = renderHero({
      isToday: true,
      targets: { dayType: "both", annotation: "" },
    });
    // No stray rationale paragraph — the macro tile row is the last block.
    expect(container.querySelector("[data-macro]")).toBeInTheDocument();
    expect(screen.queryByText(/extra carbs/i)).not.toBeInTheDocument();
  });
});
