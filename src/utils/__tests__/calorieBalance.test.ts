import { describe, it, expect } from "vitest";
import { calcDayBalance, getBalanceColor } from "../calorieBalance";
import { THEME } from "@/lib/theme";

describe("calcDayBalance", () => {
  it("computes deficit when maintenance expenditure exceeds intake", () => {
    // expenditure = maintenance TDEE (already exercise-inclusive, Nutr1)
    const result = calcDayBalance("2026-03-15", "Sat", 1800, 2100);
    expect(result.balance).toBe(300);
    expect(result.burned).toBe(2100);
    expect(result.consumed).toBe(1800);
  });

  it("computes surplus when intake exceeds maintenance expenditure", () => {
    const result = calcDayBalance("2026-03-15", "Sat", 2500, 1900);
    expect(result.balance).toBe(-600);
  });

  it("a day eaten exactly at maintenance reads ~0 balance (NUTR-H1)", () => {
    const result = calcDayBalance("2026-03-15", "Sat", 2700, 2700);
    expect(result.balance).toBe(0);
  });
});

describe("getBalanceColor", () => {
  /* A day that went the goal's way is the food orange, one that did not
     the muted grey; the bar's side of the line says deficit or surplus
     (DS10 call 4: no success green, no error red). */
  it("is the food orange for a deficit during a cut", () => {
    expect(getBalanceColor(300, "cut")).toBe(THEME.semantic.nutrition);
  });

  it("is grey for a surplus during a cut", () => {
    expect(getBalanceColor(-300, "cut")).toBe(THEME.chrome.grey);
  });

  it("is the food orange for a surplus during a lean bulk", () => {
    expect(getBalanceColor(-300, "lean bulk")).toBe(THEME.semantic.nutrition);
  });

  it("is grey for a deficit during a lean bulk", () => {
    expect(getBalanceColor(300, "lean bulk")).toBe(THEME.chrome.grey);
  });

  it("reads an unknown goal as a cut", () => {
    expect(getBalanceColor(300, undefined)).toBe(THEME.semantic.nutrition);
  });

  it("is never success green or the error red", () => {
    for (const b of [300, -300])
      for (const g of ["cut", "lean bulk", undefined])
        expect([THEME.success, THEME.danger]).not.toContain(
          getBalanceColor(b, g)
        );
  });
});
