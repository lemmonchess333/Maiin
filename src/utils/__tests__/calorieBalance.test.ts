import { describe, it, expect } from "vitest";
import {
  calcDayBalance,
  getBalanceColor,
  getPhaseAlignment,
} from "../calorieBalance";
import { THEME } from "@/lib/theme";

// The near-maintenance band is ±200 kcal/day (the module's documented
// threshold). Pinned as a literal so the boundary tests hold the BEHAVIOUR;
// importing the module's own constant would only pin consistency with itself.
const NEAR_MAINTENANCE_KCAL = 200;

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

/* Hist5c pin 5 — phase × actual-trend reconciliation table.
   Balance convention: positive avgBalance = deficit. */
describe("getPhaseAlignment", () => {
  describe("lean bulk goal", () => {
    it("flags deficit as at-odds (below maintenance)", () => {
      const result = getPhaseAlignment("lean bulk", 500);
      expect(result?.state).toBe("at-odds");
      expect(result?.message).toBe("~500 kcal/day below maintenance");
    });

    it("flags surplus as on-track (gaining as planned)", () => {
      const result = getPhaseAlignment("lean bulk", -500);
      expect(result?.state).toBe("on-track");
      expect(result?.message).toMatch(/gaining as planned/i);
    });

    it("treats near-maintenance as maintaining (within ±200)", () => {
      const result = getPhaseAlignment("lean bulk", 100);
      expect(result?.state).toBe("maintaining");
      expect(result?.message).toMatch(/near maintenance/i);
    });
  });

  describe("cut goal", () => {
    it("flags surplus as at-odds (above maintenance)", () => {
      const result = getPhaseAlignment("cut", -500);
      expect(result?.state).toBe("at-odds");
      expect(result?.message).toBe("~500 kcal/day above maintenance");
    });

    it("flags deficit as on-track (losing as planned)", () => {
      const result = getPhaseAlignment("cut", 500);
      expect(result?.state).toBe("on-track");
      expect(result?.message).toMatch(/losing as planned/i);
    });

    it("treats near-maintenance as maintaining", () => {
      const result = getPhaseAlignment("cut", -100);
      expect(result?.state).toBe("maintaining");
      expect(result?.message).toMatch(/near maintenance/i);
    });
  });

  describe("recomp goal", () => {
    it("returns maintaining regardless of direction (small deficit)", () => {
      const result = getPhaseAlignment("recomp", 300);
      expect(result?.state).toBe("maintaining");
      expect(result?.message).toMatch(/small fluctuations/i);
    });

    it("returns maintaining regardless of direction (small surplus)", () => {
      const result = getPhaseAlignment("recomp", -300);
      expect(result?.state).toBe("maintaining");
      expect(result?.message).toMatch(/small fluctuations/i);
    });
  });

  describe("no goal / maintain", () => {
    it("returns null for undefined goal", () => {
      expect(getPhaseAlignment(undefined, 500)).toBeNull();
    });

    it("returns null for maintain goal", () => {
      expect(getPhaseAlignment("maintain", 500)).toBeNull();
    });
  });

  describe("threshold boundary", () => {
    it("exactly at +threshold counts as maintaining (bulk)", () => {
      const result = getPhaseAlignment("lean bulk", NEAR_MAINTENANCE_KCAL);
      expect(result?.state).toBe("maintaining");
    });

    it("just above threshold is at-odds (bulk + deficit)", () => {
      const result = getPhaseAlignment("lean bulk", NEAR_MAINTENANCE_KCAL + 1);
      expect(result?.state).toBe("at-odds");
    });
  });
});
