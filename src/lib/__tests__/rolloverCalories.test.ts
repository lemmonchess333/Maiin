import { describe, it, expect, vi, afterEach } from "vitest";
import { calculateRollover } from "../rolloverCalories";

describe("calculateRollover", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns correct weekly budget", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-13")); // Friday
    const result = calculateRollover(2000, {});
    expect(result.weeklyBudget).toBe(14000);
  });

  it("carries over unused calories from previous days", () => {
    vi.useFakeTimers();
    // Friday March 13, 2026 — week started Monday March 9
    vi.setSystemTime(new Date("2026-03-13"));
    const dailyCalories: Record<string, number> = {
      "2026-03-09": 1500, // Mon: 500 under
      "2026-03-10": 1500, // Tue: 500 under
      "2026-03-11": 1500, // Wed: 500 under
      "2026-03-12": 1500, // Thu: 500 under
    };
    const result = calculateRollover(2000, dailyCalories);
    // 4 days elapsed, expected 8000, consumed 6000, rollover = 2000
    expect(result.underspendBuffer).toBe(2000);
    expect(result.adjustedTarget).toBe(4000);
  });

  it("does not create negative rollover when overeating", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-13")); // Friday
    const dailyCalories: Record<string, number> = {
      "2026-03-09": 2500,
      "2026-03-10": 2500,
      "2026-03-11": 2500,
      "2026-03-12": 2500,
    };
    const result = calculateRollover(2000, dailyCalories);
    expect(result.underspendBuffer).toBe(0);
    expect(result.adjustedTarget).toBe(2000);
  });

  it("returns zero rollover when all days hit target", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-13"));
    const dailyCalories: Record<string, number> = {
      "2026-03-09": 2000,
      "2026-03-10": 2000,
      "2026-03-11": 2000,
      "2026-03-12": 2000,
    };
    const result = calculateRollover(2000, dailyCalories);
    expect(result.underspendBuffer).toBe(0);
    expect(result.adjustedTarget).toBe(2000);
  });

  it("includes today consumption in weeklyConsumed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-13"));
    const dailyCalories: Record<string, number> = {
      "2026-03-13": 800,
    };
    const result = calculateRollover(2000, dailyCalories);
    expect(result.weeklyConsumed).toBe(800);
  });
});
