/**
 * FoodMacroRow: Food's protein, carbs and fat as one row with no boxes
 * (Food11 call 4), a sibling of the calorie wheel since the week strip
 * went between them.
 *
 * The lockstep with the wheel (one shared left and logged mode) is pinned
 * in `FoodHeroCard.test.tsx`, which draws the pair. This file holds what
 * is the row's alone.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import FoodMacroRow from "../FoodMacroRow";
import type { EffectiveTargets } from "@/hooks/useEffectiveTargets";
import { setCalorieRingMode } from "@/hooks/useCalorieRingMode";
import { haptic } from "@/lib/haptic";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

const MODE_STORAGE_KEY = "tropos.food.calorieRingMode";

const dailyTargets = {
  finalTarget: 2000,
  protein: 150,
  carbs: 200,
  fat: 60,
} as unknown as EffectiveTargets;

const dailyTotals = { protein: 50, carbs: 80, fat: 20 };

function renderRow(drawIn = false) {
  return render(
    <FoodMacroRow
      dailyTargets={dailyTargets}
      dailyTotals={dailyTotals}
      drawIn={drawIn}
    />
  );
}

beforeEach(() => {
  window.localStorage.setItem(MODE_STORAGE_KEY, "left");
  setCalorieRingMode("left");
  vi.mocked(haptic).mockClear();
});

describe("FoodMacroRow — one row with no boxes", () => {
  it("draws protein, carbs and fat in the row form, outside any card", () => {
    // Three boxed tiles under the boxed ring were four of the twelve
    // boxes the first screen carried.
    const { container } = renderRow();
    const macros = Array.from(container.querySelectorAll("[data-macro]"));
    expect(macros.map((m) => m.getAttribute("data-macro"))).toEqual([
      "protein",
      "carbs",
      "fat",
    ]);
    for (const macro of macros) {
      expect(macro).toHaveClass("text-left");
      expect(macro.closest(".card-shadow")).toBeNull();
      expect(macro.closest(".bg-card")).toBeNull();
    }
    const grid = macros[0].parentElement!;
    expect(grid).toHaveClass("grid", "grid-cols-3");
    expect(macros.every((m) => m.parentElement === grid)).toBe(true);
  });

  it("stacks the three when the row is too narrow for them", () => {
    const { container } = renderRow();
    const grid = container.querySelector("[data-macro]")!.parentElement!;
    expect(grid).toHaveClass("@max-[14em]:grid-cols-1");
    expect(grid.parentElement).toHaveClass("@container");
  });
});

describe("FoodMacroRow — the wheel's mode, from the wheel's store", () => {
  it("reads what is left by default", () => {
    renderRow();
    expect(screen.getByRole("button", { name: /protein/i })).toHaveTextContent(
      /100g\s*left/
    );
  });

  it("a tap on any macro flips the stored mode for all three, with a tick", () => {
    renderRow();
    fireEvent.click(screen.getByRole("button", { name: /carbs/i }));
    expect(window.localStorage.getItem(MODE_STORAGE_KEY)).toBe("eaten");
    expect(haptic).toHaveBeenCalledWith("light");
    // The word flips at once; the figure counts across to the new value.
    for (const name of [/protein/i, /carbs/i, /fat/i]) {
      expect(screen.getByRole("button", { name })).toHaveTextContent(
        /g\s*logged$/
      );
    }
  });

  it("follows a mode set elsewhere, as a tap on the wheel sets it", async () => {
    renderRow();
    setCalorieRingMode("eaten");
    expect(await screen.findAllByText("logged")).toHaveLength(3);
  });
});
