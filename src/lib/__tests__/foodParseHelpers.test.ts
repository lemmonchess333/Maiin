/**
 * Tests for the three pure helpers extracted from FoodAnalyzer.tsx
 * for the Open Food Facts barcode + AI macro-parsing pipelines.
 */
import { describe, it, expect } from "vitest";
import {
  safeNum,
  parseServingGrams,
  round1,
} from "../foodParseHelpers";

describe("safeNum", () => {
  it("returns finite numbers unchanged", () => {
    expect(safeNum(123)).toBe(123);
    expect(safeNum(0)).toBe(0);
    expect(safeNum(-45.6)).toBe(-45.6);
  });

  it("coerces numeric strings", () => {
    expect(safeNum("42")).toBe(42);
    expect(safeNum("3.14")).toBe(3.14);
  });

  it("returns 0 for NaN", () => {
    expect(safeNum(NaN)).toBe(0);
    expect(safeNum("not a number")).toBe(0);
  });

  it("returns 0 for Infinity and -Infinity", () => {
    expect(safeNum(Infinity)).toBe(0);
    expect(safeNum(-Infinity)).toBe(0);
  });

  it("returns 0 for null / undefined", () => {
    expect(safeNum(null)).toBe(0);
    expect(safeNum(undefined)).toBe(0);
  });

  it("returns 0 for object inputs", () => {
    /* Open Food Facts nutriments occasionally come back as { value:
       N, unit: "g" } objects on certain fields. The helper falls
       back to 0 rather than NaN. */
    expect(safeNum({ value: 5 })).toBe(0);
  });
});

describe("parseServingGrams", () => {
  it("parses 'Ng' shape directly", () => {
    expect(parseServingGrams("30g")).toBe(30);
    expect(parseServingGrams("100g")).toBe(100);
  });

  it("parses decimal grams", () => {
    expect(parseServingGrams("12.5g")).toBe(12.5);
    expect(parseServingGrams("0.5g")).toBe(0.5);
  });

  it("parses DECIMAL COMMAS — Open Food Facts is French-origin", () => {
    /* The dot cases above were the only decimals covered, and the
       dot-only pattern did not fail closed on a comma: it matched the
       FRACTIONAL digits as the whole serving. Every one of these read 5
       before the fix, so the error was 2.5x under, 6.5x under and 10x
       OVER respectively — wrong in both directions, which is why nothing
       downstream could have sanity-checked it. */
    expect(parseServingGrams("12,5 g")).toBe(12.5);
    expect(parseServingGrams("32,5 g")).toBe(32.5);
    expect(parseServingGrams("0,5 g")).toBe(0.5);
  });

  it("parses a comma decimal inside a longer serving string", () => {
    // The shape OFF actually stores: a portion description with the
    // grams in parentheses or trailing.
    expect(parseServingGrams("1 biscuit 12,5 g")).toBe(12.5);
    expect(parseServingGrams("1 barre (32,5 g)")).toBe(32.5);
  });

  it("does not treat a comma THOUSANDS separator as a fraction", () => {
    // "1,000 g" is a kilogram written the other way round. Reading it as
    // 1.0 g would be a 1000x error in the opposite direction to the bug
    // being fixed, so it is worth stating which reading this takes: the
    // fractional one, matching the database's own locale. A thousands
    // separator in a SERVING size is not a real OFF value — servings are
    // grams, not kilograms — and the alternative (guessing by digit
    // count) would reintroduce ambiguity for "1,500 g".
    expect(parseServingGrams("1,000 g")).toBe(1);
  });

  it("tolerates whitespace between number and unit", () => {
    expect(parseServingGrams("30 g")).toBe(30);
    expect(parseServingGrams("100  g")).toBe(100);
  });

  it("is case-insensitive on the 'g' unit", () => {
    expect(parseServingGrams("30G")).toBe(30);
  });

  it("extracts grams from compound strings (e.g. '1 bar (45g)')", () => {
    /* Open Food Facts strings like "1 bar (45g)" should pick up
       the 45g portion. */
    expect(parseServingGrams("1 bar (45g)")).toBe(45);
  });

  it("returns null when there are no grams in the string", () => {
    expect(parseServingGrams("100 ml")).toBeNull();
    expect(parseServingGrams("1 cup")).toBeNull();
    expect(parseServingGrams("")).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(parseServingGrams(undefined)).toBeNull();
  });

  it("returns null for zero or negative grams", () => {
    /* Defensive: 0g serving doesn't make sense as a portion. */
    expect(parseServingGrams("0g")).toBeNull();
  });
});

describe("round1", () => {
  it("rounds to one decimal place", () => {
    expect(round1(3.14)).toBe(3.1);
    expect(round1(3.15)).toBe(3.2);
    expect(round1(3.17)).toBe(3.2);
  });

  it("returns integers unchanged", () => {
    expect(round1(5)).toBe(5);
    expect(round1(0)).toBe(0);
  });

  it("handles negative values", () => {
    expect(round1(-3.14)).toBe(-3.1);
  });

  it("rounds half-up via Math.round (banker's avoidance)", () => {
    /* The macro totals expect 12.55 → 12.6, not 12.5 from banker's
       rounding. Pin the Math.round behaviour. */
    expect(round1(12.55)).toBeCloseTo(12.6, 5);
  });
});
