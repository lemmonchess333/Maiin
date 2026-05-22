import { describe, it, expect } from "vitest";
import {
  estimateBMR,
  calcDayBalance,
  getBalanceColor,
  getPhaseAlignment,
  NEAR_MAINTENANCE_THRESHOLD,
} from "../calorieBalance";
import { THEME } from "@/lib/theme";

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
    it("flags deficit as at-odds (eating below maintenance)", () => {
      const result = getPhaseAlignment("lean bulk", 500);
      expect(result?.state).toBe("at-odds");
      expect(result?.message).toMatch(/below maintenance/i);
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
    it("flags surplus as at-odds (eating above maintenance)", () => {
      const result = getPhaseAlignment("cut", -500);
      expect(result?.state).toBe("at-odds");
      expect(result?.message).toMatch(/above maintenance/i);
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
      const result = getPhaseAlignment("lean bulk", NEAR_MAINTENANCE_THRESHOLD);
      expect(result?.state).toBe("maintaining");
    });

    it("just above threshold is at-odds (bulk + deficit)", () => {
      const result = getPhaseAlignment("lean bulk", NEAR_MAINTENANCE_THRESHOLD + 1);
      expect(result?.state).toBe("at-odds");
    });
  });
});
