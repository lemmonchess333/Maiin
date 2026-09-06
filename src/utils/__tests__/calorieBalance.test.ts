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
  it("returns success (green) for deficit during cut", () => {
    const color = getBalanceColor(300, "cut");
    expect(color).toBe(THEME.success);
  });

  it("returns danger (red) for surplus during cut", () => {
    const color = getBalanceColor(-300, "cut");
    expect(color).toBe(THEME.danger);
  });

  it("returns success (green) for surplus during lean bulk", () => {
    const color = getBalanceColor(-300, "lean bulk");
    expect(color).toBe(THEME.success);
  });

  it("returns warning (amber) for deficit during lean bulk", () => {
    const color = getBalanceColor(300, "lean bulk");
    expect(color).toBe(THEME.warning);
  });

  it("defaults to cut-like behavior for undefined goal", () => {
    const color = getBalanceColor(300, undefined);
    expect(color).toBe(THEME.success);
  });
});
