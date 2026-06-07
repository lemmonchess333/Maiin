import { describe, it, expect } from "vitest";
import {
  inferMostLikelyMealSlot,
  MEAL_ORDER,
  MEAL_LABELS,
} from "../mealConstants";

describe("inferMostLikelyMealSlot", () => {
  it("maps the local hour-of-day to the most likely meal slot", () => {
    // breakfast: midnight → 09:59
    expect(inferMostLikelyMealSlot(0)).toBe("breakfast");
    expect(inferMostLikelyMealSlot(7)).toBe("breakfast");
    expect(inferMostLikelyMealSlot(9)).toBe("breakfast");
    // lunch: 10:00 → 14:59
    expect(inferMostLikelyMealSlot(10)).toBe("lunch");
    expect(inferMostLikelyMealSlot(12)).toBe("lunch");
    expect(inferMostLikelyMealSlot(14)).toBe("lunch");
    // snacks: 15:00 → 16:59
    expect(inferMostLikelyMealSlot(15)).toBe("snacks");
    expect(inferMostLikelyMealSlot(16)).toBe("snacks");
    // dinner: 17:00 → 23:59
    expect(inferMostLikelyMealSlot(17)).toBe("dinner");
    expect(inferMostLikelyMealSlot(21)).toBe("dinner");
    expect(inferMostLikelyMealSlot(23)).toBe("dinner");
  });

  it("returns a valid, labelled meal slot for every hour", () => {
    for (let h = 0; h < 24; h++) {
      const slot = inferMostLikelyMealSlot(h);
      expect(MEAL_ORDER).toContain(slot);
      expect(MEAL_LABELS[slot]).toBeTruthy();
    }
  });
});
