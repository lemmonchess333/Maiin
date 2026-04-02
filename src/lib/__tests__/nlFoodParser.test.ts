import { describe, it, expect } from "vitest";
import { parseFoodText, getFoodSuggestions } from "@/lib/nlFoodParser";

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
    const result = parseFoodText("xylophone");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: "Xylophone",
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      unrecognized: true,
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

  it("handles number glued to food name (no space): '2chocolate bars'", () => {
    const result = parseFoodText("2chocolate bars");
    expect(result).toHaveLength(1);
    expect(result[0].calories).toBeGreaterThan(0);
  });

  it("handles typos via fuzzy matching: 'chciken' → chicken", () => {
    const result = parseFoodText("chciken");
    expect(result).toHaveLength(1);
    expect(result[0].calories).toBe(165);
  });

  it("handles depluralized forms: 'chocolate bars' → chocolate", () => {
    const result = parseFoodText("chocolate bar");
    expect(result).toHaveLength(1);
    expect(result[0].calories).toBeGreaterThan(0);
  });
});

describe("getFoodSuggestions", () => {
  it("returns [] for short input", () => {
    expect(getFoodSuggestions("")).toEqual([]);
    expect(getFoodSuggestions("a")).toEqual([]);
  });

  it("returns suggestions for partial input 'choc'", () => {
    const results = getFoodSuggestions("choc");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.name.toLowerCase().includes("chocolate"))).toBe(true);
    expect(results[0]).toHaveProperty("serving");
  });

  it("returns suggestions for input with leading number '2choc'", () => {
    const results = getFoodSuggestions("2choc");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.name.toLowerCase().includes("chocolate"))).toBe(true);
  });

  it("returns fuzzy suggestions for typos 'chiken'", () => {
    const results = getFoodSuggestions("chiken");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.name.toLowerCase().includes("chicken"))).toBe(true);
  });

  it("limits results to the specified limit", () => {
    const results = getFoodSuggestions("ch", 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });
});
