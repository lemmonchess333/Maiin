import { describe, it, expect } from "vitest";
import {
  computeNutritionBadgeDays,
  MACRO_TARGET_BAND,
  type DayMacros,
  type DayWater,
} from "../nutritionBadgeDays";

const macros = (protein: number, carbs: number, fat: number): DayMacros => ({
  protein,
  carbs,
  fat,
});

describe("computeNutritionBadgeDays — macroMasterDays", () => {
  const target = macros(160, 200, 60);

  it("counts a day with all macros within ±5%", () => {
    const totals = new Map([["2026-06-10", macros(160, 205, 58)]]); // all ≤5% off
    const targets = new Map([["2026-06-10", target]]);
    const r = computeNutritionBadgeDays(totals, targets, new Map());
    expect(r.macroMasterDays).toEqual(["2026-06-10"]);
  });

  it("excludes a day where ONE macro is outside the band", () => {
    const totals = new Map([["2026-06-10", macros(160, 230, 60)]]); // carbs +15%
    const targets = new Map([["2026-06-10", target]]);
    expect(
      computeNutritionBadgeDays(totals, targets, new Map()).macroMasterDays
    ).toEqual([]);
  });

  it("excludes a day with no target snapshot (not judgeable)", () => {
    const totals = new Map([["2026-06-10", target]]);
    expect(
      computeNutritionBadgeDays(totals, new Map(), new Map()).macroMasterDays
    ).toEqual([]);
  });

  it("respects the exact ±5% boundary", () => {
    const targets = new Map([["d", macros(100, 100, 100)]]);
    const at5 = new Map([["d", macros(105, 95, 100)]]); // exactly 5%
    expect(
      computeNutritionBadgeDays(at5, targets, new Map()).macroMasterDays
    ).toEqual(["d"]);
    const over5 = new Map([["d", macros(106, 100, 100)]]); // 6%
    expect(
      computeNutritionBadgeDays(over5, targets, new Map()).macroMasterDays
    ).toEqual([]);
    expect(MACRO_TARGET_BAND).toBe(0.05);
  });
});

describe("computeNutritionBadgeDays — proteinHitDays", () => {
  it("includes days where protein meets OR exceeds target", () => {
    const totals = new Map([
      ["a", macros(160, 0, 0)], // exactly target
      ["b", macros(190, 0, 0)], // over
      ["c", macros(120, 0, 0)], // under
    ]);
    const targets = new Map([
      ["a", macros(160, 200, 60)],
      ["b", macros(160, 200, 60)],
      ["c", macros(160, 200, 60)],
    ]);
    const r = computeNutritionBadgeDays(totals, targets, new Map());
    expect(r.proteinHitDays.sort()).toEqual(["a", "b"]);
  });

  it("ignores a day whose target protein is 0", () => {
    const totals = new Map([["a", macros(50, 0, 0)]]);
    const targets = new Map([["a", macros(0, 0, 0)]]);
    expect(
      computeNutritionBadgeDays(totals, targets, new Map()).proteinHitDays
    ).toEqual([]);
  });
});

describe("computeNutritionBadgeDays — waterHitDays", () => {
  // Water "B" model — ml, not glasses (target 2000 ml = the old 8-glass goal).
  const water = (ml: number, target: number): DayWater => ({
    ml,
    target,
  });

  it("includes days where ml ≥ target (>0)", () => {
    const w = new Map([
      ["a", water(2000, 2000)],
      ["b", water(2500, 2000)],
      ["c", water(1250, 2000)],
      ["d", water(750, 0)], // no target → excluded
    ]);
    const r = computeNutritionBadgeDays(new Map(), new Map(), w);
    expect(r.waterHitDays.sort()).toEqual(["a", "b"]);
  });
});
