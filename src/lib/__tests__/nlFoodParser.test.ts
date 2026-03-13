import { describe, it, expect } from "vitest";
import { parseFoodText } from "@/lib/nlFoodParser";

describe("parseFoodText", () => {
  it("returns [] for empty input", () => {
    expect(parseFoodText("")).toEqual([]);
    expect(parseFoodText("   ")).toEqual([]);
  });

  it("parses a single food item with correct macros", () => {
    const result = parseFoodText("chicken");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: "Chicken",
      calories: 165,
      protein: 31,
      carbs: 0,
      fat: 4,
    });
  });

  it("applies quantity multiplier", () => {
    const result = parseFoodText("2 eggs");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: "Eggs (x2)",
      calories: 156,
      protein: 12,
      carbs: 2,
      fat: 10,
    });
  });

  it("handles compound 'with' foods by summing macros", () => {
    const result = parseFoodText("toast with butter");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: "Toast with butter",
      calories: 180,
      protein: 3,
      carbs: 14,
      fat: 12,
    });
  });

  it("splits multiple comma-separated items", () => {
    const result = parseFoodText("2 eggs, toast");
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Eggs (x2)");
    expect(result[1].name).toBe("Toast");
  });

  it("returns zero macros for unknown food", () => {
    const result = parseFoodText("sushi");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: "Sushi",
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
  });

  it("matches food names case-insensitively", () => {
    const result = parseFoodText("CHICKEN");
    expect(result).toHaveLength(1);
    expect(result[0].calories).toBe(165);
    expect(result[0].protein).toBe(31);
    expect(result[0].carbs).toBe(0);
    expect(result[0].fat).toBe(4);
  });
});
