import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({ auth: {}, db: {} }));

import { clampFoodName, FOOD_NAME_MAX } from "@/lib/mealEntry";

/**
 * Barcode lookups bring in product names of any length and the meal rules
 * bound none, so the cap is applied where meals are written.
 */
describe("clampFoodName", () => {
  it("keeps a name within the limit as typed, trimmed", () => {
    expect(clampFoodName("  Porridge with banana ")).toBe(
      "Porridge with banana"
    );
  });

  it("cuts a name past the limit to FOOD_NAME_MAX characters", () => {
    const long = "Tesco Finest ".repeat(20);
    const out = clampFoodName(long);
    expect(Array.from(out).length).toBeLessThanOrEqual(FOOD_NAME_MAX);
    expect(long.startsWith(out)).toBe(true);
  });

  it("never cuts through an emoji", () => {
    const name = "a".repeat(FOOD_NAME_MAX - 1) + "🍕🍕";
    const out = clampFoodName(name);
    expect(Array.from(out)).toHaveLength(FOOD_NAME_MAX);
    expect(out.endsWith("🍕")).toBe(true);
    expect(out).not.toMatch(/[\uD800-\uDBFF]$/);
  });
});
