import { describe, it, expect } from "vitest";
import { LB_PER_KG, kgToLb, lbToKg, formatWeightInUnit } from "../weightUnits";

describe("weightUnits — the one kg ↔ lb conversion", () => {
  it("uses the 2.20462 factor both ways", () => {
    expect(LB_PER_KG).toBe(2.20462);
    expect(kgToLb(70)).toBeCloseTo(154.32, 2);
    expect(lbToKg(kgToLb(82.5))).toBeCloseTo(82.5, 10);
  });

  it("formats a stored kg weight to one decimal in the display unit", () => {
    expect(formatWeightInUnit(82.5, "kg")).toBe("82.5");
    expect(formatWeightInUnit(82.5, "lbs")).toBe("181.9");
    expect(formatWeightInUnit(70, "kg")).toBe("70.0");
  });
});
