import { describe, it, expect } from "vitest";
import { estimateBMR, calcDayBalance, getBalanceColor } from "../calorieBalance";

describe("estimateBMR", () => {
  it("calculates BMR for male", () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
    expect(estimateBMR(80, 180, 30, "male")).toBe(1780);
  });

  it("calculates BMR for female", () => {
    // 10*60 + 6.25*165 - 5*25 - 161 = 600 + 1031.25 - 125 - 161 = 1345
    expect(estimateBMR(60, 165, 25, "female")).toBe(1345);
  });
});

describe("calcDayBalance", () => {
  it("computes deficit when burn exceeds intake", () => {
    const result = calcDayBalance("2026-03-15", "Sat", 1800, 1700, 400);
    expect(result.balance).toBe(300);
    expect(result.burned).toBe(2100);
    expect(result.consumed).toBe(1800);
  });

  it("computes surplus when intake exceeds burn", () => {
    const result = calcDayBalance("2026-03-15", "Sat", 2500, 1700, 200);
    expect(result.balance).toBe(-600);
  });
});

describe("getBalanceColor", () => {
  it("returns success (green) for deficit during cut", () => {
    const color = getBalanceColor(300, "cut");
    expect(color).toBe("#34D399");
  });

  it("returns danger (red) for surplus during cut", () => {
    const color = getBalanceColor(-300, "cut");
    expect(color).toBe("#EF4444");
  });

  it("returns success (green) for surplus during lean bulk", () => {
    const color = getBalanceColor(-300, "lean bulk");
    expect(color).toBe("#34D399");
  });

  it("returns warning (amber) for deficit during lean bulk", () => {
    const color = getBalanceColor(300, "lean bulk");
    expect(color).toBe("#FFB547");
  });

  it("defaults to cut-like behavior for undefined goal", () => {
    const color = getBalanceColor(300, undefined);
    expect(color).toBe("#34D399");
  });
});
