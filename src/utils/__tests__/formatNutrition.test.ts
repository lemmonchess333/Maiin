/**
 * Tests for `formatNutrition.ts` — the calorie + macro number
 * formatters used across the Food, Home, History and Settings
 * surfaces.
 *
 * Consistent formatting matters: the same calorie value on two
 * different cards must render identically (2,933 — not 2933 in
 * one place and "2933 kcal" in another). Pin the contract here so
 * a regression in either branch surfaces immediately.
 */
import { describe, it, expect } from "vitest";
import {
  formatCalories,
  formatMacro,
  CALORIE_UNIT,
} from "../formatNutrition";

describe("formatCalories", () => {
  it("rounds to a whole number", () => {
    expect(formatCalories(2932.4)).toBe("2,932");
    expect(formatCalories(2932.6)).toBe("2,933");
  });

  it("adds a comma thousands separator", () => {
    /* The Food hero card displays calories at 48px display
       weight — without a separator "2933" reads as one
       continuous glyph rather than a number. */
    expect(formatCalories(1500)).toBe("1,500");
    expect(formatCalories(10000)).toBe("10,000");
  });

  it("does NOT add a separator below 1000", () => {
    expect(formatCalories(0)).toBe("0");
    expect(formatCalories(500)).toBe("500");
    expect(formatCalories(999)).toBe("999");
  });

  it("handles negative values (deficit displays)", () => {
    expect(formatCalories(-250)).toBe("-250");
  });
});

describe("formatMacro", () => {
  it("rounds to a whole number with no separator", () => {
    /* Macro values rarely exceed 999 (a 1000g+ macro doesn't
       happen in practice), so no thousands separator. */
    expect(formatMacro(135.4)).toBe("135");
    expect(formatMacro(135.6)).toBe("136");
  });

  it("handles zero", () => {
    expect(formatMacro(0)).toBe("0");
  });

  it("returns a plain string without a unit suffix", () => {
    /* The unit ('g') is rendered by the caller next to the number
       — the formatter doesn't include it. */
    expect(formatMacro(150)).toBe("150");
  });
});

describe("CALORIE_UNIT", () => {
  it("is the string 'kcal'", () => {
    /* Single source of truth so every screen agrees on the unit
       label. Pre-this, Food showed "kcal" and Home showed "cal" — a
       cosmetic inconsistency that mattered for a calorie-focused
       app. */
    expect(CALORIE_UNIT).toBe("kcal");
  });
});
