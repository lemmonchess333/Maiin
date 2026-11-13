import { describe, it, expect } from "vitest";
import { isRangeOpen, lockedRanges } from "../historyAccess";

describe("historyAccess (whole-app grill Q84)", () => {
  it("free charts reach 3 months, and no further", () => {
    for (const range of ["1W", "1M", "3M"])
      expect(isRangeOpen(range, false)).toBe(true);
    for (const range of ["6M", "1Y", "All"])
      expect(isRangeOpen(range, false)).toBe(false);
  });

  it("Pro opens every range", () => {
    for (const range of ["1W", "1M", "3M", "6M", "1Y", "All"])
      expect(isRangeOpen(range, true)).toBe(true);
  });

  it("names the locked ranges of a picker", () => {
    expect(lockedRanges(["1W", "1M", "3M", "6M", "1Y"], false)).toEqual([
      "6M",
      "1Y",
    ]);
    expect(lockedRanges(["1W", "1M", "3M", "6M", "1Y"], true)).toEqual([]);
  });
});
