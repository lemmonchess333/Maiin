import { describe, expect, it } from "vitest";
import {
  manualDistanceMetres,
  parseManualDistanceDraft,
} from "../manualDistanceDraft";

describe("manual distance input grammar and physical limits", () => {
  it.each([
    ["3.10", "mi", 4988.9664],
    [".5", "km", 500],
    ["5e-2", "km", 50],
    ["1E+2", "km", 100000],
    [" 03.100 ", "km", 3100],
    ["0.04", "mi", 64.37376],
  ] as const)("converts complete %s %s exactly once", (raw, unit, expected) => {
    expect(manualDistanceMetres(raw, unit)).toBeCloseTo(expected, 6);
  });

  it.each([
    "",
    "-",
    ".",
    "3.",
    "1e",
    "1e-",
    "0x10",
    "Infinity",
    "NaN",
    "3 km",
    "3,1",
    "1e999",
    "-1",
    "0.049",
    "100.001",
  ])("keeps partial, non-decimal and out-of-bounds %j unsavable", (raw) =>
    expect(manualDistanceMetres(raw, "km")).toBeNull()
  );

  it("retains raw editable text rather than parsing it during recovery", () => {
    expect(
      parseManualDistanceDraft({ version: 1, raw: "3.", unit: "mi" })
    ).toEqual({ version: 1, raw: "3.", unit: "mi" });
  });
});
