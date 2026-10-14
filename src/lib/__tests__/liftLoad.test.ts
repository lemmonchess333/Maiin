import { describe, it, expect } from "vitest";
import {
  formatLoad,
  liftUnitLabel,
  loadIn,
  loadToKg,
  resolveLiftUnit,
  wholeLoadIn,
} from "../liftLoad";

describe("liftLoad (Lift18)", () => {
  it("reads only an explicit lb choice as lb", () => {
    expect(resolveLiftUnit("lbs")).toBe("lbs");
    for (const v of ["kg", undefined, null, "lb", "st", 2])
      expect(resolveLiftUnit(v)).toBe("kg");
    expect(liftUnitLabel("lbs")).toBe("lb");
    expect(liftUnitLabel("kg")).toBe("kg");
  });

  it("a load typed in lb reads back as typed", () => {
    for (const lb of [45, 95, 135, 137.5, 225, 315, 405, 2.5])
      expect(loadIn(loadToKg(lb, "lbs"), "lbs")).toBe(lb);
  });

  it("stores the exact kg, unrounded", () => {
    expect(loadToKg(135, "lbs")).toBeCloseTo(61.235, 3);
    expect(loadToKg(62.5, "kg")).toBe(62.5);
  });

  it("a kg load reads in lb to one decimal, in kg to two", () => {
    expect(formatLoad(60, "lbs")).toBe("132.3 lb");
    expect(formatLoad(20, "lbs")).toBe("44.1 lb");
    expect(formatLoad(61.25, "kg")).toBe("61.25 kg");
    expect(formatLoad(62.5, "kg")).toBe("62.5 kg");
    expect(formatLoad(60, "kg")).toBe("60 kg");
    // Float noise from arithmetic on the way in doesn't reach the screen.
    expect(formatLoad(0.1 + 0.2 + 59.7, "kg")).toBe("60 kg");
  });

  it("a load that isn't a number reads as nothing", () => {
    expect(loadIn(Number.NaN, "lbs")).toBe(0);
    expect(loadIn(Number.POSITIVE_INFINITY, "kg")).toBe(0);
  });
});

describe("wholeLoadIn (Lift18)", () => {
  it("rounds an estimate once, from kg", () => {
    expect(wholeLoadIn(100, "lbs")).toBe(220);
    expect(wholeLoadIn(102.4, "kg")).toBe(102);
    expect(wholeLoadIn(Number.NaN, "lbs")).toBe(0);
  });
});
