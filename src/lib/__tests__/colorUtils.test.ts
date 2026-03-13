import { describe, it, expect } from "vitest";
import { tint, macroColors } from "@/lib/colorUtils";

describe("tint", () => {
  it("converts hex to rgba with default opacity", () => {
    expect(tint("#ff0000")).toBe("rgba(255, 0, 0, 0.12)");
  });

  it("applies custom opacity", () => {
    expect(tint("#3b82f6", 0.5)).toBe("rgba(59, 130, 246, 0.5)");
  });
});

describe("macroColors", () => {
  it("has all 4 keys", () => {
    expect(macroColors).toHaveProperty("calories");
    expect(macroColors).toHaveProperty("protein");
    expect(macroColors).toHaveProperty("carbs");
    expect(macroColors).toHaveProperty("fat");
    expect(Object.keys(macroColors)).toHaveLength(4);
  });
});
