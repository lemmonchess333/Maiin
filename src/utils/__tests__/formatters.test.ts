import { describe, it, expect } from "vitest";
import {
  formatVolume,
  formatVolumeSub,
  formatDistance,
  formatStat,
  macroRingState,
} from "../formatters";

describe("formatVolume", () => {
  it("returns dash for zero", () => {
    expect(formatVolume(0)).toEqual({ value: "\u2014", unit: "" });
  });

  it("returns dash for negative", () => {
    expect(formatVolume(-100)).toEqual({ value: "\u2014", unit: "" });
  });

  it("formats sub-1000 with kg unit", () => {
    expect(formatVolume(500)).toEqual({ value: "500", unit: "kg" });
  });

  it("rounds sub-1000 values", () => {
    expect(formatVolume(892.7)).toEqual({ value: "893", unit: "kg" });
  });

  it("formats 1000+ with k suffix and no unit", () => {
    expect(formatVolume(1000)).toEqual({ value: "1.0k", unit: "" });
  });

  it("formats 1500 as 1.5k", () => {
    expect(formatVolume(1500)).toEqual({ value: "1.5k", unit: "" });
  });

  it("formats large volumes", () => {
    expect(formatVolume(14020)).toEqual({ value: "14.0k", unit: "" });
  });
});

describe("formatVolumeSub", () => {
  it("returns dash for zero", () => {
    expect(formatVolumeSub(0)).toBe("\u2014");
  });

  it("formats sub-1000 as Xkg vol", () => {
    expect(formatVolumeSub(500)).toBe("500kg vol");
  });

  it("formats 1000+ as X.Xk vol (no double unit)", () => {
    expect(formatVolumeSub(1500)).toBe("1.5k vol");
    expect(formatVolumeSub(14020)).toBe("14.0k vol");
  });

  it("never produces kkg", () => {
    const result = formatVolumeSub(1500);
    expect(result).not.toContain("kkg");
  });
});

describe("formatDistance", () => {
  it("returns dash for zero", () => {
    expect(formatDistance(0)).toBe("\u2014");
  });

  it("returns dash for null", () => {
    expect(formatDistance(null)).toBe("\u2014");
  });

  it("returns dash for undefined", () => {
    expect(formatDistance(undefined)).toBe("\u2014");
  });

  it("returns dash for negative", () => {
    expect(formatDistance(-1)).toBe("\u2014");
  });

  it("formats positive distance to 1 decimal", () => {
    expect(formatDistance(5.234)).toBe("5.2");
  });

  it("formats exact km", () => {
    expect(formatDistance(10)).toBe("10.0");
  });
});

describe("formatStat", () => {
  it("returns dash for zero", () => {
    expect(formatStat(0)).toBe("\u2014");
  });

  it("returns dash for null", () => {
    expect(formatStat(null)).toBe("\u2014");
  });

  it("formats positive value", () => {
    expect(formatStat(3)).toBe("3");
  });

  it("appends suffix", () => {
    expect(formatStat(78, "%")).toBe("78%");
  });
});

describe("macroRingState", () => {
  it("returns 0 pct and not done for zero value", () => {
    expect(macroRingState(0, 160)).toEqual({ pct: 0, done: false });
  });

  it("allows pct above 1 when over target", () => {
    expect(macroRingState(200, 160)).toEqual({ pct: 1.25, done: false });
  });

  it("caps pct at 1.3", () => {
    expect(macroRingState(300, 160)).toEqual({ pct: 1.3, done: false });
  });

  it("returns exact 1 at target (done)", () => {
    expect(macroRingState(160, 160)).toEqual({ pct: 1, done: true });
  });

  it("marks done within +10% of target", () => {
    const { pct, done } = macroRingState(170, 160);
    expect(pct).toBeCloseTo(1.0625);
    expect(done).toBe(true);
  });

  it("marks not done beyond +10% of target", () => {
    const { done } = macroRingState(180, 160);
    expect(done).toBe(false);
  });

  it("marks done at 90% of target", () => {
    const { pct, done } = macroRingState(144, 160);
    expect(pct).toBeCloseTo(0.9);
    expect(done).toBe(true);
  });

  it("marks not done below 90% of target", () => {
    const { done } = macroRingState(140, 160);
    expect(done).toBe(false);
  });

  it("marks done at 98% (within ±10% zone)", () => {
    const { done } = macroRingState(157, 160);
    expect(done).toBe(true);
  });

  it("marks done at 97.5% (within ±10% zone)", () => {
    const { done } = macroRingState(156, 160);
    expect(done).toBe(true);
  });

  it("handles zero target without divide-by-zero", () => {
    expect(macroRingState(0, 0)).toEqual({ pct: 0, done: false });
  });

  it("handles zero target with positive value (caps at 1.3)", () => {
    expect(macroRingState(50, 0)).toEqual({ pct: 1.3, done: false });
  });

  it("calculates correct percentage", () => {
    const { pct } = macroRingState(80, 160);
    expect(pct).toBeCloseTo(0.5);
  });
});
